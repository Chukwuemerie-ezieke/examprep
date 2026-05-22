import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

// Admin password (set via env, falls back to default for dev)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "emy#olu@9988";

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const pass = req.header("x-admin-password") || req.query.admin_password;
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
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
    const subjectId = parseInt(req.params.subjectId);
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

  // Single question
  app.get("/api/questions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
    const session = await storage.getQuizSession(id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  app.post("/api/quiz-sessions", async (req, res) => {
    const session = await storage.createQuizSession(req.body);
    res.json(session);
  });

  app.patch("/api/quiz-sessions/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const session = await storage.updateQuizSession(id, req.body);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  });

  // ============ ADMIN ROUTES (password protected) ============

  // Verify admin password
  app.post("/api/admin/verify", (req, res) => {
    const { password } = req.body;
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
    try {
      const q = await storage.createQuestion(req.body);
      res.json(q);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const q = await storage.updateQuestion(id, req.body);
    if (!q) return res.status(404).json({ message: "Not found" });
    res.json(q);
  });
  app.delete("/api/admin/questions/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
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
      try {
        await storage.createQuestion(items[i]);
        created++;
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }
    res.json({ created, total: items.length, errors });
  });

  // Study tip CRUD
  app.post("/api/admin/study-tips", requireAdmin, async (req, res) => {
    try {
      const t = await storage.createStudyTip(req.body);
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/study-tips/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const t = await storage.updateStudyTip(id, req.body);
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json(t);
  });
  app.delete("/api/admin/study-tips/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const ok = await storage.deleteStudyTip(id);
    if (!ok) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  });

  // Subject create/update
  app.post("/api/admin/subjects", requireAdmin, async (req, res) => {
    try {
      const s = await storage.createSubject(req.body);
      res.json(s);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.patch("/api/admin/subjects/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const s = await storage.updateSubject(id, req.body);
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  });

  // Topic create/delete
  app.post("/api/admin/topics", requireAdmin, async (req, res) => {
    try {
      const t = await storage.createTopic(req.body);
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });
  app.delete("/api/admin/topics/:id", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
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
