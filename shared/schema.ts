import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Exam body: WAEC, NECO, JAMB
export const examBodies = sqliteTable("exam_bodies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // WAEC, NECO, JAMB
  fullName: text("full_name").notNull(),
  description: text("description"),
});

// Subjects: Mathematics, English, Physics, Chemistry
export const subjects = sqliteTable("subjects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon"), // lucide icon name
});

// Topics within subjects
export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  name: text("name").notNull(),
});

// Questions
export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examBodyId: integer("exam_body_id").notNull(),
  subjectId: integer("subject_id").notNull(),
  topicId: integer("topic_id"),
  year: integer("year").notNull(),
  questionNumber: integer("question_number"),
  questionText: text("question_text").notNull(),
  optionA: text("option_a").notNull(),
  optionB: text("option_b").notNull(),
  optionC: text("option_c").notNull(),
  optionD: text("option_d").notNull(),
  optionE: text("option_e"), // WAEC sometimes has 5 options
  correctAnswer: text("correct_answer").notNull(), // A, B, C, D, or E
  explanation: text("explanation").notNull(),
  difficulty: text("difficulty").notNull(), // easy, medium, hard
  textbookRef: text("textbook_ref"), // JSON stringified array of references
});

// Study tips per subject/topic
export const studyTips = sqliteTable("study_tips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectId: integer("subject_id").notNull(),
  topicId: integer("topic_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
});

// User quiz sessions (for CBT mode)
export const quizSessions = sqliteTable("quiz_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examBodyId: integer("exam_body_id").notNull(),
  subjectId: integer("subject_id").notNull(),
  year: integer("year"),
  totalQuestions: integer("total_questions").notNull(),
  answeredQuestions: integer("answered_questions").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  timeLimitMinutes: integer("time_limit_minutes"),
  timeSpentSeconds: integer("time_spent_seconds").notNull().default(0),
  status: text("status").notNull().default("in_progress"), // in_progress, completed
  answersJson: text("answers_json").notNull().default("{}"), // JSON: { questionId: selectedAnswer }
  createdAt: text("created_at").notNull(),
});

// Insert schemas
export const insertExamBodySchema = createInsertSchema(examBodies).omit({ id: true });
export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true });
export const insertTopicSchema = createInsertSchema(topics).omit({ id: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true });
export const insertStudyTipSchema = createInsertSchema(studyTips).omit({ id: true });
export const insertQuizSessionSchema = createInsertSchema(quizSessions).omit({ id: true });

// Types
export type ExamBody = typeof examBodies.$inferSelect;
export type InsertExamBody = z.infer<typeof insertExamBodySchema>;
export type Subject = typeof subjects.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type StudyTip = typeof studyTips.$inferSelect;
export type InsertStudyTip = z.infer<typeof insertStudyTipSchema>;
export type QuizSession = typeof quizSessions.$inferSelect;
export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;
