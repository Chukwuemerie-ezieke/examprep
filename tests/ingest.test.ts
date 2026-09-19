import { describe, it, expect } from "vitest";
import {
  normalizeQuestion,
  computeDedupeKey,
  matchDuplicate,
  type ResolutionContext,
  type RawRecord,
} from "../server/ingest/normalize";
import {
  parseCsv,
  csvRowToRaw,
  alocItemToRaw,
  CSV_COLUMNS,
  CSV_TEMPLATE,
  type AlocItem,
} from "../server/ingest/adapters";
import { createResolutionContext } from "../server/ingest/resolve";
import { sanitizeImageUrl, ALOC_IMAGE_BASE_URL } from "../server/ingest/media";
import type { IStorage } from "../server/storage";

// Build an in-memory ResolutionContext (no Postgres). Exam bodies are the fixed
// seeded set (WAEC=1/NECO=2/JAMB=3, matching seed insertion order). Subjects and
// topics start seeded and grow when the resolvers are called, simulating the
// DB-side auto-create intent. All name matching is case-insensitive + trimmed.
function makeCtx() {
  const examBodies = [
    { id: 1, name: "WAEC" },
    { id: 2, name: "NECO" },
    { id: 3, name: "JAMB" },
  ];
  const subjects = [
    { id: 1, name: "Mathematics" },
    { id: 2, name: "English Language" },
    { id: 3, name: "Physics" },
    { id: 4, name: "Chemistry" },
  ];
  const topics: { id: number; subjectId: number; name: string }[] = [
    { id: 1, subjectId: 1, name: "Algebra" },
    { id: 9, subjectId: 3, name: "Kinematics" },
  ];
  let nextSubjectId = 5;
  let nextTopicId = 10;

  const norm = (s: string) => s.trim().toLowerCase();

  const ctx: ResolutionContext = {
    examBodies,
    subjects,
    topics,
    resolveExamBody(name: string) {
      const found = examBodies.find((e) => norm(e.name) === norm(name));
      return found ? found.id : null;
    },
    resolveSubject(name: string) {
      const found = subjects.find((s) => norm(s.name) === norm(name));
      if (found) return found.id;
      const id = nextSubjectId++;
      subjects.push({ id, name: name.trim() });
      return id;
    },
    resolveTopic(subjectId: number, name: string) {
      const found = topics.find(
        (t) => t.subjectId === subjectId && norm(t.name) === norm(name),
      );
      if (found) return found.id;
      const id = nextTopicId++;
      topics.push({ id, subjectId, name: name.trim() });
      return id;
    },
  };
  return { ctx, subjects, topics };
}

describe("parseCsv", () => {
  it("parses quoted fields, embedded commas and escaped quotes", () => {
    const text =
      'examBody,subject,questionText\n' +
      'WAEC,Mathematics,"What is 1,2,3?"\n' +
      'NECO,Physics,"He said ""hi"" loudly"';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].questionText).toBe("What is 1,2,3?");
    expect(rows[1].questionText).toBe('He said "hi" loudly');
    expect(rows[0].examBody).toBe("WAEC");
  });

  it("handles CRLF newlines and a quoted embedded newline", () => {
    const text = 'a,b\r\n"line1\nline2",second\r\n';
    const rows = parseCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toBe("line1\nline2");
    expect(rows[0].b).toBe("second");
  });

  it("fills missing trailing fields with empty strings and ignores blank rows", () => {
    const text = "a,b,c\n1,2\n\n4,5,6\n";
    const rows = parseCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
    expect(rows[1]).toEqual({ a: "4", b: "5", c: "6" });
  });

  it("CSV_TEMPLATE round-trips through the parser", () => {
    const rows = parseCsv(CSV_TEMPLATE);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual([...CSV_COLUMNS]);
    expect(rows[0].examBody).toBe("WAEC");
    expect(rows[0].correctAnswer).toBe("B");
  });
});

