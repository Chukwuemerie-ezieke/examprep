import type { Question } from "@shared/schema";

// A single graded question row. correctAnswer and explanation are revealed here
// (only in the graded response), never during an active quiz.
export interface ReviewItem {
  questionId: number;
  questionText: string;
  options: { label: string; value: string }[];
  yourAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

export interface GradeResult {
  score: { correct: number; total: number; percentage: number };
  review: ReviewItem[];
}

export interface GradeSubmissionInput {
  // The full ordered set of question ids that were served for the quiz. May be
  // empty/undefined for older clients, in which case we fall back to the ids
  // present in `answers`.
  questionIds?: number[];
  // Maps a question id (as a string key) to the selected option letter.
  answers: Record<string, string>;
}

// Async question lookup. Mirrors storage.getQuestion so the route can pass it
// directly, while tests can supply an in-memory map.
export type GetQuestion = (id: number) => Promise<Question | undefined> | Question | undefined;

// Pure CBT grading. Grades against the FULL served question set (deduped,
// order-preserving), so skipped questions count as incorrect and stay in the
// denominator. Unknown/unresolvable ids are counted incorrect with a
// placeholder review row. correctAnswer/explanation appear only in the review.
// percentage = round(correct/total*100); total 0 -> 0.
export async function gradeSubmission(
  { questionIds, answers }: GradeSubmissionInput,
  getQuestion: GetQuestion,
): Promise<GradeResult> {
  // Fall back to the answered ids when the served set is empty. Deduplicate
  // while preserving order.
  const rawIds =
    questionIds && questionIds.length > 0
      ? questionIds
      : Object.keys(answers)
          .map((k) => parseInt(k, 10))
          .filter((n) => !Number.isNaN(n));
  const ids = Array.from(new Set(rawIds));

  let correct = 0;
  let total = 0;
  const review: ReviewItem[] = [];

  for (const qId of ids) {
    total++;
    const q = await getQuestion(qId);
    const yourAnswer = answers[String(qId)] ?? null;
    if (!q) {
      // Unknown question id: cannot verify, count as incorrect and surface it in
      // the review so the discrepancy is visible rather than silent.
      review.push({
        questionId: qId,
        questionText: "Question unavailable",
        options: [],
        yourAnswer,
        correctAnswer: "",
        isCorrect: false,
        explanation: "This question could not be found.",
      });
      continue;
    }
    const isCorrect = yourAnswer === q.correctAnswer;
    if (isCorrect) correct++;
    const options = [
      { label: "A", value: q.optionA },
      { label: "B", value: q.optionB },
      { label: "C", value: q.optionC },
      { label: "D", value: q.optionD },
      ...(q.optionE ? [{ label: "E", value: q.optionE }] : []),
    ];
    review.push({
      questionId: q.id,
      questionText: q.questionText,
      options,
      yourAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      explanation: q.explanation,
    });
  }

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  return { score: { correct, total, percentage }, review };
}
