export interface ExamBody {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
}

export interface Subject {
  id: number;
  name: string;
  icon: string | null;
}

export interface Topic {
  id: number;
  subjectId: number;
  name: string;
}

export interface Question {
  id: number;
  examBodyId: number;
  subjectId: number;
  topicId: number | null;
  year: number;
  questionNumber: number | null;
  questionText: string;
  imageUrl: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string | null;
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  textbookRef: string | null;
}

// Question shape returned during an active CBT quiz: answer-revealing fields
// (correctAnswer, explanation, textbookRef) are stripped server-side.
export type CbtQuestion = Omit<Question, "correctAnswer" | "explanation" | "textbookRef">;

// Per-question review item returned by the server-side grading endpoint.
export interface CbtReviewItem {
  questionId: number;
  questionText: string;
  imageUrl: string | null;
  options: { label: string; value: string }[];
  yourAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

export interface CbtGradeResponse {
  score: { correct: number; total: number; percentage: number };
  review: CbtReviewItem[];
}

export interface StudyTip {
  id: number;
  subjectId: number;
  topicId: number | null;
  title: string;
  content: string;
}

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  showOnLeaderboard: boolean;
  createdAt: string;
}

export interface QuizSession {
  id: number;
  userId: number | null;
  examBodyId: number;
  subjectId: number;
  year: number | null;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  timeLimitMinutes: number | null;
  timeSpentSeconds: number;
  status: string;
  answersJson: string;
  createdAt: string;
}

export interface Stats {
  totalQuestions: number;
  totalExamBodies: number;
  totalSubjects: number;
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
}

// Analytics response types — mirror server/analytics.ts (GET /api/analytics) exactly.

// One point on the score trend, one per completed session, sorted ascending by createdAt.
export interface TrendPoint {
  sessionId: number;
  date: string; // ISO createdAt
  percentage: number;
  correctAnswers: number;
  totalQuestions: number;
  examBodyId: number;
  subjectId: number;
}

// A per-subject or per-exam-body rollup.
export interface GroupBreakdown {
  subjectId?: number;
  examBodyId?: number;
  attempts: number;
  avgScore: number;
  totalCorrect: number;
  totalQuestions: number;
}

export interface OverallStats {
  completedSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  overallAccuracy: number;
  totalStudyTimeSeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface WeakTopic {
  topicId: number;
  topicName: string | null;
  attempts: number;
  correct: number;
  accuracy: number;
}

// Supported payload formats for the name-aware question import endpoint
// (POST /api/admin/questions/import).
export type ImportFormat = "csv" | "json";

// Per-row import report returned by POST /api/admin/questions/import. `errors`
// carries a 1-based row number plus a human-readable message per failed row.
export interface ImportReport {
  created: number;
  skippedDuplicates: number;
  total: number;
  errors: { row: number; message: string }[];
}

export interface Analytics {
  trend: TrendPoint[];
  perSubject: GroupBreakdown[];
  perExamBody: GroupBreakdown[];
  overall: OverallStats;
  weakTopics: WeakTopic[];
}

// Leaderboard response types — mirror server/leaderboard.ts (GET /api/leaderboard)
// EXACTLY. Privacy: entries carry ONLY a display label + aggregate metrics,
// never email or a raw userId.
export interface LeaderboardEntry {
  rank: number;
  label: string;
  avgScore: number;
  completedSessions: number;
  questionsAnswered: number;
}

// The authenticated viewer's own standing. `rank` is null when unranked; the
// flags explain why (optedIn / belowThreshold) so the client can nudge.
export interface LeaderboardMeRow {
  rank: number | null;
  label: string;
  avgScore: number;
  completedSessions: number;
  questionsAnswered: number;
  ranked: boolean;
  optedIn: boolean;
  belowThreshold: boolean;
}

// `me` is populated only for authenticated viewers; null for anonymous callers.
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  me: LeaderboardMeRow | null;
}
