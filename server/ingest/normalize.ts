import { insertQuestionSchema, type InsertQuestion } from "@shared/schema";

// PURE, DB-free ingestion core. Mirrors the pattern in server/grading.ts and
// server/analytics.ts: a pure function the route/storage layer calls, tested
// with in-memory fixtures. This module MUST NOT import from server/storage or
// express — all DB-side behaviour (auto-create of subjects/topics, duplicate
// lookup) is supplied by the caller through ResolutionContext callbacks.

// A raw, source-agnostic record. Sources vary wildly (CSV rows, ALOC items,
// hand-pasted JSON) so keep it permissive. Both name-based references
// (examBody/subject/topic) and pre-resolved numeric ids
// (examBodyId/subjectId/topicId) are accepted, as are the common field aliases
// (question/questionText, answer/correctAnswer, solution/explanation, and the
// nested option{a..e} shape used by ALOC).
export interface RawRecord {
  examBody?: string | number | null;
  examBodyId?: string | number | null;
  subject?: string | number | null;
  subjectId?: string | number | null;
  topic?: string | number | null;
  topicId?: string | number | null;
  year?: string | number | null;
  questionNumber?: string | number | null;
  questionText?: string | number | null;
  question?: string | number | null;
  optionA?: string | number | null;
  optionB?: string | number | null;
  optionC?: string | number | null;
  optionD?: string | number | null;
  optionE?: string | number | null;
  option?: {
    a?: string | number | null;
    b?: string | number | null;
    c?: string | number | null;
    d?: string | number | null;
    e?: string | number | null;
  } | null;
  correctAnswer?: string | number | null;
  answer?: string | number | null;
  explanation?: string | number | null;
  solution?: string | number | null;
  difficulty?: string | number | null;
  textbookRef?: string | number | null;
}

// Supplied by the caller. The `resolve*` callbacks let the PURE mapping stay
// pure while the DB side (FEAT-003) supplies real auto-create behaviour; in
// unit tests these are plain in-memory functions. All name matching performed
// by implementations is expected to be case-insensitive and trimmed.
export interface ResolutionContext {
  examBodies: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  topics: { id: number; subjectId: number; name: string }[];
  // Create-or-get a subject by name, returning its id.
  resolveSubject(name: string): number;
  // Create-or-get a topic within a subject, returning its id.
  resolveTopic(subjectId: number, name: string): number;
  // Get a seeded exam body id by name, or null when the name is unknown
  // (exam bodies are a fixed seeded set and are never auto-created).
  resolveExamBody(name: string): number | null;
}

// Discriminated result: a validated InsertQuestion or a structured row error.
export type NormalizeResult =
  | { ok: true; value: InsertQuestion }
  | { ok: false; error: string };

const GENERIC_EXPLANATION = "No explanation provided.";
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

function err(error: string): NormalizeResult {
  return { ok: false, error };
}

// Coerce a permissive raw value to a trimmed string, or undefined when the
// value is empty/absent. Numbers are stringified.
function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = typeof v === "number" ? String(v) : String(v);
  const trimmed = s.trim();
  return trimmed === "" ? undefined : trimmed;
}

// Coerce a permissive raw value to an integer, or undefined when absent /
// not a finite integer.
function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isInteger(v) ? v : undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  // parseInt tolerates trailing junk; require the whole token to be an integer.
  if (!/^[+-]?\d+$/.test(s)) return undefined;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? undefined : n;
}

