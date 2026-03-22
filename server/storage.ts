import {
  type ExamBody, type InsertExamBody, examBodies,
  type Subject, type InsertSubject, subjects,
  type Topic, type InsertTopic, topics,
  type Question, type InsertQuestion, questions,
  type StudyTip, type InsertStudyTip, studyTips,
  type QuizSession, type InsertQuizSession, quizSessions,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

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

  // Study tips
  getStudyTips(subjectId: number, topicId?: number): Promise<StudyTip[]>;
  createStudyTip(tip: InsertStudyTip): Promise<StudyTip>;

  // Quiz sessions
  getQuizSessions(): Promise<QuizSession[]>;
  getQuizSession(id: number): Promise<QuizSession | undefined>;
  createQuizSession(session: InsertQuizSession): Promise<QuizSession>;
  updateQuizSession(id: number, updates: Partial<QuizSession>): Promise<QuizSession | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getExamBodies(): Promise<ExamBody[]> {
    return db.select().from(examBodies).all();
  }

  async getExamBody(id: number): Promise<ExamBody | undefined> {
    return db.select().from(examBodies).where(eq(examBodies.id, id)).get();
  }

  async createExamBody(body: InsertExamBody): Promise<ExamBody> {
    return db.insert(examBodies).values(body).returning().get();
  }

  async getSubjects(): Promise<Subject[]> {
    return db.select().from(subjects).all();
  }

  async getSubject(id: number): Promise<Subject | undefined> {
    return db.select().from(subjects).where(eq(subjects.id, id)).get();
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    return db.insert(subjects).values(subject).returning().get();
  }

  async getTopics(subjectId: number): Promise<Topic[]> {
    return db.select().from(topics).where(eq(topics.subjectId, subjectId)).all();
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    return db.insert(topics).values(topic).returning().get();
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
    return (query as any).all();
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    return db.select().from(questions).where(eq(questions.id, id)).get();
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
    const result = (query as any).get();
    return result?.count ?? 0;
  }

  async getAvailableYears(examBodyId?: number, subjectId?: number): Promise<number[]> {
    const conditions = [];
    if (examBodyId) conditions.push(eq(questions.examBodyId, examBodyId));
    if (subjectId) conditions.push(eq(questions.subjectId, subjectId));

    let query = db.selectDistinct({ year: questions.year }).from(questions);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    const results = (query as any).all();
    return results.map((r: any) => r.year).sort((a: number, b: number) => b - a);
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    return db.insert(questions).values(question).returning().get();
  }

  async getStudyTips(subjectId: number, topicId?: number): Promise<StudyTip[]> {
    if (topicId) {
      return db.select().from(studyTips).where(
        and(eq(studyTips.subjectId, subjectId), eq(studyTips.topicId, topicId))
      ).all();
    }
    return db.select().from(studyTips).where(eq(studyTips.subjectId, subjectId)).all();
  }

  async createStudyTip(tip: InsertStudyTip): Promise<StudyTip> {
    return db.insert(studyTips).values(tip).returning().get();
  }

  async getQuizSessions(): Promise<QuizSession[]> {
    return db.select().from(quizSessions).all();
  }

  async getQuizSession(id: number): Promise<QuizSession | undefined> {
    return db.select().from(quizSessions).where(eq(quizSessions.id, id)).get();
  }

  async createQuizSession(session: InsertQuizSession): Promise<QuizSession> {
    return db.insert(quizSessions).values(session).returning().get();
  }

  async updateQuizSession(id: number, updates: Partial<QuizSession>): Promise<QuizSession | undefined> {
    const result = db.update(quizSessions).set(updates).where(eq(quizSessions.id, id)).returning().get();
    return result;
  }
}

export const storage = new DatabaseStorage();
