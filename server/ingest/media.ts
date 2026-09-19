// PURE, DB-free media/URL hygiene. No Express, no storage, no npm deps — a
// tiny helper the ingestion core imports and unit tests exercise directly.

// The canonical ALOC image base. ALOC v2 items may carry a relative image path
// (e.g. "questions/abc.png"); we resolve those against this origin.
export const ALOC_IMAGE_BASE_URL = "https://questions.aloc.com.ng";

// Sanitize a raw image reference into a safe absolute URL string, or null.
//
// Rules (documented contract):
//   - null / undefined / empty / non-string  -> null
//   - the value is trimmed first
//   - an absolute http:// or https:// URL is accepted (returned normalized)
//   - a RELATIVE path/filename is resolved against opts.baseUrl when provided
//     (ALOC images can be relative); with no baseUrl, a relative value -> null
//   - any other scheme (javascript:, data:, ftp:, mailto:, etc.) -> null
//
// This is deliberately strict: only http(s) URLs ever come out, so a hostile
// value like `javascript:alert(1)` or `data:...` can never reach the client.
export function sanitizeImageUrl(
  raw: unknown,
  opts?: { baseUrl?: string },
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  // Try to parse as an absolute URL first. new URL() succeeds for anything with
  // a scheme (http:, javascript:, data:, ftp:, ...), so we then whitelist http(s).
  const asAbsolute = tryParseUrl(trimmed);
  if (asAbsolute) {
    return isHttp(asAbsolute) ? asAbsolute.toString() : null;
  }

  // Not an absolute URL: treat it as a relative path and resolve against the
  // provided base (if any). The resolved URL must still be http(s).
  if (opts?.baseUrl) {
    const resolved = tryParseUrl(trimmed, opts.baseUrl);
    if (resolved && isHttp(resolved)) return resolved.toString();
  }
  return null;
}

function tryParseUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

function isHttp(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}
