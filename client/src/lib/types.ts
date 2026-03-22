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

export interface StudyTip {
  id: number;
  subjectId: number;
  topicId: number | null;
  title: string;
  content: string;
}

export interface QuizSession {
  id: number;
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
