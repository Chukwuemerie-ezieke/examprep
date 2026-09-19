/**
 * Pluggable content-ingestion CLI (a tsx dev tool; NOT part of the server
 * bundle). Runs the SAME normalize + dedupe + upsert core as the admin import
 * endpoint (POST /api/admin/questions/import), just from the command line.
 *
 * Usage:
 *   npm run ingest -- --source=file --file=path/to/questions.csv
 *   npm run ingest -- --source=file --file=path/to/questions.json
 *   npm run ingest -- --source=file --file=path/to/aloc.json --aloc-json
 *   npm run ingest -- --source=aloc --subject=english --type=utme --year=2019 --count=20
 *
 * Requires DATABASE_URL. The ALOC adapter additionally requires
 * ALOC_ACCESS_TOKEN (a free token from the questions.aloc.com.ng playground);
 * no token is ever hardcoded or committed.
 *
 * Adding a new source is a matter of implementing the SourceAdapter interface
 * below and wiring it into buildAdapter().
 */
import { readFile } from "fs/promises";
import {
  normalizeQuestion,
  type RawRecord,
} from "../server/ingest/normalize";
import { createResolutionContext } from "../server/ingest/resolve";
import {
  parseCsv,
  csvRowToRaw,
  alocItemToRaw,
  type AlocItem,
} from "../server/ingest/adapters";

// NOTE: server/storage.ts throws at import time when DATABASE_URL is unset, so
// it is imported LAZILY (dynamic import inside main) only after adapter
// selection and the DATABASE_URL check. This keeps `--source=aloc` without a
// token able to exit(0) cleanly without touching the DB.

// A pluggable source of raw records. Implement this to add a new ingestion
// source; fetchRecords may return an array or an async iterable so adapters can
// stream if needed.
export interface SourceAdapter {
  name: string;
  fetchRecords(): Promise<RawRecord[]> | AsyncIterable<RawRecord>;
}

// ----- argv parsing: supports --key=value and bare --flag -----
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq === -1) {
      args[body] = true;
    } else {
      args[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return args;
}

// ----- FILE adapter: read a local .csv or .json file -----
class FileAdapter implements SourceAdapter {
  name = "file";
  constructor(
    private filePath: string,
    private alocJson: boolean,
  ) {}

  async fetchRecords(): Promise<RawRecord[]> {
    const text = await readFile(this.filePath, "utf-8");
    const lower = this.filePath.toLowerCase();
    if (lower.endsWith(".csv")) {
      return parseCsv(text).map(csvRowToRaw);
    }
    if (lower.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error("JSON file must contain an array of records.");
      }
      // --aloc-json maps ALOC v2 item shapes; otherwise elements are treated as
      // generic RawRecords (the normalizer tolerates both name and id refs).
      return this.alocJson
        ? (parsed as AlocItem[]).map(alocItemToRaw)
        : (parsed as RawRecord[]);
    }
    throw new Error(`Unsupported file extension for "${this.filePath}" (expected .csv or .json).`);
  }
}

// ----- ALOC adapter: fetch from questions.aloc.com.ng -----
// Reads ALOC_ACCESS_TOKEN from the environment. When the token is unset the
// adapter prints a clear message and the process exits 0 (no token committed or
// hardcoded). Honors --subject/--type/--year and caps items to --count.
const ALOC_BASE = "https://questions.aloc.com.ng";
const DEFAULT_COUNT = 20;

class AlocAdapter implements SourceAdapter {
  name = "aloc";
  constructor(
    private token: string,
    private opts: { subject?: string; type?: string; year?: string; count: number },
  ) {}

  async fetchRecords(): Promise<RawRecord[]> {
    const { subject, type, year, count } = this.opts;
    const headers = { AccessToken: this.token, Accept: "application/json" };

    // Prefer the batch endpoint /api/v2/m. A single request returns a batch of
    // items; we do NOT loop-hammer the API and simply cap the returned items to
    // --count. Fall back to the single-question endpoint /api/v2/q on failure.
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (type) params.set("type", type);
    if (year) params.set("year", year);
    const query = params.toString() ? `?${params.toString()}` : "";

    // We fall back to the single-question endpoint ONLY on a transport-level
    // failure of the batch call (network error or a non-OK HTTP status). A
    // successful 200 is treated as authoritative: its body shape defines the
    // result, even when `data` is a single object ([data]) or an empty batch
    // ([]). Previously an unexpected-but-successful shape would silently fall
    // back and return one question when many were requested; that shape
    // mismatch is now surfaced (an empty batch simply yields zero items)
    // instead of being masked by the single-question path.
    let items: AlocItem[] = [];
    try {
      const res = await fetch(`${ALOC_BASE}/api/v2/m${query}`, { headers });
      if (!res.ok) throw new Error(`ALOC batch endpoint returned ${res.status}`);
      const body: any = await res.json();
      const data = body?.data;
      items = Array.isArray(data) ? data : data ? [data] : [];
    } catch (batchErr: any) {
      // Transport failure on the batch endpoint -> fall back to a single question.
      const res = await fetch(`${ALOC_BASE}/api/v2/q${query}`, { headers });
      if (!res.ok) {
        throw new Error(
          `ALOC fetch failed (batch: ${batchErr?.message ?? "error"}; single: ${res.status}).`,
        );
      }
      const body: any = await res.json();
      const data = body?.data;
      items = Array.isArray(data) ? data : data ? [data] : [];
    }

    return items.slice(0, count).map(alocItemToRaw);
  }
}

