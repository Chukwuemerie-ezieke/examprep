import {
  type ExamBody, type InsertExamBody, examBodies,
  type Subject, type InsertSubject, subjects,
  type Topic, type InsertTopic, topics,
  type Question, type InsertQuestion, questions,
  type StudyTip, type InsertStudyTip, studyTips,
  type QuizSession, type InsertQuizSession, quizSessions,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);

export interface IStorage {
  // Exam bodies
  getExamBodies(): Promise<ExamBody[]>;
  getExamBody(id: number): Promise<ExamBody | undefined>;
  createExamBody(body: InsertExamBody): Promise<ExamBody>;

  // Subjects
  getSubjects(): Promise<Subject[]>;
  getSubject(id: number): Promise<Subject | undefined>;
  createSubject(subject: InsertSubject): Promise<Subject>;

  // Topics
  getTopics(subjectId: number): Promise<Topic[]>;
  createTopic(topic: InsertTopic): Promise<Topic>;

  // Questions
  getQuestions(filters: {
    examBodyId?: number;
    subjectId?: number;
    topicId?: number;
    year?: number;
    difficulty?: string;
    limit?: number;
    offset?: number;
  }): Promise<Question[]>;
  getQuestion(id: number): Promise<Question | undefined>;
  getQuestionCount(filters: {
    examBodyId?: number;
    subjectId?: number;
    topicId?: number;
    year?: number;
  }): Promise<number>;
  getAvailableYears(examBodyId?: number, subjectId?: number): Promise<number[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuestion(id: number, updates: Partial<InsertQuestion>): Promise<Question | undefined>;
  deleteQuestion(id: number): Promise<boolean>;

  // Study tips
  getStudyTips(subjectId: number, topicId?: number): Promise<StudyTip[]>;
  getAllStudyTips(): Promise<StudyTip[]>;
  createStudyTip(tip: InsertStudyTip): Promise<StudyTip>;
  updateStudyTip(id: number, updates: Partial<InsertStudyTip>): Promise<StudyTip | undefined>;
  deleteStudyTip(id: number): Promise<boolean>;

  // Topic mutations
  deleteTopic(id: number): Promise<boolean>;

  // Subject mutations
  updateSubject(id: number, updates: Partial<InsertSubject>): Promise<Subject | undefined>;

  // Quiz sessions
  getQuizSessions(): Promise<QuizSession[]>;
  getQuizSession(id: number): Promise<QuizSession | undefined>;
  createQuizSession(session: InsertQuizSession): Promise<QuizSession>;
  updateQuizSession(id: number, updates: Partial<QuizSession>): Promise<QuizSession | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getExamBodies(): Promise<ExamBody[]> {
    return db.select().from(examBodies);
  }

  async getExamBody(id: number): Promise<ExamBody | undefined> {
    const rows = await db.select().from(examBodies).where(eq(examBodies.id, id));
    return rows[0];
  }

  async createExamBody(body: InsertExamBody): Promise<ExamBody> {
    const rows = await db.insert(examBodies).values(body).returning();
    return rows[0];
  }

  async getSubjects(): Promise<Subject[]> {
    return db.select().from(subjects);
  }

  async getSubject(id: number): Promise<Subject | undefined> {
    const rows = await db.select().from(subjects).where(eq(subjects.id, id));
    return rows[0];
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const rows = await db.insert(subjects).values(subject).returning();
    return rows[0];
  }

  async getTopics(subjectId: number): Promise<Topic[]> {
    return db.select().from(topics).where(eq(topics.subjectId, subjectId));
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const rows = await db.insert(topics).values(topic).returning();
    return rows[0];
  }

  async getQuestions(filters: {
    examBodyId?: number;
    subjectId?: number;
    topicId?: number;
    year?: number;
    difficulty?: string;
    limit?: number;
    offset?: number;
  }): Promise<Question[]> {
    const conditions = [];
    if (filters.examBodyId) conditions.push(eq(questions.examBodyId, filters.examBodyId));
    if (filters.subjectId) conditions.push(eq(questions.subjectId, filters.subjectId));
    if (filters.topicId) conditions.push(eq(questions.topicId, filters.topicId));
    if (filters.year) conditions.push(eq(questions.year, filters.year));
    if (filters.difficulty) conditions.push(eq(questions.difficulty, filters.difficulty));

    let query = db.select().from(questions);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    if (filters.limit) {
      query = (query as any).limit(filters.limit);
    }
    if (filters.offset) {
      query = (query as any).offset(filters.offset);
    }
    return query;
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    const rows = await db.select().from(questions).where(eq(questions.id, id));
    return rows[0];
  }

  async getQuestionCount(filters: {
    examBodyId?: number;
    subjectId?: number;
    topicId?: number;
    year?: number;
  }): Promise<number> {
    const conditions = [];
    if (filters.examBodyId) conditions.push(eq(questions.examBodyId, filters.examBodyId));
    if (filters.subjectId) conditions.push(eq(questions.subjectId, filters.subjectId));
    if (filters.topicId) conditions.push(eq(questions.topicId, filters.topicId));
    if (filters.year) conditions.push(eq(questions.year, filters.year));

    let query = db.select({ count: sql<number>`count(*)` }).from(questions);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const rows = await query;
    return Number(rows[0]?.count ?? 0);
  }

  async getAvailableYears(examBodyId?: number, subjectId?: number): Promise<number[]> {
    const conditions = [];
    if (examBodyId) conditions.push(eq(questions.examBodyId, examBodyId));
    if (subjectId) conditions.push(eq(questions.subjectId, subjectId));

    let query = db.selectDistinct({ year: questions.year }).from(questions);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const results = await query;
    return results.map((r: any) => r.year).sort((a: number, b: number) => b - a);
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const rows = await db.insert(questions).values(question).returning();
    return rows[0];
  }

  async updateQuestion(id: number, updates: Partial<InsertQuestion>): Promise<Question | undefined> {
    const rows = await db.update(questions).set(updates).where(eq(questions.id, id)).returning();
    return rows[0];
  }

  async deleteQuestion(id: number): Promise<boolean> {
    const rows = await db.delete(questions).where(eq(questions.id, id)).returning();
    return rows.length > 0;
  }

  async getAllStudyTips(): Promise<StudyTip[]> {
    return db.select().from(studyTips);
  }

  async updateStudyTip(id: number, updates: Partial<InsertStudyTip>): Promise<StudyTip | undefined> {
    const rows = await db.update(studyTips).set(updates).where(eq(studyTips.id, id)).returning();
    return rows[0];
  }

  async deleteStudyTip(id: number): Promise<boolean> {
    const rows = await db.delete(studyTips).where(eq(studyTips.id, id)).returning();
    return rows.length > 0;
  }

  async deleteTopic(id: number): Promise<boolean> {
    const rows = await db.delete(topics).where(eq(topics.id, id)).returning();
    return rows.length > 0;
  }

  async updateSubject(id: number, updates: Partial<InsertSubject>): Promise<Subject | undefined> {
    const rows = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
    return rows[0];
  }

  async getStudyTips(subjectId: number, topicId?: number): Promise<StudyTip[]> {
    if (topicId) {
      return db.select().from(studyTips).where(
        and(eq(studyTips.subjectId, subjectId), eq(studyTips.topicId, topicId))
      );
    }
    return db.select().from(studyTips).where(eq(studyTips.subjectId, subjectId));
  }

  async createStudyTip(tip: InsertStudyTip): Promise<StudyTip> {
    const rows = await db.insert(studyTips).values(tip).returning();
    return rows[0];
  }

  async getQuizSessions(): Promise<QuizSession[]> {
    return db.select().from(quizSessions);
  }

  async getQuizSession(id: number): Promise<QuizSession | undefined> {
    const rows = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
    return rows[0];
  }

  async createQuizSession(session: InsertQuizSession): Promise<QuizSession> {
    const rows = await db.insert(quizSessions).values(session).returning();
    return rows[0];
  }

  async updateQuizSession(id: number, updates: Partial<QuizSession>): Promise<QuizSession | undefined> {
    const rows = await db.update(quizSessions).set(updates).where(eq(quizSessions.id, id)).returning();
    return rows[0];
  }
}

export const storage = new DatabaseStorage();
