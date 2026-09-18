import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { User } from "@shared/schema";

// Make req.user carry our User shape across the app.
type SchemaUser = User;
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends SchemaUser {}
  }
}

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

// Configure passport with a local (email + password) strategy and session
// serialization. Must be called once during app bootstrap.
export function configurePassport(): void {
  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) return done(null, false, { message: "Invalid credentials" });
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) return done(null, false, { message: "Invalid credentials" });
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as User).id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUserById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err as Error);
    }
  });
}
