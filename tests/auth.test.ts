import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../server/password";

describe("hashPassword", () => {
  it("produces a scrypt$salt$hash string that is not the plaintext", async () => {
    const plain = "correct horse battery staple";
    const stored = await hashPassword(plain);
    expect(typeof stored).toBe("string");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored.split("$")).toHaveLength(3);
    expect(stored).not.toContain(plain);
    expect(stored).not.toBe(plain);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const plain = "same-password";
    const a = await hashPassword(plain);
    const b = await hashPassword(plain);
    expect(a).not.toBe(b);
    // Salts (second segment) must differ.
    expect(a.split("$")[1]).not.toBe(b.split("$")[1]);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password (round-trip)", async () => {
    const plain = "s3cret-passphrase";
    const stored = await hashPassword(plain);
    await expect(verifyPassword(plain, stored)).resolves.toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const stored = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(false);
  });

  it("returns false for a malformed stored string (bad prefix)", async () => {
    const stored = await hashPassword("pw");
    const [, salt, hash] = stored.split("$");
    await expect(verifyPassword("pw", `bcrypt$${salt}$${hash}`)).resolves.toBe(false);
  });

  it("returns false for a wrong segment count", async () => {
    await expect(verifyPassword("pw", "scrypt$onlytwo")).resolves.toBe(false);
    await expect(verifyPassword("pw", "scrypt$a$b$c")).resolves.toBe(false);
  });

  it("returns false for an empty hash segment", async () => {
    const stored = await hashPassword("pw");
    const [, salt] = stored.split("$");
    await expect(verifyPassword("pw", `scrypt$${salt}$`)).resolves.toBe(false);
  });

  it("returns false for a non-string stored value", async () => {
    // @ts-expect-error deliberately passing a non-string to exercise the guard
    await expect(verifyPassword("pw", null)).resolves.toBe(false);
    // @ts-expect-error deliberately passing a non-string to exercise the guard
    await expect(verifyPassword("pw", 12345)).resolves.toBe(false);
  });
});
