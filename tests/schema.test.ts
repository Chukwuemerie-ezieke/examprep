import { describe, it, expect } from "vitest";
import { signupSchema, loginSchema, insertQuestionSchema } from "@shared/schema";

describe("signupSchema", () => {
  const valid = {
    email: "user@example.com",
    password: "longenough",
    displayName: "Ada",
  };

  it("accepts a valid payload", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({ ...valid, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("treats displayName as optional", () => {
    const { displayName, ...withoutName } = valid;
    expect(signupSchema.safeParse(withoutName).success).toBe(true);
  });

  it("enforces displayName length bounds (1..100)", () => {
    expect(signupSchema.safeParse({ ...valid, displayName: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, displayName: "x".repeat(101) }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, displayName: "x".repeat(100) }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("accepts a valid payload", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "any" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "any" }).success).toBe(false);
  });
});

describe("insertQuestionSchema", () => {
  const validRow = {
    examBodyId: 1,
    subjectId: 2,
    year: 2020,
    questionText: "What is 2 + 2?",
    optionA: "3",
    optionB: "4",
    optionC: "5",
    optionD: "6",
    correctAnswer: "B",
    explanation: "2 + 2 = 4",
    difficulty: "easy",
  };

  it("accepts a valid question row", () => {
    expect(insertQuestionSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects a row missing a required field", () => {
    const { correctAnswer, ...missing } = validRow;
    expect(insertQuestionSchema.safeParse(missing).success).toBe(false);
  });

  it("accepts a valid https imageUrl", () => {
    const result = insertQuestionSchema.safeParse({
      ...validRow,
      imageUrl: "https://cdn.example.com/questions/a.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a null imageUrl", () => {
    expect(insertQuestionSchema.safeParse({ ...validRow, imageUrl: null }).success).toBe(true);
  });

  it("accepts an absent imageUrl", () => {
    expect(insertQuestionSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects a javascript: imageUrl", () => {
    const result = insertQuestionSchema.safeParse({
      ...validRow,
      imageUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a relative-path imageUrl", () => {
    const result = insertQuestionSchema.safeParse({
      ...validRow,
      imageUrl: "questions/a.png",
    });
    expect(result.success).toBe(false);
  });
});
