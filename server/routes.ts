import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

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
