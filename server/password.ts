import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

// Password hashing primitives, isolated from passport/storage so they can be
// unit-tested without a database connection. auth.ts re-exports these.

const scryptAsync = promisify(scrypt);

// scrypt parameters. Keylen 64 bytes; default cost is fine for interactive auth.
const KEYLEN = 64;
const SALT_BYTES = 16;

// Hash a plaintext password with a per-password random salt using Node's
// built-in scrypt. Returns a self-describing string: `scrypt$<saltHex>$<hashHex>`.
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(plain, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

// Verify a plaintext password against a stored `scrypt$salt$hash` string.
// Uses timingSafeEqual and guards against malformed input / length mismatch.
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const derived = (await scryptAsync(plain, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
