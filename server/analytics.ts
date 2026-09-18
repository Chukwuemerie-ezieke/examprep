import type { QuizSession } from "@shared/schema";

// Pure, DB-free per-user analytics aggregation. Mirrors the extraction style of
// server/grading.ts: the route fetches rows from storage and hands plain data
// to this function, so it can be unit-tested with in-memory fixtures and no
// Postgres. Every computation is total-safe against division by zero.

// A single per-answered-question join row used for weak-topic detection. The
// route derives these by parsing each completed session's answersJson and
// joining each questionId to questions.topicId / questions.correctAnswer, then
// comparing the selected answer to the correct answer to produce isCorrect.
// topicName is the resolved human-readable name for topicId (joined server-side
// from the topics table); it may be null when the topic has no name or the row
// has no topic.
export interface TopicAnswerRow {
  topicId: number | null;
  topicName?: string | null;
  isCorrect: boolean;
}

// One point on the score trend, one per completed session, sorted ascending by
// createdAt.
export interface TrendPoint {
  sessionId: number;
  date: string; // ISO createdAt
  percentage: number; // round(correctAnswers/totalQuestions*100), total 0 -> 0
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
  avgScore: number; // rounded mean of per-session percentages
  totalCorrect: number;
  totalQuestions: number;
}

export interface OverallStats {
  completedSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  overallAccuracy: number; // round(totalCorrect/totalQuestions*100), total 0 -> 0
  totalStudyTimeSeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
}

export interface WeakTopic {
  topicId: number;
  topicName: string | null; // resolved server-side; null -> client falls back to `Topic {id}`
  attempts: number;
  correct: number;
  accuracy: number; // round(correct/attempts*100)
}

export interface Analytics {
  trend: TrendPoint[];
  perSubject: GroupBreakdown[];
  perExamBody: GroupBreakdown[];
  overall: OverallStats;
  weakTopics: WeakTopic[];
}

// Max number of weak topics returned.
const WEAK_TOPIC_LIMIT = 5;

// Minimum answered attempts a topic needs to be treated as a reliable weak-topic
// signal. Topics below this floor are de-prioritized (see the weakTopics ranking
// rule below) so a single wrong answer cannot dominate the "study these next"
// surface.
const WEAK_TOPIC_MIN_ATTEMPTS = 3;

