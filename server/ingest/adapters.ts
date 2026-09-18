import type { RawRecord } from "./normalize";

// PURE source adapters. No DB, no Express, no npm CSV dependency — a tiny
// hand-rolled parser keeps the server bundle allowlist untouched. Each adapter
// converts a source-specific shape into a RawRecord for normalizeQuestion.

// Canonical CSV column spec. examBody and subject are given by NAME (resolved
// case-insensitively by the normalizer). topic, questionNumber, optionE,
// explanation, difficulty and textbookRef are optional.
export const CSV_COLUMNS = [
  "examBody",
  "subject",
  "topic",
  "year",
  "questionNumber",
  "questionText",
  "optionA",
  "optionB",
  "optionC",
  "optionD",
  "optionE",
  "correctAnswer",
  "explanation",
  "difficulty",
  "textbookRef",
] as const;

// A ready-to-fill CSV template: the header row plus one illustrative example.
export const CSV_TEMPLATE =
  CSV_COLUMNS.join(",") +
  "\n" +
  [
    "WAEC",
    "Mathematics",
    "Algebra",
    "2019",
    "1",
    "What is 2 + 2?",
    "3",
    "4",
    "5",
    "6",
    "",
    "B",
    "2 + 2 = 4",
    "easy",
    "",
  ]
    .map(csvEscape)
    .join(",");

// Quote a CSV field when it contains a comma, quote or newline, escaping any
// embedded double-quotes by doubling them.
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Dependency-free CSV parser. Handles quoted fields, embedded commas, escaped
// double-quotes ("") and both CRLF and LF newlines. The first non-empty row is
// treated as the header; each subsequent row becomes an object keyed by header.
// Extra fields beyond the header are ignored; missing trailing fields yield "".
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // Handle CRLF and lone CR as a single row terminator.
      pushRow();
      if (text[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush the final field/row unless the input ended exactly on a newline.
  if (field !== "" || row.length > 0) {
    pushRow();
  }

  // Drop fully empty rows (e.g. a trailing blank line).
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = r[idx] ?? "";
    });
    return obj;
  });
}

// Map a parsed CSV row (keyed by the canonical columns) to a RawRecord. Values
// are passed through as strings; the normalizer handles trimming, coercion and
// validation.
export function csvRowToRaw(row: Record<string, string>): RawRecord {
  return {
    examBody: row.examBody,
    subject: row.subject,
    topic: row.topic,
    year: row.year,
    questionNumber: row.questionNumber,
    questionText: row.questionText,
    optionA: row.optionA,
    optionB: row.optionB,
    optionC: row.optionC,
    optionD: row.optionD,
    optionE: row.optionE,
    correctAnswer: row.correctAnswer,
    explanation: row.explanation,
    difficulty: row.difficulty,
    textbookRef: row.textbookRef,
  };
}

// Documented ALOC v2 item shape. Fields we consume are mapped below; note that
// `image` is intentionally ignored — the questions schema has no media column,
// so images are out of scope for this pipeline.
export interface AlocItem {
  id?: number | string;
  question?: string | null;
  option?: { a?: string | null; b?: string | null; c?: string | null; d?: string | null; e?: string | null } | null;
  answer?: string | null; // lowercase letter, e.g. "b"
  solution?: string | null; // may be empty
  examtype?: string | null; // 'utme' | 'wassce' | 'neco' | 'post-utme'
  examyear?: string | null; // year as a string
  subject?: string | null; // subject name
  image?: string | null; // IGNORED: schema has no media column, out of scope
}

// Map an ALOC examtype to the seeded exam body name. Matching is
// case-insensitive. Unknown examtypes pass through unchanged so the normalizer
// surfaces them as an unknown-exam-body error rather than silently dropping.
const EXAMTYPE_TO_EXAM_BODY: Record<string, string> = {
  utme: "JAMB",
  "post-utme": "JAMB",
  wassce: "WAEC",
  neco: "NECO",
};

// Map a documented ALOC v2 item to a RawRecord. answer is uppercased by the
// normalizer, but the examtype -> examBody name mapping happens here.
export function alocItemToRaw(item: AlocItem): RawRecord {
  const examtypeRaw = (item.examtype ?? "").toString().trim();
  const examBody = EXAMTYPE_TO_EXAM_BODY[examtypeRaw.toLowerCase()] ?? examtypeRaw;
  return {
    examBody,
    subject: item.subject ?? undefined,
    year: item.examyear ?? undefined,
    questionText: item.question ?? undefined,
    optionA: item.option?.a ?? undefined,
    optionB: item.option?.b ?? undefined,
    optionC: item.option?.c ?? undefined,
    optionD: item.option?.d ?? undefined,
    optionE: item.option?.e ?? undefined,
    correctAnswer: item.answer ?? undefined,
    explanation: item.solution ?? undefined,
  };
}
