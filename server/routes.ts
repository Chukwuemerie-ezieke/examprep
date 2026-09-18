import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import type { ZodError, ZodTypeAny } from "zod";
import { storage } from "./storage";
import type { Question } from "@shared/schema";
import {
  insertQuizSessionSchema,
  insertQuestionSchema,
  insertStudyTipSchema,
  insertSubjectSchema,
  insertTopicSchema,
} from "@shared/schema";

// Strip answer-revealing fields (correctAnswer, explanation, textbookRef) from a
// question so it is safe to send to the client during an active CBT quiz.
function sanitizeQuestionForCbt(q: Question) {
  const { correctAnswer, explanation, textbookRef, ...safe } = q;
  return safe;
}

// Body schema for server-side CBT grading.
const gradeSubmissionSchema = z.object({
  answers: z.record(z.string(), z.string()),
  timeSpentSeconds: z.number().int().nonnegative().optional(),
});

// Admin password (set via env only; no default). When unset/empty, admin
// access fails safe: all admin routes reject with 401.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_ENABLED = typeof ADMIN_PASSWORD === "string" && ADMIN_PASSWORD.length > 0;

if (!ADMIN_ENABLED) {
  console.warn(
    "[security] ADMIN_PASSWORD is not configured; admin routes are DISABLED (all admin requests return 401). Set ADMIN_PASSWORD to enable them.",
  );
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Fail safe: if no admin secret is configured, deny all admin access.
  if (!ADMIN_ENABLED) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const pass = req.header("x-admin-password") || req.query.admin_password;
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
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
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
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
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
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

  // Quiz sessions
  app.get("/api/quiz-sessions", async (_req, res) => {
    const sessions = await storage.getQuizSessions();
    res.json(sessions);
  });

  app.get("/api/quiz-sessions/:id", async (req, res) => {
    const id = parseInt(String(req.params.id));
    const session = await storage.getQuizSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  app.post("/api/quiz-sessions", async (req, res) => {
    const data = validateBody(insertQuizSessionSchema, req, res);
    if (!data) return;
    const session = await storage.createQuizSession(data);
    res.json(session);
  });

  app.patch("/api/quiz-sessions/:id", async (req, res) => {
    const id = parseInt(String(req.params.id));
    const result = insertQuizSessionSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: formatZodError(result.error),
      });
    }
    const session = await storage.updateQuizSession(id, result.data);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  // Server-side CBT grading. Accepts the submitted answers, computes the score
  // against the stored correct answers, persists the session, and returns the
  // review payload. Correct answers/explanations are revealed ONLY here.
  app.post("/api/quiz-sessions/:id/submit", async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (Number.isNaN(id)) {
      return res.status(404).json({ message: "Session not found" });
    }
    const session = await storage.getQuizSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });

    const data = validateBody(gradeSubmissionSchema, req, res);
    if (!data) return;

    const { answers, timeSpentSeconds } = data;
    const questionIds = Object.keys(answers)
      .map((k) => parseInt(k, 10))
      .filter((n) => !Number.isNaN(n));

    let correct = 0;
    const review: Array<{
      questionId: number;
      questionText: string;
      options: { label: string; value: string }[];
      yourAnswer: string | null;
      correctAnswer: string;
      isCorrect: boolean;
      explanation: string;
    }> = [];

    for (const qId of questionIds) {
      const q = await storage.getQuestion(qId);
      if (!q) continue;
      const yourAnswer = answers[String(qId)] ?? null;
      const isCorrect = yourAnswer === q.correctAnswer;
      if (isCorrect) correct++;
      const options = [
        { label: "A", value: q.optionA },
        { label: "B", value: q.optionB },
        { label: "C", value: q.optionC },
        { label: "D", value: q.optionD },
        ...(q.optionE ? [{ label: "E", value: q.optionE }] : []),
      ];
      review.push({
        questionId: q.id,
        questionText: q.questionText,
        options,
        yourAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        explanation: q.explanation,
      });
    }

    const total = questionIds.length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    await storage.updateQuizSession(id, {
      answeredQuestions: Object.keys(answers).length,
      correctAnswers: correct,
      timeSpentSeconds: timeSpentSeconds ?? session.timeSpentSeconds,
      status: "completed",
      answersJson: JSON.stringify(answers),
    });

    res.json({
      score: { correct, total, percentage },
      review,
    });
  });

  // ============ ADMIN ROUTES (password protected) ============

  // Apply a rate limiter to all admin routes to guard against abuse.
  app.use("/api/admin", adminLimiter);

  // Verify admin password
  app.post("/api/admin/verify", verifyLimiter, (req, res) => {
    // Fail safe: if no admin secret is configured, deny all verification.
    if (!ADMIN_ENABLED) {
      return res.status(401).json({ ok: false });
    }
    const { password } = req.body ?? {};
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false });
    }
    res.json({ ok: true });
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

  // Stats endpoint
  app.get("/api/stats", async (_req, res) => {
    const totalQuestions = await storage.getQuestionCount({});
    const examBodiesList = await storage.getExamBodies();
    const subjectsList = await storage.getSubjects();
    const sessions = await storage.getQuizSessions();
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

  return httpServer;
}
