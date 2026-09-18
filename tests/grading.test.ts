import { describe, it, expect } from "vitest";
import { gradeSubmission, type GetQuestion } from "../server/grading";
import type { Question } from "@shared/schema";

// Build a minimal Question row. Only the fields the grader touches matter; the
// rest are filled with representative defaults to satisfy the type.
function makeQuestion(overrides: Partial<Question> & { id: number }): Question {
  return {
    id: overrides.id,
    examBodyId: 1,
    subjectId: 1,
    topicId: null,
    year: 2020,
    questionNumber: null,
    questionText: `Question ${overrides.id}`,
    optionA: "A-val",
    optionB: "B-val",
    optionC: "C-val",
    optionD: "D-val",
    optionE: null,
    correctAnswer: "A",
    explanation: `Because ${overrides.id}`,
    difficulty: "easy",
    textbookRef: null,
    ...overrides,
  };
}

// In-memory question lookup (no Postgres).
function lookup(questions: Question[]): GetQuestion {
  const map = new Map(questions.map((q) => [q.id, q]));
  return (id: number) => map.get(id);
}

describe("gradeSubmission", () => {
  it("scores all-correct answers as 100%", async () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: "A" }),
      makeQuestion({ id: 2, correctAnswer: "C" }),
    ];
    const result = await gradeSubmission(
      { questionIds: [1, 2], answers: { "1": "A", "2": "C" } },
      lookup(questions),
    );
    expect(result.score).toEqual({ correct: 2, total: 2, percentage: 100 });
    expect(result.review.every((r) => r.isCorrect)).toBe(true);
  });

  it("counts skipped questions as incorrect but keeps them in the denominator", async () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: "A" }),
      makeQuestion({ id: 2, correctAnswer: "B" }),
    ];
    // Only question 1 is answered; question 2 was served but skipped.
    const result = await gradeSubmission(
      { questionIds: [1, 2], answers: { "1": "A" } },
      lookup(questions),
    );
    expect(result.score).toEqual({ correct: 1, total: 2, percentage: 50 });
    const skipped = result.review.find((r) => r.questionId === 2)!;
    expect(skipped.yourAnswer).toBeNull();
    expect(skipped.isCorrect).toBe(false);
  });

  it("counts an unknown/unresolvable id as incorrect and marks it unavailable", async () => {
    const questions = [makeQuestion({ id: 1, correctAnswer: "A" })];
    const result = await gradeSubmission(
      { questionIds: [1, 999], answers: { "1": "A", "999": "B" } },
      lookup(questions),
    );
    expect(result.score).toEqual({ correct: 1, total: 2, percentage: 50 });
    const unknown = result.review.find((r) => r.questionId === 999)!;
    expect(unknown.questionText).toBe("Question unavailable");
    expect(unknown.isCorrect).toBe(false);
    expect(unknown.options).toEqual([]);
    expect(unknown.yourAnswer).toBe("B");
  });

  it("grades duplicate ids once (dedupe, order-preserving)", async () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: "A" }),
      makeQuestion({ id: 2, correctAnswer: "A" }),
    ];
    const result = await gradeSubmission(
      { questionIds: [1, 2, 1, 2], answers: { "1": "A", "2": "A" } },
      lookup(questions),
    );
    expect(result.score).toEqual({ correct: 2, total: 2, percentage: 100 });
    expect(result.review.map((r) => r.questionId)).toEqual([1, 2]);
  });

  it("reveals correctAnswer and explanation in the review, computed correctly", async () => {
    const questions = [
      makeQuestion({
        id: 1,
        correctAnswer: "C",
        explanation: "The answer is C",
        optionE: "E-val",
      }),
    ];
    const result = await gradeSubmission(
      { questionIds: [1], answers: { "1": "A" } },
      lookup(questions),
    );
    const row = result.review[0];
    expect(row.correctAnswer).toBe("C");
    expect(row.explanation).toBe("The answer is C");
    expect(row.isCorrect).toBe(false);
    // optionE included only when present.
    expect(row.options).toEqual([
      { label: "A", value: "A-val" },
      { label: "B", value: "B-val" },
      { label: "C", value: "C-val" },
      { label: "D", value: "D-val" },
      { label: "E", value: "E-val" },
    ]);
  });

  it("omits optionE from the review options when it is absent", async () => {
    const questions = [makeQuestion({ id: 1, optionE: null })];
    const result = await gradeSubmission(
      { questionIds: [1], answers: { "1": "A" } },
      lookup(questions),
    );
    expect(result.review[0].options.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
  });

  it("falls back to answered ids when questionIds is empty", async () => {
    const questions = [
      makeQuestion({ id: 1, correctAnswer: "A" }),
      makeQuestion({ id: 2, correctAnswer: "B" }),
    ];
    const result = await gradeSubmission(
      { questionIds: [], answers: { "1": "A", "2": "B" } },
      lookup(questions),
    );
    expect(result.score).toEqual({ correct: 2, total: 2, percentage: 100 });
  });

  it("yields 0% for an empty served set", async () => {
    const result = await gradeSubmission({ questionIds: [], answers: {} }, lookup([]));
    expect(result.score).toEqual({ correct: 0, total: 0, percentage: 0 });
    expect(result.review).toEqual([]);
  });

  it("works with an async question getter (mirrors storage.getQuestion)", async () => {
    const questions = [makeQuestion({ id: 1, correctAnswer: "D" })];
    const asyncGetter: GetQuestion = async (id) =>
      new Map(questions.map((q) => [q.id, q])).get(id);
    const result = await gradeSubmission(
      { questionIds: [1], answers: { "1": "D" } },
      asyncGetter,
    );
    expect(result.score.percentage).toBe(100);
  });
});