function pct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// Convert an ISO timestamp to a UTC calendar-day key (YYYY-MM-DD). Streaks are
// computed on UTC calendar days so the result is deterministic regardless of
// server timezone.
function utcDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Number of whole UTC days between two YYYY-MM-DD keys (b - a).
function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00.000Z`);
  const tb = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((tb - ta) / 86_400_000);
}

// Compute current and longest streaks (consecutive UTC calendar days with >=1
// completed session). currentStreak is anchored to the MOST RECENT session's
// day (not "today"), counting consecutive days backwards from it; this keeps the
// value stable for tests and does not silently reset just because a user has not
// studied yet today. longestStreak is the longest consecutive run anywhere in
// the history.
function computeStreaks(dayKeys: string[]): { current: number; longest: number } {
  const unique = Array.from(new Set(dayKeys)).sort(); // ascending YYYY-MM-DD
  if (unique.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (dayDiff(unique[i - 1], unique[i]) === 1) {
      run++;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // Current streak counts back from the most recent day.
  let current = 1;
  for (let i = unique.length - 1; i > 0; i--) {
    if (dayDiff(unique[i - 1], unique[i]) === 1) {
      current++;
    } else {
      break;
    }
  }

  return { current, longest };
}

// Roll completed sessions up by a numeric key (subjectId or examBodyId).
function groupBy(
  sessions: QuizSession[],
  keyOf: (s: QuizSession) => number,
  keyName: "subjectId" | "examBodyId",
): GroupBreakdown[] {
  const map = new Map<number, { attempts: number; pctSum: number; totalCorrect: number; totalQuestions: number }>();
  for (const s of sessions) {
    const key = keyOf(s);
    const entry = map.get(key) ?? { attempts: 0, pctSum: 0, totalCorrect: 0, totalQuestions: 0 };
    entry.attempts += 1;
    entry.pctSum += pct(s.correctAnswers, s.totalQuestions);
    entry.totalCorrect += s.correctAnswers;
    entry.totalQuestions += s.totalQuestions;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([key, e]) => ({
      [keyName]: key,
      attempts: e.attempts,
      avgScore: e.attempts > 0 ? Math.round(e.pctSum / e.attempts) : 0,
      totalCorrect: e.totalCorrect,
      totalQuestions: e.totalQuestions,
    }) as GroupBreakdown)
    .sort((a, b) => (a[keyName]! - b[keyName]!));
}

// Compute the full analytics payload from a user's COMPLETED quiz sessions and
// (optionally) the per-answered-question join rows used for weak-topic
// detection. Callers must pass only completed, user-scoped sessions. Empty-safe:
// zero sessions yields zeroed overall stats and empty arrays everywhere.
export function computeAnalytics(
  completedSessions: QuizSession[],
  topicAnswers: TopicAnswerRow[] = [],
): Analytics {
  // Trend: one point per completed session, sorted ascending by createdAt.
  const trend: TrendPoint[] = [...completedSessions]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => ({
      sessionId: s.id,
      date: s.createdAt,
      percentage: pct(s.correctAnswers, s.totalQuestions),
      correctAnswers: s.correctAnswers,
      totalQuestions: s.totalQuestions,
      examBodyId: s.examBodyId,
      subjectId: s.subjectId,
    }));

  // METRIC DEFINITION (intentional, documented not changed): perSubject and
  // perExamBody `avgScore` is an UNWEIGHTED mean of each session's percentage
  // (every session counts equally regardless of how many questions it had),
  // whereas overall.overallAccuracy below is QUESTION-WEIGHTED (total correct /
  // total questions across all sessions). The two can therefore differ for a
  // user whose sessions vary in length; both are surfaced as "%".
  const perSubject = groupBy(completedSessions, (s) => s.subjectId, "subjectId");
  const perExamBody = groupBy(completedSessions, (s) => s.examBodyId, "examBodyId");

  // Overall rollups.
  const totalQuestions = completedSessions.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = completedSessions.reduce((sum, s) => sum + s.correctAnswers, 0);
  const totalStudyTimeSeconds = completedSessions.reduce((sum, s) => sum + s.timeSpentSeconds, 0);

  const dayKeys = completedSessions
    .map((s) => utcDayKey(s.createdAt))
    .filter((k): k is string => k !== null);
  const { current, longest } = computeStreaks(dayKeys);

  const overall: OverallStats = {
    completedSessions: completedSessions.length,
    totalQuestions,
    totalCorrect,
    overallAccuracy: pct(totalCorrect, totalQuestions),
    totalStudyTimeSeconds,
    currentStreakDays: current,
    longestStreakDays: longest,
  };

  // Weak topics: aggregate the per-answered-question join rows by topicId,
  // ignoring rows without a topic (topicId === null).
  //
  // METRIC DEFINITION (intentional, documented not changed): weak-topic
  // `accuracy` is measured over ANSWERED questions only. answersJson stores only
  // the selections the user actually made, so skipped questions are not
  // attributed to any topic here. This differs from session/overall/trend
  // scores, which treat skipped questions as incorrect (question-weighted). A
  // topic's `attempts` is therefore the count of questions the user answered in
  // that topic, not the count served.
  //
  // RANKING RULE (minimum-attempts floor with light-user fallback): topics with
  // at least WEAK_TOPIC_MIN_ATTEMPTS answered questions are ranked FIRST
  // (ascending accuracy, then descending attempts as a tie-break) so a single
  // 0%/1-attempt topic cannot outrank a 40%/20-attempt topic. If fewer than
  // WEAK_TOPIC_LIMIT qualifying topics exist, below-floor topics are appended
  // (same ordering) until the limit is reached, so a brand-new/light user still
  // sees weak topics instead of an empty list. topicName is carried through from
  // the input rows (first non-null wins) and is null when unresolved.
  const topicMap = new Map<number, { attempts: number; correct: number; name: string | null }>();
  for (const row of topicAnswers) {
    if (row.topicId === null) continue;
    const entry = topicMap.get(row.topicId) ?? { attempts: 0, correct: 0, name: null };
    entry.attempts += 1;
    if (row.isCorrect) entry.correct += 1;
    if (entry.name === null && row.topicName != null) entry.name = row.topicName;
    topicMap.set(row.topicId, entry);
  }

  const byAccuracyThenAttempts = (a: WeakTopic, b: WeakTopic) =>
    a.accuracy - b.accuracy || b.attempts - a.attempts;

  const allTopics: WeakTopic[] = Array.from(topicMap.entries()).map(([topicId, e]) => ({
    topicId,
    topicName: e.name,
    attempts: e.attempts,
    correct: e.correct,
    accuracy: pct(e.correct, e.attempts),
  }));

  const qualifying = allTopics
    .filter((t) => t.attempts >= WEAK_TOPIC_MIN_ATTEMPTS)
    .sort(byAccuracyThenAttempts);
  const belowFloor = allTopics
    .filter((t) => t.attempts < WEAK_TOPIC_MIN_ATTEMPTS)
    .sort(byAccuracyThenAttempts);

  // Qualifying topics first; only fall back to below-floor topics to fill up to
  // the display limit for light users.
  const weakTopics: WeakTopic[] = [...qualifying, ...belowFloor].slice(0, WEAK_TOPIC_LIMIT);

  return { trend, perSubject, perExamBody, overall, weakTopics };
}
