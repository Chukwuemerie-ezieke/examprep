import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import type { ZodError, ZodTypeAny } from "zod";
import passport from "passport";
import { storage } from "./storage";
import type { Question, User } from "@shared/schema";
import {
  insertQuizSessionSchema,
  insertQuestionSchema,
  insertStudyTipSchema,
  insertSubjectSchema,
  insertTopicSchema,
  signupSchema,
  loginSchema,
  profileUpdateSchema,
} from "@shared/schema";
import { hashPassword } from "./auth";
import { gradeSubmission } from "./grading";
import { computeAnalytics } from "./analytics";
import { computeLeaderboard, LEADERBOARD_MIN_SESSIONS, LEADERBOARD_LIMIT } from "./leaderboard";
import { normalizeQuestion, computeDedupeKey, type RawRecord } from "./ingest/normalize";
import { parseCsv, csvRowToRaw } from "./ingest/adapters";
import { createResolutionContext } from "./ingest/resolve";

// Strip answer-revealing fields (correctAnswer, explanation, textbookRef) from a
// question so it is safe to send to the client during an active CBT quiz.
// imageUrl is intentionally preserved (it is spread through `safe`): an image is
// part of the question prompt, not an answer, so it must be visible pre-submit.
function sanitizeQuestionForCbt(q: Question) {
  const { correctAnswer, explanation, textbookRef, ...safe } = q;
  return safe;
}

// Upper bound on how many questions any list endpoint / grader will return or
// process in one request. Guards against an unbounded client `limit`.
const MAX_QUESTION_LIMIT = 200;

// Clamp a requested limit to a sane range. Falls back to `fallback` when the
// value is missing or not a positive integer.
function clampLimit(raw: string | undefined, fallback: number): number {
  const n = raw ? parseInt(raw, 10) : fallback;
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.min(n, MAX_QUESTION_LIMIT);
}

// Body schema for server-side CBT grading. `questionIds` is the full ordered set
// of questions that were served for the quiz (answered or not), so grading and
// the review cover every question - skipped ones count as incorrect. `answers`
// maps a question id (as a string key) to the selected option letter.
const gradeSubmissionSchema = z.object({
  questionIds: z.array(z.number().int().positive()).max(MAX_QUESTION_LIMIT).optional(),
  answers: z.record(z.string(), z.string()),
  timeSpentSeconds: z.number().int().nonnegative().optional(),
});

// Top-level envelope for the name-aware question import endpoint. `format`
// selects the parser; `data` is CSV text (string) for 'csv', or a JSON array
// (or a JSON string of an array) for 'json'. Per-row validation is handled by
// the pure normalizer, not here.
const importEnvelopeSchema = z.object({
  format: z.enum(["csv", "json"]),
  data: z.union([z.string(), z.array(z.unknown())]),
});

// Require an authenticated session. Fails safe: 401 when not logged in.
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

// Role-based admin authorization. Admin access is now derived from the
// authenticated user's `isAdmin` flag (Phase 2 replaces the legacy
// x-admin-password header check). Fails safe: unauthenticated or non-admin
// users are rejected with 401.
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated() && (req.user as User)?.isAdmin) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

// Remove the password hash before returning a user object to a client.
function safeUser(user: User) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// Rate limiter for admin/auth-sensitive routes. 15 minute window.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

// Stricter limiter for the password verification endpoint to slow brute force.
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: "Too many attempts, please try again later." },
});

function formatZodError(error: ZodError) {
  return fromError(error).toString();
}