describe("csvRowToRaw + normalizeQuestion (by name)", () => {
  it("normalizes a happy-path CSV row resolving entities by name", () => {
    const { ctx } = makeCtx();
    const rows = parseCsv(
      CSV_COLUMNS.join(",") +
        "\nWAEC,Mathematics,Algebra,2019,1,What is 2 + 2?,3,4,5,6,,B,2 + 2 = 4,easy,",
    );
    const result = normalizeQuestion(csvRowToRaw(rows[0]), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      examBodyId: 1,
      subjectId: 1,
      topicId: 1,
      year: 2019,
      questionNumber: 1,
      questionText: "What is 2 + 2?",
      correctAnswer: "B",
      difficulty: "easy",
      optionE: null,
      explanation: "2 + 2 = 4",
    });
  });
});

describe("alocItemToRaw + normalizeQuestion", () => {
  const baseItem: AlocItem = {
    id: 42,
    question: "What is the capital of France?",
    option: { a: "Lagos", b: "Paris", c: "Rome", d: "Berlin" },
    answer: "b",
    solution: "Paris is the capital of France.",
    examtype: "utme",
    examyear: "2019",
    subject: "Mathematics",
    image: null,
  };

  it("maps a documented ALOC item (utme -> JAMB) on the happy path", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(alocItemToRaw(baseItem), ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      examBodyId: 3, // JAMB
      subjectId: 1, // Mathematics
      year: 2019,
      questionText: "What is the capital of France?",
      optionB: "Paris",
      correctAnswer: "B",
      explanation: "Paris is the capital of France.",
    });
  });

  it("maps every examtype variant to the right exam body", () => {
    const { ctx } = makeCtx();
    const cases: [string, number][] = [
      ["utme", 3],
      ["post-utme", 3],
      ["wassce", 1],
      ["neco", 2],
      ["WASSCE", 1], // case-insensitive
    ];
    for (const [examtype, expectedId] of cases) {
      const result = normalizeQuestion(alocItemToRaw({ ...baseItem, examtype }), ctx);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.examBodyId).toBe(expectedId);
    }
  });

  it("carries a fifth option through when present", () => {
    const { ctx } = makeCtx();
    const item: AlocItem = {
      ...baseItem,
      option: { a: "1", b: "2", c: "3", d: "4", e: "5" },
      answer: "e",
    };
    const result = normalizeQuestion(alocItemToRaw(item), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.optionE).toBe("5");
      expect(result.value.correctAnswer).toBe("E");
    }
  });

  it("surfaces an unknown examtype as an unknown-exam-body error", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(alocItemToRaw({ ...baseItem, examtype: "gce" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown exam body/i);
  });
});