// Build the adapter selected by --source, validating adapter-specific args.
// May exit the process (e.g. ALOC without a token exits 0).
function buildAdapter(args: Record<string, string | boolean>): SourceAdapter {
  const source = String(args.source ?? "");

  if (source === "file") {
    const file = args.file;
    if (typeof file !== "string" || file === "") {
      console.error("Error: --file=PATH is required for --source=file.");
      process.exit(1);
    }
    return new FileAdapter(file, args["aloc-json"] === true);
  }

  if (source === "aloc") {
    const token = process.env.ALOC_ACCESS_TOKEN;
    if (!token) {
      console.log(
        [
          "ALOC ingestion requires an access token.",
          "",
          "Set ALOC_ACCESS_TOKEN to a free token from the ALOC playground:",
          "  https://questions.aloc.com.ng/",
          "",
          "Then re-run, e.g.:",
          "  ALOC_ACCESS_TOKEN=<your-token> npm run ingest -- --source=aloc --subject=english --type=utme --year=2019 --count=20",
          "",
          "No token is committed or hardcoded. Exiting.",
        ].join("\n"),
      );
      process.exit(0);
    }
    const count = Number(args.count);
    return new AlocAdapter(token, {
      subject: typeof args.subject === "string" ? args.subject : undefined,
      type: typeof args.type === "string" ? args.type : undefined,
      year: typeof args.year === "string" ? args.year : undefined,
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : DEFAULT_COUNT,
    });
  }

  console.error(
    `Error: --source must be 'file' or 'aloc' (got ${source ? `'${source}'` : "nothing"}).`,
  );
  process.exit(1);
}

// Collect an array or async-iterable of records into a flat array.
async function collect(
  result: RawRecord[] | AsyncIterable<RawRecord>,
): Promise<RawRecord[]> {
  if (Array.isArray(result)) return result;
  const out: RawRecord[] = [];
  for await (const r of result) out.push(r);
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const adapter = buildAdapter(args);

  // DB is required for the actual import (buildAdapter may already have exited
  // for ALOC-without-token before we get here).
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL is not set. Set it before running the ingest CLI.");
    process.exit(1);
  }

  // Lazy import: server/storage.ts throws on import when DATABASE_URL is unset,
  // so only load it now that we know DATABASE_URL is present.
  const { storage, pool } = await import("../server/storage");

  console.log(`Ingesting via '${adapter.name}' adapter...`);
  const records = await collect(await adapter.fetchRecords());
  console.log(`Fetched ${records.length} record(s).`);

  // Same normalize + dedupe + upsert core as the admin endpoint.
  let created = 0;
  let skippedDuplicates = 0;
  const errors: { row: number; message: string }[] = [];

  const ctx = await createResolutionContext(storage, records);
  for (let i = 0; i < records.length; i++) {
    const row = i + 1;
    const result = normalizeQuestion(records[i], ctx);
    if (!result.ok) {
      errors.push({ row, message: result.error });
      continue;
    }
    try {
      const dup = await storage.findDuplicateQuestion({
        questionText: result.value.questionText,
        examBodyId: result.value.examBodyId,
        subjectId: result.value.subjectId,
        year: result.value.year,
      });
      if (dup) {
        skippedDuplicates++;
        continue;
      }
      await storage.createQuestion(result.value);
      created++;
    } catch (e: any) {
      errors.push({ row, message: e?.message ?? "Failed to persist row." });
    }
  }

  const report = { created, skippedDuplicates, total: records.length, errors };
  console.log("\nImport report:");
  console.log(JSON.stringify(report, null, 2));

  // Close the pg pool so the process exits cleanly.
  await pool.end().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