// Map a raw record to a validated InsertQuestion with resolved numeric ids, or
// return a structured row-level error describing the first failure encountered.
export function normalizeQuestion(raw: RawRecord, ctx: ResolutionContext): NormalizeResult {
  // (a) field mapping: prefer the canonical name, fall back to the alias, and
  // finally to the nested ALOC option shape.
  const questionText = toStr(raw.questionText) ?? toStr(raw.question);
  if (!questionText) return err("Missing question text.");

  const opts = raw.option ?? undefined;
  const optionA = toStr(raw.optionA) ?? toStr(opts?.a);
  const optionB = toStr(raw.optionB) ?? toStr(opts?.b);
  const optionC = toStr(raw.optionC) ?? toStr(opts?.c);
  const optionD = toStr(raw.optionD) ?? toStr(opts?.d);
  const optionE = toStr(raw.optionE) ?? toStr(opts?.e) ?? null;

  if (!optionA || !optionB || !optionC || !optionD) {
    return err("Options A through D are all required.");
  }

  // (b) resolve exam body: prefer a valid numeric id, else resolve by name.
  // A supplied numeric id MUST reference a known entity — the questions table
  // has no foreign-key constraint and insertQuestionSchema only type-checks, so
  // without this guard a bogus id would insert an ORPHANED row. We validate
  // against the entities the ResolutionContext already holds in memory, keeping
  // the numeric-id path symmetric with the name path (both reject the unknown).
  const examBodyIdNum = toInt(raw.examBodyId);
  let examBodyId: number;
  if (examBodyIdNum !== undefined) {
    if (!ctx.examBodies.some((e) => e.id === examBodyIdNum)) {
      return err(`Unknown exam body id: ${examBodyIdNum}.`);
    }
    examBodyId = examBodyIdNum;
  } else {
    const examBodyName = toStr(raw.examBody);
    if (!examBodyName) return err("Missing exam body.");
    const resolved = ctx.resolveExamBody(examBodyName);
    if (resolved === null) return err(`Unknown exam body: "${examBodyName}".`);
    examBodyId = resolved;
  }

  // (c) resolve subject: numeric id (validated against known subjects), else
  // create-or-get by name.
  const subjectIdNum = toInt(raw.subjectId);
  let subjectId: number;
  if (subjectIdNum !== undefined) {
    if (!ctx.subjects.some((s) => s.id === subjectIdNum)) {
      return err(`Unknown subject id: ${subjectIdNum}.`);
    }
    subjectId = subjectIdNum;
  } else {
    const subjectName = toStr(raw.subject);
    if (!subjectName) return err("Missing subject.");
    subjectId = ctx.resolveSubject(subjectName);
  }

  // (d) resolve topic (optional): numeric id, else create-or-get by name, else
  // null. A supplied numeric topicId must reference an existing topic AND that
  // topic must belong to the resolved subject — a topic under a different
  // subject would be as orphaned (relative to this question) as a nonexistent
  // one, so we reject both.
  const topicIdNum = toInt(raw.topicId);
  let topicId: number | null;
  if (topicIdNum !== undefined) {
    const topic = ctx.topics.find((t) => t.id === topicIdNum);
    if (!topic) {
      return err(`Unknown topic id: ${topicIdNum}.`);
    }
    if (topic.subjectId !== subjectId) {
      return err(
        `Topic id ${topicIdNum} does not belong to subject ${subjectId}.`,
      );
    }
    topicId = topicIdNum;
  } else {
    const topicName = toStr(raw.topic);
    topicId = topicName ? ctx.resolveTopic(subjectId, topicName) : null;
  }

  // (e) normalize the answer to a single uppercase letter and validate that it
  // points at a provided option.
  const rawAnswer = toStr(raw.correctAnswer) ?? toStr(raw.answer);
  if (!rawAnswer) return err("Missing correct answer.");
  const correctAnswer = rawAnswer.toUpperCase();
  if (!OPTION_LETTERS.includes(correctAnswer as (typeof OPTION_LETTERS)[number])) {
    return err(`Invalid correct answer "${rawAnswer}": must be one of A-E.`);
  }
  if (correctAnswer === "E" && !optionE) {
    return err('Correct answer "E" requires option E to be present.');
  }

  // (f) difficulty: default to medium, lowercase, constrain to the allowed set.
  const rawDifficulty = toStr(raw.difficulty);
  let difficulty = "medium";
  if (rawDifficulty) {
    difficulty = rawDifficulty.toLowerCase();
    if (!VALID_DIFFICULTIES.has(difficulty)) {
      return err(`Invalid difficulty "${rawDifficulty}": must be easy, medium, or hard.`);
    }
  }

  // (g) year: coerce to a positive integer.
  const year = toInt(raw.year);
  if (year === undefined || year <= 0) {
    return err(`Invalid year "${raw.year ?? ""}": must be a positive integer.`);
  }

  // (h) explanation: substitute a generic fallback when empty.
  const explanation = toStr(raw.explanation) ?? toStr(raw.solution) ?? GENERIC_EXPLANATION;

  // (optional) questionNumber + textbookRef.
  const questionNumber = toInt(raw.questionNumber) ?? null;
  const textbookRef = toStr(raw.textbookRef) ?? null;

  // (i) all strings are already trimmed by toStr. (j) validate the assembled
  // object through the authoritative schema and return the parsed data.
  const candidate = {
    examBodyId,
    subjectId,
    topicId,
    year,
    questionNumber,
    questionText,
    optionA,
    optionB,
    optionC,
    optionD,
    optionE,
    correctAnswer,
    explanation,
    difficulty,
    textbookRef,
  };

  const parsed = insertQuestionSchema.safeParse(candidate);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return err(msg);
  }
  return { ok: true, value: parsed.data };
}

// Canonical dedupe key, used by both the normalizer output and the
// storage-level duplicate check (FEAT-003). The question text is normalized
// (lowercased, trimmed, internal whitespace collapsed to single spaces) so that
// cosmetic differences do not defeat de-duplication, then joined with the
// resolved exam body, subject and year. Two questions with the same normalized
// text under the same exam body/subject/year are considered duplicates.
export function computeDedupeKey(q: {
  questionText: string;
  examBodyId: number;
  subjectId: number;
  year: number;
}): string {
  const normText = q.questionText.trim().toLowerCase().replace(/\s+/g, " ");
  return `${q.examBodyId}|${q.subjectId}|${q.year}|${normText}`;
}

// The shape needed to compute a dedupe key. Any Question-like row satisfies it.
export interface DedupeKeyInput {
  questionText: string;
  examBodyId: number;
  subjectId: number;
  year: number;
}

// PURE candidate-matching step used by storage.findDuplicateQuestion. The DB
// method narrows the row set with SQL (by the examBodyId/subjectId/year triple),
// then delegates the actual normalized-text comparison here so the matching
// logic is testable without Postgres. Returns the first candidate whose dedupe
// key equals the target key, or undefined when none match. Callers are expected
// to pass an already-narrowed candidate set, but this is correct even if they
// do not — the key encodes the full triple plus normalized text.
export function matchDuplicate<T extends DedupeKeyInput>(
  candidates: T[],
  key: DedupeKeyInput,
): T | undefined {
  const target = computeDedupeKey(key);
  return candidates.find((c) => computeDedupeKey(c) === target);
}