describe("normalizeQuestion resolution paths", () => {
  const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
    year: "2020",
    questionText: "Q?",
    optionA: "a",
    optionB: "b",
    optionC: "c",
    optionD: "d",
    correctAnswer: "A",
    explanation: "because",
    ...over,
  });

  it("accepts pre-resolved numeric ids directly", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(
      raw({ examBodyId: 2, subjectId: 3, topicId: 9 }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.examBodyId).toBe(2);
      expect(result.value.subjectId).toBe(3);
      expect(result.value.topicId).toBe(9);
    }
  });

  it("resolves an existing subject to its existing id (case-insensitive)", () => {
    const { ctx, subjects } = makeCtx();
    const before = subjects.length;
    const result = normalizeQuestion(
      raw({ examBody: "waec", subject: "  mathematics  " }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.subjectId).toBe(1);
    expect(subjects.length).toBe(before); // no auto-create
  });

  it("auto-creates a new subject and topic through the resolvers", () => {
    const { ctx, subjects, topics } = makeCtx();
    const result = normalizeQuestion(
      raw({ examBody: "JAMB", subject: "Biology", topic: "Genetics" }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const newSubject = subjects.find((s) => s.name === "Biology");
    const newTopic = topics.find((t) => t.name === "Genetics");
    expect(newSubject).toBeDefined();
    expect(newTopic).toBeDefined();
    expect(result.value.subjectId).toBe(newSubject!.id);
    expect(result.value.topicId).toBe(newTopic!.id);
  });
});

describe("normalizeQuestion numeric-id existence checks", () => {
  const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
    year: "2020",
    questionText: "Q?",
    optionA: "a",
    optionB: "b",
    optionC: "c",
    optionD: "d",
    correctAnswer: "A",
    explanation: "because",
    ...over,
  });

  it("accepts a valid numeric examBodyId/subjectId/topicId", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(
      raw({ examBodyId: 2, subjectId: 3, topicId: 9 }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.examBodyId).toBe(2);
      expect(result.value.subjectId).toBe(3);
      expect(result.value.topicId).toBe(9);
    }
  });

  it("rejects an unknown numeric examBodyId (no orphaned row)", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ examBodyId: 999, subjectId: 1 }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown exam body id: 999/i);
  });

  it("rejects an unknown numeric subjectId (no orphaned row)", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ examBodyId: 1, subjectId: 999 }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown subject id: 999/i);
  });

  it("rejects an unknown numeric topicId (no orphaned row)", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(
      raw({ examBodyId: 1, subjectId: 1, topicId: 999 }),
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown topic id: 999/i);
  });

  it("rejects a topicId that belongs to a different subject", () => {
    const { ctx } = makeCtx();
    // topic 9 belongs to subject 3, but this row declares subject 1.
    const result = normalizeQuestion(
      raw({ examBodyId: 1, subjectId: 1, topicId: 9 }),
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not belong to subject/i);
  });
});

describe("normalizeQuestion field handling", () => {
  const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
    examBody: "WAEC",
    subject: "Mathematics",
    year: "2020",
    questionText: "Q?",
    optionA: "a",
    optionB: "b",
    optionC: "c",
    optionD: "d",
    correctAnswer: "A",
    explanation: "because",
    ...over,
  });

  it("normalizes a lowercase answer letter to uppercase", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ correctAnswer: "b" }), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.correctAnswer).toBe("B");
  });

  it("rejects answer E when option E is absent", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ correctAnswer: "E" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/option E/i);
  });

  it("rejects an out-of-range answer letter", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ correctAnswer: "F" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/A-E/);
  });

  it("defaults difficulty to medium when absent", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ difficulty: undefined }), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.difficulty).toBe("medium");
  });

  it("lowercases a provided difficulty and rejects a bogus one", () => {
    const { ctx } = makeCtx();
    const ok = normalizeQuestion(raw({ difficulty: "HARD" }), ctx);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.difficulty).toBe("hard");

    const bad = normalizeQuestion(raw({ difficulty: "impossible" }), ctx);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/difficulty/i);
  });

  it("substitutes a fallback explanation when missing or empty", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ explanation: "   ", solution: undefined }), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.explanation).toBe("No explanation provided.");
  });

  it("coerces a string year to a number", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ year: "2019" }), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.year).toBe(2019);
  });

  it("rejects a non-numeric year", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ year: "twenty-nineteen" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/year/i);
  });

  it("rejects a non-positive year", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ year: "0" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/year/i);
  });

  it("returns an unknown-exam-body error for an unseeded name", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ examBody: "GCE" }), ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown exam body: "GCE"/i);
  });

  it("trims string fields", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(raw({ questionText: "  spaced  ", optionA: " a " }), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.questionText).toBe("spaced");
      expect(result.value.optionA).toBe("a");
    }
  });
});