// Validate a request body against a Zod schema; on failure send a 400 and
// return undefined so the caller can bail out.
function validateBody<T extends ZodTypeAny>(
  schema: T,
  req: Request,
  res: Response,
): ReturnType<T["parse"]> | undefined {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "Validation failed",
      errors: formatZodError(result.error),
    });
    return undefined;
  }
  return result.data as ReturnType<T["parse"]>;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ============ AUTH ROUTES ============

  // Sign up: validate, reject duplicate email (409), hash the password, create
  // the user, log them in, and return the safe user (no passwordHash).
  app.post("/api/auth/signup", verifyLimiter, async (req, res, next) => {
    const data = validateBody(signupSchema, req, res);
    if (!data) return;
    const email = data.email.toLowerCase();
    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const passwordHash = await hashPassword(data.password);
    const user = await storage.createUser({
      email,
      passwordHash,
      displayName: data.displayName ?? null,
    });
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(safeUser(user));
    });
  });

  // Log in with passport-local. Returns the safe user on success, 401 on
  // failure.
  app.post("/api/auth/login", verifyLimiter, (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(parsed.error),
      });
    }
    // Normalize email casing to match how signup stores it.
    req.body.email = String(parsed.data.email).toLowerCase();
    passport.authenticate("local", (err: unknown, user: User | false) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json(safeUser(user));
      });
    })(req, res, next);
  });

  // Log out: clear the passport login and destroy the session.
  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  // Current authenticated user (safe shape) or 401 when not logged in. The safe
  // shape now includes showOnLeaderboard + displayName (both spread through
  // safeUser, which only strips passwordHash).
  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      return res.json(safeUser(req.user as User));
    }
    return res.status(401).json({ message: "Unauthorized" });
  });

  // Update the authenticated user's editable profile: leaderboard opt-in and/or
  // display name. requireAuth (401 when unauthenticated); scoped to the caller's
  // own id. Returns the updated safe user (no passwordHash).
  app.patch("/api/auth/me", requireAuth, adminLimiter, async (req, res) => {
    const data = validateBody(profileUpdateSchema, req, res);
    if (!data) return;
    const updated = await storage.updateUserProfile((req.user as User).id, data);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(safeUser(updated));
  });

  // ============ END AUTH ROUTES ============

  // Exam bodies
  app.get("/api/exam-bodies", async (_req, res) => {
    const bodies = await storage.getExamBodies();
    res.json(bodies);
  });

  // Subjects
  app.get("/api/subjects", async (_req, res) => {
    const subjs = await storage.getSubjects();
    res.json(subjs);
  });

  // Topics for a subject
  app.get("/api/subjects/:subjectId/topics", async (req, res) => {
    const subjectId = parseInt(String(req.params.subjectId));
    const topicsList = await storage.getTopics(subjectId);
    res.json(topicsList);
  });

  // Questions with filters
  app.get("/api/questions", async (req, res) => {
    const filters = {
      examBodyId: req.query.examBodyId ? parseInt(req.query.examBodyId as string) : undefined,
      subjectId: req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined,
      topicId: req.query.topicId ? parseInt(req.query.topicId as string) : undefined,
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      difficulty: req.query.difficulty as string | undefined,
      limit: clampLimit(req.query.limit as string | undefined, 50),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const qs = await storage.getQuestions(filters);
    const total = await storage.getQuestionCount(filters);
    res.json({ questions: qs, total });
  });

  // Sanitized questions for CBT/exam mode. Same filtered set as /api/questions
  // but with correctAnswer/explanation/textbookRef stripped so answers are never
  // exposed to the client during an active quiz. Grading happens server-side.
  app.get("/api/quiz/questions", async (req, res) => {
    const filters = {
      examBodyId: req.query.examBodyId ? parseInt(req.query.examBodyId as string) : undefined,
      subjectId: req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined,
      topicId: req.query.topicId ? parseInt(req.query.topicId as string) : undefined,
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      difficulty: req.query.difficulty as string | undefined,
      limit: clampLimit(req.query.limit as string | undefined, 50),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const qs = await storage.getQuestions(filters);
    const total = await storage.getQuestionCount(filters);
    res.json({ questions: qs.map(sanitizeQuestionForCbt), total });
  });

  // Single question
  app.get("/api/questions/:id", async (req, res) => {
    const id = parseInt(String(req.params.id));
    const q = await storage.getQuestion(id);
    if (!q) return res.status(404).json({ message: "Question not found" });
    res.json(q);
  });

  // Available years
  app.get("/api/years", async (req, res) => {
    const examBodyId = req.query.examBodyId ? parseInt(req.query.examBodyId as string) : undefined;
    const subjectId = req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined;
    const years = await storage.getAvailableYears(examBodyId, subjectId);
    res.json(years);
  });

  // Study tips
  app.get("/api/study-tips", async (req, res) => {
    const subjectId = parseInt(req.query.subjectId as string);
    const topicId = req.query.topicId ? parseInt(req.query.topicId as string) : undefined;
    if (!subjectId) return res.status(400).json({ message: "subjectId required" });
    const tips = await storage.getStudyTips(subjectId, topicId);
    res.json(tips);
  });

  // Quiz sessions. All scoped to the authenticated user.
  app.get("/api/quiz-sessions", requireAuth, async (req, res) => {
    const sessions = await storage.getQuizSessions((req.user as User).id);
    res.json(sessions);
  });

  app.get("/api/quiz-sessions/:id", requireAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const session = await storage.getQuizSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.userId !== (req.user as User).id) {
      return res.status(404).json({ message: "Session not found" });
    }
    res.json(session);
  });

  app.post("/api/quiz-sessions", requireAuth, async (req, res) => {
    const data = validateBody(insertQuizSessionSchema, req, res);
    if (!data) return;
    // userId is always taken from the session, never from the request body.
    const session = await storage.createQuizSession({ ...data, userId: (req.user as User).id });
    res.json(session);
  });

  app.patch("/api/quiz-sessions/:id", requireAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const result = insertQuizSessionSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(result.error),
      });
    }
    const existing = await storage.getQuizSession(id);
    if (!existing || existing.userId !== (req.user as User).id) {
      return res.status(404).json({ message: "Session not found" });
    }
    const session = await storage.updateQuizSession(id, result.data);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  // Server-side CBT grading. Accepts the submitted answers, computes the score
  // against the stored correct answers, persists the session, and returns the
  // review payload. Correct answers/explanations are revealed ONLY here.
  app.post("/api/quiz-sessions/:id/submit", requireAuth, async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) {
      return res.status(404).json({ message: "Session not found" });
    }
    const session = await storage.getQuizSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.userId !== (req.user as User).id) {
      return res.status(404).json({ message: "Session not found" });
    }

    const data = validateBody(gradeSubmissionSchema, req, res);
    if (!data) return;

    const { questionIds, answers, timeSpentSeconds } = data;

    // Grade against the FULL served question set, not just the answered ones.
    // The pure grader falls back to the answered ids for older clients, dedupes
    // while preserving order, counts skipped/unknown ids as incorrect within the
    // denominator, and reveals correctAnswer/explanation only in the review.
    const { score, review } = await gradeSubmission(
      { questionIds, answers },
      (qId) => storage.getQuestion(qId),
    );

    await storage.updateQuizSession(id, {
      answeredQuestions: Object.keys(answers).length,
      correctAnswers: score.correct,
      timeSpentSeconds: timeSpentSeconds ?? session.timeSpentSeconds,
      status: "completed",
      answersJson: JSON.stringify(answers),
    });

    res.json({ score, review });
  });

  // ============ ADMIN ROUTES (password protected) ============

  // Apply a rate limiter to all admin routes to guard against abuse.
  app.use("/api/admin", adminLimiter);

  // Verify admin access. Phase 2 replaces the legacy x-admin-password check with
  // role-based authorization: admin status is derived from the authenticated
  // user's session role. Returns { ok:true } only for a logged-in admin.
  app.post("/api/admin/verify", verifyLimiter, (req, res) => {
    if (req.isAuthenticated && req.isAuthenticated() && (req.user as User)?.isAdmin) {
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false });
  });

  // Admin: list all study tips (without subjectId filter)
  app.get("/api/admin/study-tips", requireAdmin, async (_req, res) => {
    const tips = await storage.getAllStudyTips();
    res.json(tips);
  });

  // Admin: list all topics (across all subjects)
  app.get("/api/admin/topics", requireAdmin, async (_req, res) => {
    const subjs = await storage.getSubjects();
    const all = [];
    for (const s of subjs) {
      const ts = await storage.getTopics(s.id);
      all.push(...ts);
    }
    res.json(all);
  });

  // Question CRUD
  app.post("/api/admin/questions", requireAdmin, async (req, res) => {
    const data = validateBody(insertQuestionSchema, req, res);
    if (!data) return;
    try {
      const q = await storage.createQuestion(data);
      res.json(q);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const result = insertQuestionSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(result.error),
      });
    }
    const q = await storage.updateQuestion(id, result.data);
    if (!q) return res.status(404).json({ message: "Not found" });
    res.json(q);
  });
  app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const ok = await storage.deleteQuestion(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // Bulk question import (array of questions)
  app.post("/api/admin/questions/bulk", requireAdmin, async (req, res) => {
    const items = Array.isArray(req.body) ? req.body : [];
    let created = 0;
    const errors: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const parsed = insertQuestionSchema.safeParse(items[i]);
      if (!parsed.success) {
        errors.push(`Row ${i + 1}: ${formatZodError(parsed.error)}`);
        continue;
      }
      try {
        await storage.createQuestion(parsed.data);
        created++;
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }
    res.json({ created, total: items.length, errors });
  });

  // Name-aware question import. Accepts CSV text or a JSON array, resolves exam
  // bodies/subjects/topics by NAME (numeric ids still accepted for back-compat),
  // auto-creates unknown subjects/topics, rejects unknown exam bodies, and
  // de-duplicates against existing questions. Returns a per-row report. The
  // legacy /bulk route above is intentionally left unchanged.
  app.post("/api/admin/questions/import", requireAdmin, async (req, res) => {
    const envelope = validateBody(importEnvelopeSchema, req, res);
    if (!envelope) return;

    // Parse the envelope's data into a flat RawRecord[] per the declared format.
    let records: RawRecord[];
    try {
      if (envelope.format === "csv") {
        if (typeof envelope.data !== "string") {
          return res.status(400).json({ message: "For format 'csv', data must be a CSV string." });
        }
        records = parseCsv(envelope.data).map(csvRowToRaw);
      } else {
        // format === 'json': data is a JSON array, or a JSON string of an array.
        let arr: unknown = envelope.data;
        if (typeof arr === "string") {
          try {
            arr = JSON.parse(arr);
          } catch {
            return res.status(400).json({ message: "For format 'json', data string must be valid JSON." });
          }
        }
        if (!Array.isArray(arr)) {
          return res.status(400).json({ message: "For format 'json', data must be an array." });
        }
        records = arr as RawRecord[];
      }
    } catch (e: any) {
      return res.status(400).json({ message: e?.message ?? "Failed to parse import data." });
    }

    // Build the DB-backed ResolutionContext once (pre-pass auto-creates missing
    // subjects/topics), then normalize + dedupe + persist each record.
    let created = 0;
    let skippedDuplicates = 0;
    const errors: { row: number; message: string }[] = [];
    try {
      const ctx = await createResolutionContext(storage, records);
      for (let i = 0; i < records.length; i++) {
        const row = i + 1; // 1-based row number for reporting.
        const result = normalizeQuestion(records[i], ctx);
        if (!result.ok) {
          errors.push({ row, message: result.error });
          continue;
        }
        // Per-row try/catch so a single bad insert cannot abort the batch.
        try {
          const dup = await storage.findDuplicateQuestion({
            questionText: result.value.questionText,
            examBodyId: result.value.examBodyId,
            subjectId: result.value.subjectId,
            year: result.value.year,
          });
          if (dup) {
            skippedDuplicates++;
            continue;
          }
          await storage.createQuestion(result.value);
          created++;
        } catch (e: any) {
          errors.push({ row, message: e?.message ?? "Failed to persist row." });
        }
      }
    } catch (e: any) {
      return res.status(500).json({ message: e?.message ?? "Import failed." });
    }

    res.json({ created, skippedDuplicates, total: records.length, errors });
  });

  // Study tip CRUD
  app.post("/api/admin/study-tips", requireAdmin, async (req, res) => {
    const data = validateBody(insertStudyTipSchema, req, res);
    if (!data) return;
    try {
      const t = await storage.createStudyTip(data);
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/study-tips/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const result = insertStudyTipSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(result.error),
      });
    }
    const t = await storage.updateStudyTip(id, result.data);
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json(t);
  });
  app.delete("/api/admin/study-tips/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const ok = await storage.deleteStudyTip(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // Subject create/update
  app.post("/api/admin/subjects", requireAdmin, async (req, res) => {
    const data = validateBody(insertSubjectSchema, req, res);
    if (!data) return;
    try {
      const s = await storage.createSubject(data);
      res.json(s);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/subjects/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const result = insertSubjectSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(result.error),
      });
    }
    const s = await storage.updateSubject(id, result.data);
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  });

  // Topic create/delete
  app.post("/api/admin/topics", requireAdmin, async (req, res) => {
    const data = validateBody(insertTopicSchema, req, res);
    if (!data) return;
    try {
      const t = await storage.createTopic(data);
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.delete("/api/admin/topics/:id", requireAdmin, async (req, res) => {
    const id = parseInt(String(req.params.id));
    const ok = await storage.deleteTopic(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // ============ END ADMIN ROUTES ============

  // Stats endpoint. App-wide catalog counts (totalQuestions/totalExamBodies/
  // totalSubjects) are always global. Personal stats (totalSessions/
  // completedSessions/averageScore) are computed ONLY from the authenticated
  // user's sessions; unauthenticated callers get zeroed personal stats so the
  // home page can render without requiring login.
  //
  // Response shape (for FEAT-002 to match):
  //   {
  //     totalQuestions: number,      // global catalog
  //     totalExamBodies: number,     // global catalog
  //     totalSubjects: number,       // global catalog
  //     totalSessions: number,       // per-user (0 if unauthenticated)
  //     completedSessions: number,   // per-user (0 if unauthenticated)
  //     averageScore: number,        // per-user percentage (0 if none/unauthenticated)
  //   }
  app.get("/api/stats", async (req, res) => {
    const totalQuestions = await storage.getQuestionCount({});
    const examBodiesList = await storage.getExamBodies();
    const subjectsList = await storage.getSubjects();

    const isAuthed = !!(req.isAuthenticated && req.isAuthenticated() && req.user);
    const sessions = isAuthed
      ? await storage.getQuizSessions((req.user as User).id)
      : [];
    const completedSessions = sessions.filter(s => s.status === "completed");
    const avgScore = completedSessions.length > 0
      ? Math.round(completedSessions.reduce((sum, s) => sum + (s.correctAnswers / s.totalQuestions) * 100, 0) / completedSessions.length)
      : 0;

    res.json({
      totalQuestions,
      totalExamBodies: examBodiesList.length,
      totalSubjects: subjectsList.length,
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      averageScore: avgScore,
    });
  });

  // Per-user analytics. Read-only, requires auth (401 when unauthenticated).
  // Every query is scoped to the authenticated user's id, so no other user's
  // data is ever read. Returns an empty-safe payload (200, zeros/empty arrays)
  // for a user with no completed sessions. Shape mirrors the Analytics type in
  // server/analytics.ts: { trend, perSubject, perExamBody, overall, weakTopics }.
  app.get("/api/analytics", requireAuth, async (req, res) => {
    const userId = (req.user as User).id;
    const [completedSessions, topicAnswers] = await Promise.all([
      storage.getCompletedQuizSessions(userId),
      storage.getTopicAnswerRows(userId),
    ]);
    res.json(computeAnalytics(completedSessions, topicAnswers));
  });

  // Public leaderboard read. Optional examBodyId/subjectId int filters narrow
  // the ranking to sessions in that exam body / subject (NaN guarded to
  // undefined, matching the /api/questions filter parsing). `entries` is the
  // ranked, opted-in, threshold-passing top-N and never contains email or per-
  // session data. `me` (the caller's own self-standing) is included ONLY for an
  // authenticated caller, scoped to their own id; anonymous callers get
  // me: null so a self-row is never leaked.
  app.get("/api/leaderboard", async (req, res) => {
    const examBodyIdRaw = req.query.examBodyId ? parseInt(req.query.examBodyId as string) : undefined;
    const subjectIdRaw = req.query.subjectId ? parseInt(req.query.subjectId as string) : undefined;
    const filter = {
      examBodyId: examBodyIdRaw !== undefined && !Number.isNaN(examBodyIdRaw) ? examBodyIdRaw : undefined,
      subjectId: subjectIdRaw !== undefined && !Number.isNaN(subjectIdRaw) ? subjectIdRaw : undefined,
    };
    const rows = await storage.getLeaderboardRows(filter);
    const authed = !!(req.isAuthenticated && req.isAuthenticated() && req.user);
    const result = computeLeaderboard(rows, {
      minSessions: LEADERBOARD_MIN_SESSIONS,
      limit: LEADERBOARD_LIMIT,
      viewerUserId: authed ? (req.user as User).id : undefined,
    });
    // Defensive: never leak a self-row to anonymous callers.
    res.json(authed ? result : { entries: result.entries, me: null });
  });

  return httpServer;
}
