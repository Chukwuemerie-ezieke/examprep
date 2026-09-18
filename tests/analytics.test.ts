import { describe, it, expect } from "vitest";
import { computeAnalytics, type TopicAnswerRow } from "../server/analytics";
import type { QuizSession } from "@shared/schema";

// Build a minimal completed QuizSession row. Only the fields computeAnalytics
// touches matter; the rest are representative defaults. Override per test.
function makeSession(overrides: Partial<QuizSession> & { id: number }): QuizSession {
  return {
    id: overrides.id,
    examBodyId: 1,
    subjectId: 1,
    year: 2020,
    totalQuestions: 10,
    answeredQuestions: 10,
    correctAnswers: 5,
    timeLimitMinutes: null,
    timeSpentSeconds: 60,
    status: "completed",
    answersJson: "{}",
    createdAt: "2024-01-01T00:00:00.000Z",
    userId: 1,
    ...overrides,
  };
}

describe("computeAnalytics", () => {
  it("returns a fully zeroed / empty payload for no sessions", () => {
    const a = computeAnalytics([], []);
    expect(a.trend).toEqual([]);
    expect(a.perSubject).toEqual([]);
    expect(a.perExamBody).toEqual([]);
    expect(a.weakTopics).toEqual([]);
    expect(a.overall).toEqual({
      completedSessions: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      overallAccuracy: 0,
      totalStudyTimeSeconds: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
    });
  });

  it("orders trend ascending by createdAt and rounds percentage (total-safe)", () => {
    const sessions = [
      makeSession({ id: 2, createdAt: "2024-01-03T00:00:00.000Z", correctAnswers: 1, totalQuestions: 3 }), // 33
      makeSession({ id: 1, createdAt: "2024-01-01T00:00:00.000Z", correctAnswers: 2, totalQuestions: 3 }), // 67
      makeSession({ id: 3, createdAt: "2024-01-05T00:00:00.000Z", correctAnswers: 0, totalQuestions: 0 }), // total 0 -> 0
    ];
    const a = computeAnalytics(sessions, []);
    expect(a.trend.map((t) => t.sessionId)).toEqual([1, 2, 3]);
    expect(a.trend.map((t) => t.percentage)).toEqual([67, 33, 0]);
    expect(a.trend[0]).toMatchObject({
      sessionId: 1,
      date: "2024-01-01T00:00:00.000Z",
      correctAnswers: 2,
      totalQuestions: 3,
      examBodyId: 1,
      subjectId: 1,
    });
  });

  it("rolls up per-subject: attempts, avgScore (mean of per-session %), totals", () => {
    const sessions = [
      makeSession({ id: 1, subjectId: 10, correctAnswers: 2, totalQuestions: 4 }), // 50
      makeSession({ id: 2, subjectId: 10, correctAnswers: 4, totalQuestions: 4 }), // 100
      makeSession({ id: 3, subjectId: 20, correctAnswers: 1, totalQuestions: 4 }), // 25
    ];
    const a = computeAnalytics(sessions, []);
    const s10 = a.perSubject.find((g) => g.subjectId === 10)!;
    expect(s10).toEqual({ subjectId: 10, attempts: 2, avgScore: 75, totalCorrect: 6, totalQuestions: 8 });
    const s20 = a.perSubject.find((g) => g.subjectId === 20)!;
    expect(s20).toEqual({ subjectId: 20, attempts: 1, avgScore: 25, totalCorrect: 1, totalQuestions: 4 });
  });

  it("rolls up per-exam-body across multiple sessions", () => {
    const sessions = [
      makeSession({ id: 1, examBodyId: 5, correctAnswers: 3, totalQuestions: 6 }), // 50
      makeSession({ id: 2, examBodyId: 5, correctAnswers: 6, totalQuestions: 6 }), // 100
      makeSession({ id: 3, examBodyId: 7, correctAnswers: 0, totalQuestions: 2 }), // 0
    ];
    const a = computeAnalytics(sessions, []);
    const b5 = a.perExamBody.find((g) => g.examBodyId === 5)!;
    expect(b5).toEqual({ examBodyId: 5, attempts: 2, avgScore: 75, totalCorrect: 9, totalQuestions: 12 });
    const b7 = a.perExamBody.find((g) => g.examBodyId === 7)!;
    expect(b7).toEqual({ examBodyId: 7, attempts: 1, avgScore: 0, totalCorrect: 0, totalQuestions: 2 });
  });

  it("sums total study time and computes overall accuracy total-safely", () => {
    const sessions = [
      makeSession({ id: 1, correctAnswers: 3, totalQuestions: 10, timeSpentSeconds: 120 }),
      makeSession({ id: 2, correctAnswers: 7, totalQuestions: 10, timeSpentSeconds: 300 }),
    ];
    const a = computeAnalytics(sessions, []);
    expect(a.overall.totalStudyTimeSeconds).toBe(420);
    expect(a.overall.totalQuestions).toBe(20);
    expect(a.overall.totalCorrect).toBe(10);
    expect(a.overall.overallAccuracy).toBe(50);
    expect(a.overall.completedSessions).toBe(2);
  });

  it("computes streaks for consecutive days (current anchored to most recent day)", () => {
    // Three consecutive UTC days -> current 3, longest 3. Two sessions on the
    // same day collapse to one calendar day.
    const sessions = [
      makeSession({ id: 1, createdAt: "2024-03-01T08:00:00.000Z" }),
      makeSession({ id: 2, createdAt: "2024-03-02T09:00:00.000Z" }),
      makeSession({ id: 3, createdAt: "2024-03-03T23:00:00.000Z" }),
      makeSession({ id: 4, createdAt: "2024-03-03T23:30:00.000Z" }),
    ];
    const a = computeAnalytics(sessions, []);
    expect(a.overall.currentStreakDays).toBe(3);
    expect(a.overall.longestStreakDays).toBe(3);
  });

  it("computes streaks with a gap (single-day current, longest earlier run)", () => {
    // Days: 03-01, 03-02, 03-03 (run of 3), then gap, then 03-10 (isolated).
    // current is anchored to the most recent day (03-10) -> 1. longest -> 3.
    const sessions = [
      makeSession({ id: 1, createdAt: "2024-03-01T00:00:00.000Z" }),
      makeSession({ id: 2, createdAt: "2024-03-02T00:00:00.000Z" }),
      makeSession({ id: 3, createdAt: "2024-03-03T00:00:00.000Z" }),
      makeSession({ id: 4, createdAt: "2024-03-10T00:00:00.000Z" }),
    ];
    const a = computeAnalytics(sessions, []);
    expect(a.overall.currentStreakDays).toBe(1);
    expect(a.overall.longestStreakDays).toBe(3);
  });

  it("handles a single-day streak", () => {
    const a = computeAnalytics([makeSession({ id: 1, createdAt: "2024-03-01T00:00:00.000Z" })], []);
    expect(a.overall.currentStreakDays).toBe(1);
    expect(a.overall.longestStreakDays).toBe(1);
  });

  it("detects weak topics ordered by lowest accuracy first, ignoring null topics", () => {
    const rows: TopicAnswerRow[] = [
      // topic 1: 1/3 correct = 33%
      { topicId: 1, isCorrect: true },
      { topicId: 1, isCorrect: false },
      { topicId: 1, isCorrect: false },
      // topic 2: 2/2 correct = 100%
      { topicId: 2, isCorrect: true },
      { topicId: 2, isCorrect: true },
      // topic 3: 1/2 correct = 50%
      { topicId: 3, isCorrect: true },
      { topicId: 3, isCorrect: false },
      // null topic ignored
      { topicId: null, isCorrect: false },
    ];
    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    expect(a.weakTopics.map((t) => t.topicId)).toEqual([1, 3, 2]);
    expect(a.weakTopics[0]).toEqual({ topicId: 1, topicName: null, attempts: 3, correct: 1, accuracy: 33 });
    expect(a.weakTopics[2]).toEqual({ topicId: 2, topicName: null, attempts: 2, correct: 2, accuracy: 100 });
  });

  it("tie-breaks equal accuracy by descending attempts", () => {
    const rows: TopicAnswerRow[] = [
      // topic 1: 0/1 = 0%
      { topicId: 1, isCorrect: false },
      // topic 2: 0/3 = 0% (more attempts -> ranked first on tie)
      { topicId: 2, isCorrect: false },
      { topicId: 2, isCorrect: false },
      { topicId: 2, isCorrect: false },
    ];
    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    expect(a.weakTopics.map((t) => t.topicId)).toEqual([2, 1]);
  });

  it("returns an empty weakTopics array when no per-topic data is available", () => {
    const a = computeAnalytics([makeSession({ id: 1 })], []);
    expect(a.weakTopics).toEqual([]);
  });

  it("limits weak topics to at most 5", () => {
    const rows: TopicAnswerRow[] = [];
    for (let t = 1; t <= 8; t++) {
      // Give each topic >= the min-attempts floor so all 8 qualify and the cap
      // (not the floor fallback) is what limits the result to 5.
      for (let i = 0; i < 3; i++) rows.push({ topicId: t, isCorrect: false });
    }
    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    expect(a.weakTopics.length).toBe(5);
  });

  it("does not let a low-attempt 0% topic outrank a higher-attempt topic (attempts floor)", () => {
    const rows: TopicAnswerRow[] = [];
    // Five qualifying topics (>= 3 attempts) with moderate accuracy fill the
    // display limit, so the below-floor 0%/1-attempt noise topic is excluded.
    // topic 1: 2/5 = 40%
    for (let i = 0; i < 2; i++) rows.push({ topicId: 1, isCorrect: true });
    for (let i = 0; i < 3; i++) rows.push({ topicId: 1, isCorrect: false });
    // topics 2..5: 3/4 = 75% each
    for (let t = 2; t <= 5; t++) {
      for (let i = 0; i < 3; i++) rows.push({ topicId: t, isCorrect: true });
      rows.push({ topicId: t, isCorrect: false });
    }
    // topic 99: 0/1 = 0% but below the attempts floor -> must not appear.
    rows.push({ topicId: 99, isCorrect: false });

    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    expect(a.weakTopics.length).toBe(5);
    expect(a.weakTopics.map((t) => t.topicId)).not.toContain(99);
    // The weakest qualifying topic (40%) ranks first.
    expect(a.weakTopics[0].topicId).toBe(1);
  });

  it("still returns below-floor topics for a light user (fallback)", () => {
    // Only two topics, each with a single answered question (below the floor).
    // With no qualifying topics, the fallback still surfaces them.
    const rows: TopicAnswerRow[] = [
      { topicId: 1, isCorrect: false }, // 0%
      { topicId: 2, isCorrect: true }, // 100%
    ];
    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    expect(a.weakTopics.map((t) => t.topicId)).toEqual([1, 2]);
    expect(a.weakTopics[0]).toMatchObject({ topicId: 1, attempts: 1, accuracy: 0 });
  });

  it("passes topicName through when provided and falls back to null otherwise", () => {
    const rows: TopicAnswerRow[] = [
      // topic 1 has a name on at least one row (first non-null wins).
      { topicId: 1, isCorrect: false },
      { topicId: 1, topicName: "Algebra", isCorrect: true },
      { topicId: 1, isCorrect: false },
      // topic 2 has no name anywhere -> null.
      { topicId: 2, isCorrect: false },
      { topicId: 2, isCorrect: false },
      { topicId: 2, isCorrect: false },
    ];
    const a = computeAnalytics([makeSession({ id: 1 })], rows);
    const t1 = a.weakTopics.find((t) => t.topicId === 1)!;
    const t2 = a.weakTopics.find((t) => t.topicId === 2)!;
    expect(t1.topicName).toBe("Algebra");
    expect(t2.topicName).toBeNull();
  });
});