describe("computeDedupeKey", () => {
  it("produces the same key regardless of casing and whitespace", () => {
    const a = computeDedupeKey({
      questionText: "What is 2 + 2?",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    const b = computeDedupeKey({
      questionText: "  WHAT   is 2 + 2?  ",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    expect(a).toBe(b);
    expect(a).toBe("1|1|2019|what is 2 + 2?");
  });

  it("differs when the year differs", () => {
    const base = { questionText: "Q?", examBodyId: 1, subjectId: 1 };
    expect(computeDedupeKey({ ...base, year: 2019 })).not.toBe(
      computeDedupeKey({ ...base, year: 2020 }),
    );
  });

  it("differs when exam body or subject differ", () => {
    const base = { questionText: "Q?", year: 2019 };
    expect(computeDedupeKey({ ...base, examBodyId: 1, subjectId: 1 })).not.toBe(
      computeDedupeKey({ ...base, examBodyId: 2, subjectId: 1 }),
    );
    expect(computeDedupeKey({ ...base, examBodyId: 1, subjectId: 1 })).not.toBe(
      computeDedupeKey({ ...base, examBodyId: 1, subjectId: 2 }),
    );
  });
});

// ---------------------------------------------------------------------------
// DB-seam coverage: a fake in-memory IStorage exercises the REAL
// createResolutionContext pre-pass and the pure matchDuplicate helper that
// findDuplicateQuestion delegates to. These paths ship the numeric-id trust
// fixes, so they are worth direct coverage beyond the pure normalizer.
// ---------------------------------------------------------------------------

interface QuestionRow {
  id: number;
  examBodyId: number;
  subjectId: number;
  topicId: number | null;
  year: number;
  questionText: string;
}

// Minimal in-memory IStorage. Only the methods the ingestion pre-pass and the
// dedupe lookup touch are implemented; the rest throw if ever called, so a test
// relying on an un-implemented path fails loudly rather than silently. Records
// every createSubject/createTopic call so tests can assert auto-create counts.
function makeFakeStorage(seed?: {
  examBodies?: { id: number; name: string }[];
  subjects?: { id: number; name: string }[];
  topics?: { id: number; subjectId: number; name: string }[];
}) {
  const examBodies = (seed?.examBodies ?? [
    { id: 1, name: "WAEC" },
    { id: 2, name: "NECO" },
    { id: 3, name: "JAMB" },
  ]).map((e) => ({ ...e }));
  const subjects = (seed?.subjects ?? [
    { id: 1, name: "Mathematics" },
    { id: 2, name: "Physics" },
  ]).map((s) => ({ ...s }));
  const topics = (seed?.topics ?? [{ id: 1, subjectId: 1, name: "Algebra" }]).map((t) => ({
    ...t,
  }));
  const questionRows: QuestionRow[] = [];

  const createdSubjects: { subjectId: number; name: string }[] = [];
  const createdTopics: { subjectId: number; name: string }[] = [];

  let nextSubjectId = Math.max(0, ...subjects.map((s) => s.id)) + 1;
  let nextTopicId = Math.max(0, ...topics.map((t) => t.id)) + 1;
  let nextQuestionId = 1;

  const storage = {
    async getExamBodies() {
      return examBodies.map((e) => ({ ...e, fullName: e.name, description: null }));
    },
    async getSubjects() {
      return subjects.map((s) => ({ ...s, icon: null }));
    },
    async getTopics(subjectId: number) {
      return topics.filter((t) => t.subjectId === subjectId).map((t) => ({ ...t }));
    },
    async createSubject(input: { name: string; icon: string | null }) {
      const row = { id: nextSubjectId++, name: input.name, icon: input.icon };
      subjects.push({ id: row.id, name: row.name });
      createdSubjects.push({ subjectId: row.id, name: row.name });
      return row;
    },
    async createTopic(input: { subjectId: number; name: string }) {
      const row = { id: nextTopicId++, subjectId: input.subjectId, name: input.name };
      topics.push({ ...row });
      createdTopics.push({ subjectId: input.subjectId, name: input.name });
      return row;
    },
    // Mirrors DatabaseStorage.findDuplicateQuestion: SQL-narrow by the triple,
    // then delegate the normalized-text match to the pure matchDuplicate.
    async findDuplicateQuestion(key: {
      questionText: string;
      examBodyId: number;
      subjectId: number;
      year: number;
    }) {
      const candidates = questionRows.filter(
        (q) =>
          q.examBodyId === key.examBodyId &&
          q.subjectId === key.subjectId &&
          q.year === key.year,
      );
      return matchDuplicate(candidates, key) as unknown as
        | Record<string, unknown>
        | undefined;
    },
    async createQuestion(q: {
      examBodyId: number;
      subjectId: number;
      topicId: number | null;
      year: number;
      questionText: string;
    }) {
      const row: QuestionRow = {
        id: nextQuestionId++,
        examBodyId: q.examBodyId,
        subjectId: q.subjectId,
        topicId: q.topicId,
        year: q.year,
        questionText: q.questionText,
      };
      questionRows.push(row);
      return row;
    },
  };

  return {
    storage: storage as unknown as IStorage,
    subjects,
    topics,
    createdSubjects,
    createdTopics,
    questionRows,
  };
}

describe("createResolutionContext pre-pass", () => {
  it("auto-creates a missing subject referenced by name", async () => {
    const fake = makeFakeStorage();
    const records: RawRecord[] = [{ subject: "Biology", questionText: "Q?" }];
    const ctx = await createResolutionContext(fake.storage, records);
    expect(fake.createdSubjects).toEqual([
      { subjectId: expect.any(Number), name: "Biology" },
    ]);
    // The new subject is resolvable through the returned context.
    const bio = fake.subjects.find((s) => s.name === "Biology")!;
    expect(ctx.resolveSubject("biology")).toBe(bio.id);
  });

  it("auto-creates a missing topic under a subject resolved by name", async () => {
    const fake = makeFakeStorage();
    const records: RawRecord[] = [
      { subject: "Mathematics", topic: "Trigonometry", questionText: "Q?" },
    ];
    await createResolutionContext(fake.storage, records);
    // Mathematics already exists (id 1); only the topic is created under it.
    expect(fake.createdSubjects).toHaveLength(0);
    expect(fake.createdTopics).toEqual([{ subjectId: 1, name: "Trigonometry" }]);
  });

  it("collapses repeated names within one batch to a single create", async () => {
    const fake = makeFakeStorage();
    const records: RawRecord[] = [
      { subject: "Biology", topic: "Genetics", questionText: "Q1" },
      { subject: "biology", topic: "genetics", questionText: "Q2" }, // case variant
      { subject: "BIOLOGY", topic: "GENETICS", questionText: "Q3" },
    ];
    await createResolutionContext(fake.storage, records);
    expect(fake.createdSubjects).toHaveLength(1);
    expect(fake.createdTopics).toHaveLength(1);
  });

  it("does NOT create a topic under a numeric subjectId that does not exist", async () => {
    const fake = makeFakeStorage();
    const records: RawRecord[] = [
      { subjectId: 999, topic: "Ghost Topic", questionText: "Q?" },
    ];
    const ctx = await createResolutionContext(fake.storage, records);
    // No orphaned topic write happened...
    expect(fake.createdTopics).toHaveLength(0);
    // ...and the row is rejected by the normalizer's subjectId existence check.
    const result = normalizeQuestion(
      {
        examBody: "WAEC",
        subjectId: 999,
        topic: "Ghost Topic",
        year: "2020",
        questionText: "Q?",
        optionA: "a",
        optionB: "b",
        optionC: "c",
        optionD: "d",
        correctAnswer: "A",
        explanation: "x",
      },
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unknown subject id: 999/i);
  });

  it("creates a topic under a valid numeric subjectId", async () => {
    const fake = makeFakeStorage();
    const records: RawRecord[] = [
      { subjectId: 2, topic: "Optics", questionText: "Q?" }, // subject 2 = Physics
    ];
    await createResolutionContext(fake.storage, records);
    expect(fake.createdTopics).toEqual([{ subjectId: 2, name: "Optics" }]);
  });
});

describe("findDuplicateQuestion via matchDuplicate", () => {
  it("returns undefined when no matching row exists", async () => {
    const fake = makeFakeStorage();
    const dup = await fake.storage.findDuplicateQuestion({
      questionText: "Anything?",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    expect(dup).toBeUndefined();
  });

  it("matches a case/whitespace variant of an existing question", async () => {
    const fake = makeFakeStorage();
    await fake.storage.createQuestion({
      examBodyId: 1,
      subjectId: 1,
      topicId: null,
      year: 2019,
      questionText: "What is 2 + 2?",
    });
    const dup = await fake.storage.findDuplicateQuestion({
      questionText: "  WHAT   IS 2 + 2?  ",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    expect(dup).toBeDefined();
  });

  it("does NOT match across a different year, exam body, or subject", async () => {
    const fake = makeFakeStorage();
    await fake.storage.createQuestion({
      examBodyId: 1,
      subjectId: 1,
      topicId: null,
      year: 2019,
      questionText: "What is 2 + 2?",
    });
    const key = { questionText: "What is 2 + 2?", examBodyId: 1, subjectId: 1, year: 2019 };
    expect(
      await fake.storage.findDuplicateQuestion({ ...key, year: 2020 }),
    ).toBeUndefined();
    expect(
      await fake.storage.findDuplicateQuestion({ ...key, examBodyId: 2 }),
    ).toBeUndefined();
    expect(
      await fake.storage.findDuplicateQuestion({ ...key, subjectId: 2 }),
    ).toBeUndefined();
  });

  it("matchDuplicate is a pure function over a candidate array", () => {
    const candidates = [
      { questionText: "Alpha", examBodyId: 1, subjectId: 1, year: 2019, id: 1 },
      { questionText: "Beta", examBodyId: 1, subjectId: 1, year: 2019, id: 2 },
    ];
    const hit = matchDuplicate(candidates, {
      questionText: "  beta ",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    expect(hit?.id).toBe(2);
    const miss = matchDuplicate(candidates, {
      questionText: "Gamma",
      examBodyId: 1,
      subjectId: 1,
      year: 2019,
    });
    expect(miss).toBeUndefined();
  });
});

describe("sanitizeImageUrl", () => {
  it("accepts absolute http and https URLs", () => {
    expect(sanitizeImageUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(sanitizeImageUrl("http://cdn.example.com/b.jpg")).toBe(
      "http://cdn.example.com/b.jpg",
    );
  });

  it("trims surrounding whitespace before validating", () => {
    expect(sanitizeImageUrl("  https://cdn.example.com/a.png  ")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("returns null for null/undefined/empty/non-string", () => {
    expect(sanitizeImageUrl(null)).toBeNull();
    expect(sanitizeImageUrl(undefined)).toBeNull();
    expect(sanitizeImageUrl("")).toBeNull();
    expect(sanitizeImageUrl("   ")).toBeNull();
    expect(sanitizeImageUrl(123)).toBeNull();
    expect(sanitizeImageUrl({})).toBeNull();
  });

  it("rejects non-http(s) schemes (javascript:/data:/ftp:/mailto:)", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(sanitizeImageUrl("ftp://host/file.png")).toBeNull();
    expect(sanitizeImageUrl("mailto:someone@example.com")).toBeNull();
  });

  it("resolves a relative path against the provided base URL", () => {
    expect(
      sanitizeImageUrl("questions/abc.png", { baseUrl: ALOC_IMAGE_BASE_URL }),
    ).toBe("https://questions.aloc.com.ng/questions/abc.png");
    expect(
      sanitizeImageUrl("/media/x.jpg", { baseUrl: ALOC_IMAGE_BASE_URL }),
    ).toBe("https://questions.aloc.com.ng/media/x.jpg");
  });

  it("returns null for a relative path when no base URL is given", () => {
    expect(sanitizeImageUrl("questions/abc.png")).toBeNull();
  });
});

describe("image ingestion (ALOC / CSV / JSON)", () => {
  const baseItem: AlocItem = {
    id: 42,
    question: "What is the capital of France?",
    option: { a: "Lagos", b: "Paris", c: "Rome", d: "Berlin" },
    answer: "b",
    solution: "Paris is the capital of France.",
    examtype: "utme",
    examyear: "2019",
    subject: "Mathematics",
    image: null,
  };

  it("carries an absolute ALOC image through to value.imageUrl", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(
      alocItemToRaw({ ...baseItem, image: "https://cdn.aloc.com/x.png" }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.imageUrl).toBe("https://cdn.aloc.com/x.png");
  });

  it("resolves a relative ALOC image against the ALOC base", () => {
    const { ctx } = makeCtx();
    const result = normalizeQuestion(
      alocItemToRaw({ ...baseItem, image: "questions/img-1.png" }),
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.imageUrl).toBe(
        "https://questions.aloc.com.ng/questions/img-1.png",
      );
    }
  });

  it("yields imageUrl null when the ALOC image is null or absent", () => {
    const { ctx } = makeCtx();
    const withNull = normalizeQuestion(alocItemToRaw({ ...baseItem, image: null }), ctx);
    expect(withNull.ok).toBe(true);
    if (withNull.ok) expect(withNull.value.imageUrl).toBeNull();

    const { image, ...noImage } = baseItem;
    const withAbsent = normalizeQuestion(alocItemToRaw(noImage), ctx);
    expect(withAbsent.ok).toBe(true);
    if (withAbsent.ok) expect(withAbsent.value.imageUrl).toBeNull();
  });

  it("normalizes a CSV imageUrl column to value.imageUrl", () => {
    const { ctx } = makeCtx();
    const rows = parseCsv(
      CSV_COLUMNS.join(",") +
        "\nWAEC,Mathematics,Algebra,2019,1,What is 2 + 2?,3,4,5,6,,B,2 + 2 = 4,easy,,https://cdn.example.com/q.png",
    );
    const result = normalizeQuestion(csvRowToRaw(rows[0]), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.imageUrl).toBe("https://cdn.example.com/q.png");
  });

  it("maps a blank CSV imageUrl to null", () => {
    const { ctx } = makeCtx();
    const rows = parseCsv(
      CSV_COLUMNS.join(",") +
        "\nWAEC,Mathematics,Algebra,2019,1,What is 2 + 2?,3,4,5,6,,B,2 + 2 = 4,easy,,",
    );
    const result = normalizeQuestion(csvRowToRaw(rows[0]), ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.imageUrl).toBeNull();
  });

  it("accepts a JSON/RawRecord under both `imageUrl` and `image` aliases", () => {
    const { ctx } = makeCtx();
    const base: RawRecord = {
      examBody: "WAEC",
      subject: "Mathematics",
      year: "2020",
      questionText: "Q?",
      optionA: "a",
      optionB: "b",
      optionC: "c",
      optionD: "d",
      correctAnswer: "A",
      explanation: "because",
    };
    const viaImageUrl = normalizeQuestion(
      { ...base, imageUrl: "https://cdn.example.com/j.png" },
      ctx,
    );
    expect(viaImageUrl.ok).toBe(true);
    if (viaImageUrl.ok) {
      expect(viaImageUrl.value.imageUrl).toBe("https://cdn.example.com/j.png");
    }

    const viaImage = normalizeQuestion(
      { ...base, image: "https://cdn.example.com/k.png" },
      ctx,
    );
    expect(viaImage.ok).toBe(true);
    if (viaImage.ok) expect(viaImage.value.imageUrl).toBe("https://cdn.example.com/k.png");

    // imageUrl wins over image when both are present.
    const both = normalizeQuestion(
      { ...base, imageUrl: "https://cdn.example.com/win.png", image: "https://cdn.example.com/lose.png" },
      ctx,
    );
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.value.imageUrl).toBe("https://cdn.example.com/win.png");
  });
});
