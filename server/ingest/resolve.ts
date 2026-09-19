import type { RawRecord, ResolutionContext } from "./normalize";
import type { IStorage } from "../storage";

// Server-side ResolutionContext factory. This bridges the PURE, DB-free
// normalizer (server/ingest/normalize.ts) to the real storage layer, supplying
// the create-or-get behaviour the pure interface leaves abstract.
//
// The pure ResolutionContext exposes SYNCHRONOUS resolveSubject/resolveTopic,
// but DB creates are async. Rather than complicate the pure module, we use a
// PRE-PASS: scan every RawRecord, eagerly create any missing subjects/topics via
// async storage calls, refresh the in-memory arrays, and only THEN build a
// purely-synchronous ResolutionContext over the now-complete arrays. Callers
// therefore do: `const ctx = await createResolutionContext(storage, records)`
// followed by synchronous `normalizeQuestion(record, ctx)` for each record.
//
// Resolution decisions (documented):
//  - Unknown SUBJECT / TOPIC names are AUTO-CREATED (case-insensitive
//    find-or-create). Repeated names within a single import map to a single row
//    because created entities are pushed into the same cached arrays.
//  - Unknown EXAM BODY names are REJECTED (resolveExamBody returns null, which
//    the normalizer turns into an "unknown exam body" row error). Exam bodies
//    are a small fixed seeded set (WAEC/NECO/JAMB); silently creating them would
//    invite typo proliferation.

// Coerce a permissive raw value to a trimmed non-empty string, or undefined.
// Mirrors normalize.ts's toStr so the pre-pass keys match what the normalizer
// will actually look up.
function rawStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

// True when the raw value parses as an integer (a pre-resolved numeric id). In
// that case the normalizer uses the id directly and no name resolution happens,
// so the pre-pass must skip it too.
function isIntLike(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isInteger(v);
  const s = String(v).trim();
  return s !== "" && /^[+-]?\d+$/.test(s);
}

function findByName<T extends { name: string }>(arr: T[], name: string): T | undefined {
  const needle = name.trim().toLowerCase();
  return arr.find((e) => e.name.trim().toLowerCase() === needle);
}

export async function createResolutionContext(
  storage: IStorage,
  records: RawRecord[],
): Promise<ResolutionContext> {
  // Load the current seeded/known entities once.
  const examBodies = (await storage.getExamBodies()).map((e) => ({ id: e.id, name: e.name }));
  const subjects = (await storage.getSubjects()).map((s) => ({ id: s.id, name: s.name }));

  // Topics are loaded per subject; gather them all up front for the subjects we
  // already know about. Newly-created subjects start with no topics.
  const topics: { id: number; subjectId: number; name: string }[] = [];
  for (const s of subjects) {
    const t = await storage.getTopics(s.id);
    for (const row of t) topics.push({ id: row.id, subjectId: row.subjectId, name: row.name });
  }

  // ---- PRE-PASS: eagerly create missing subjects, then missing topics. ----

  // (1) Subjects. Only records that reference a subject BY NAME (not a numeric
  // subjectId) can trigger auto-create.
  for (const raw of records) {
    if (isIntLike(raw.subjectId)) continue;
    const name = rawStr(raw.subject);
    if (!name) continue;
    if (findByName(subjects, name)) continue;
    const created = await storage.createSubject({ name, icon: null });
    subjects.push({ id: created.id, name: created.name });
  }

  // (2) Topics. Resolve the record's subjectId the same way the normalizer will
  // (numeric id wins, else by-name lookup against the now-complete subjects
  // array), then create the topic under it if missing.
  for (const raw of records) {
    // A pre-resolved numeric topicId means the normalizer skips topic-by-name.
    if (isIntLike(raw.topicId)) continue;
    const topicName = rawStr(raw.topic);
    if (!topicName) continue;

    let subjectId: number | undefined;
    if (isIntLike(raw.subjectId)) {
      // A numeric subjectId is trusted ONLY if it references a subject that
      // actually exists. Creating a topic under an unknown id would spawn an
      // orphaned topic (the questions/topics tables have no FK). If the id is
      // bogus we skip the write entirely; the normalizer will reject the row
      // for the same reason (Unknown subject id), so no data is lost.
      const idNum = Number(raw.subjectId);
      subjectId = subjects.some((s) => s.id === idNum) ? idNum : undefined;
    } else {
      const subjectName = rawStr(raw.subject);
      if (!subjectName) continue; // no subject -> normalizer errors before topic
      subjectId = findByName(subjects, subjectName)?.id;
    }
    if (subjectId === undefined) continue;

    const exists = topics.some(
      (t) => t.subjectId === subjectId && t.name.trim().toLowerCase() === topicName.trim().toLowerCase(),
    );
    if (exists) continue;
    const created = await storage.createTopic({ subjectId, name: topicName });
    topics.push({ id: created.id, subjectId: created.subjectId, name: created.name });
  }

  // ---- Build the purely-synchronous ResolutionContext over complete arrays. ----
  return {
    examBodies,
    subjects,
    topics,
    resolveSubject(name: string): number {
      const found = findByName(subjects, name);
      if (found) return found.id;
      // Should not happen after the pre-pass, but stay safe: surface as an
      // unresolved subject rather than silently miscreating.
      throw new Error(`Subject not pre-resolved: "${name}"`);
    },
    resolveTopic(subjectId: number, name: string): number {
      const needle = name.trim().toLowerCase();
      const found = topics.find(
        (t) => t.subjectId === subjectId && t.name.trim().toLowerCase() === needle,
      );
      if (found) return found.id;
      throw new Error(`Topic not pre-resolved: "${name}" (subject ${subjectId})`);
    },
    resolveExamBody(name: string): number | null {
      return findByName(examBodies, name)?.id ?? null;
    },
  };
}
