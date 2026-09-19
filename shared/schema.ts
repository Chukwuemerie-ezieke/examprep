import { pgTable, text, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Registered user accounts. Passwords are stored as a self-describing scrypt
// hash string (never plaintext). `isAdmin` drives role-based authorization.
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Opt-in flag for appearing on the public leaderboard. Default OFF for
  // privacy: a user is only ever listed after explicitly opting in. Additive
  // and backward-compatible - db:push adds it to existing rows as false.
  showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// Exam body: WAEC, NECO, JAMB
export const examBodies = pgTable("exam_bodies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // WAEC, NECO, JAMB
  fullName: text("full_name").notNull(),
  description: text("description"),
});

// Subjects: Mathematics, English, Physics, Chemistry
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"), // lucide icon name
});

// Topics within subjects
export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  name: text("name").notNull(),
});

// Questions
export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  examBodyId: integer("exam_body_id").notNull(),
  subjectId: integer("subject_id").notNull(),
  topicId: integer("topic_id"),
  year: integer("year").notNull(),
  questionNumber: integer("question_number"),
  questionText: text("question_text").notNull(),
  // Optional question-level image. Nullable for backward compatibility: existing
  // rows and inserts without an image stay valid (db:push adds it as NULL).
  imageUrl: text("image_url"),
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
export const studyTips = pgTable("study_tips", {
  id: serial("id").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  topicId: integer("topic_id"),
  title: text("title").notNull(),
  content: text("content").notNull(),
});

// User quiz sessions (for CBT mode)
export const quizSessions = pgTable("quiz_sessions", {
  id: serial("id").primaryKey(),
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
  // Owning user. Nullable so pre-Phase-2 rows remain valid. Always set
  // server-side from the authenticated session, never trusted from the client.
  userId: integer("user_id"),
});

// Insert schemas
export const insertExamBodySchema = createInsertSchema(examBodies).omit({ id: true });
export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true });
export const insertTopicSchema = createInsertSchema(topics).omit({ id: true });
// The base drizzle-zod schema only type-checks `imageUrl` as an optional
// string. Refine it so every write path (admin CRUD + bulk) enforces the same
// contract the ingestion pipeline already guarantees via sanitizeImageUrl:
// a stored imageUrl is either absent/null or an absolute http(s) URL. This
// rejects non-http(s) schemes (e.g. "javascript:alert(1)", "data:...") and
// bare relative paths (e.g. "questions/a.png").
export const insertQuestionSchema = createInsertSchema(questions)
  .omit({ id: true })
  .extend({
    imageUrl: z
      .string()
      .url()
      .refine((v) => /^https?:\/\//i.test(v), {
        message: "imageUrl must be an absolute http(s) URL",
      })
      .nullable()
      .optional(),
  });
export const insertStudyTipSchema = createInsertSchema(studyTips).omit({ id: true });
// userId is owned by the server (set from the authenticated session), so it is
// omitted from the client-facing insert schema and never trusted from input.
export const insertQuizSessionSchema = createInsertSchema(quizSessions).omit({ id: true, userId: true });

// Drizzle insert schema for users (server-side use). id/createdAt/isAdmin are
// set server-side, so they are omitted from the base insert schema.
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, isAdmin: true });

// Public-facing signup payload validation.
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().min(1).max(100).optional(),
});

// Public-facing login payload validation.
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Profile-update payload validation for the authenticated `PATCH /api/auth/me`
// route. Only user-editable fields are accepted: the leaderboard opt-in flag
// and the display name (which may be cleared to null). Both are optional so a
// caller can update either independently. Server-owned fields (email, isAdmin,
// passwordHash) are never accepted here.
export const profileUpdateSchema = z.object({
  showOnLeaderboard: z.boolean().optional(),
  displayName: z.string().trim().min(1).max(100).nullable().optional(),
});

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
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
// `User` (typeof users.$inferSelect) auto-includes showOnLeaderboard now that
// the column is declared on the users pgTable above.
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
