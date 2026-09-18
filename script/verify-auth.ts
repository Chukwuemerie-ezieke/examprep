/**
 * In-process verification harness for FEAT-001 (Phase 2 auth).
 *
 * Boots an Express app wired exactly like server/index.ts (express-session +
 * connect-pg-simple + passport) against a REAL Postgres over a Unix-domain
 * socket, listens on a Unix socket (loopback TCP is blocked in-sandbox), and
 * drives real HTTP requests with cookie propagation. Exercises real code paths:
 * real DB reads/writes, real scrypt hashing, real session cookies.
 */
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import http from "http";
import { registerRoutes } from "../server/routes";
import { configurePassport } from "../server/auth";
import { seedAdminUser } from "../server/seed";
import { db, pool } from "../server/storage";
import { users, quizSessions } from "@shared/schema";
import { eq } from "drizzle-orm";

const SOCK_PATH = "/tmp/verify-app.sock";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ok  - ${msg}`);
  } else {
    failed++;
    console.error(`  FAIL - ${msg}`);
  }
}

// Minimal cookie-aware HTTP client over the Unix socket.
function makeClient() {
  let cookie = "";
  const request = async function request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any; setCookie?: string }> {
    return new Promise((resolve, reject) => {
      const payload = body !== undefined ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cookie) headers["cookie"] = cookie;
      if (payload) headers["content-length"] = String(Buffer.byteLength(payload));
      const req = http.request(
        { socketPath: SOCK_PATH, path, method, headers },
        (res) => {
          const sc = res.headers["set-cookie"];
          if (sc && sc.length) {
            // keep just the name=value part of the first cookie
            cookie = sc.map((c) => c.split(";")[0]).join("; ");
          }
          let data = "";
          res.on("data", (d) => (data += d));
          res.on("end", () => {
            let json: any = null;
            try { json = data ? JSON.parse(data) : null; } catch { json = data; }
            resolve({ status: res.statusCode || 0, json, setCookie: sc?.join("; ") });
          });
        },
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  };
  return { request };
}

async function main() {
  // Clean slate for users/sessions so the run is deterministic.
  await db.delete(quizSessions);
  await db.delete(users);

  // --- Build app like server/index.ts ---
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const PgSession = connectPgSimple(session);
  const store = new PgSession({ pool, tableName: "session", createTableIfMissing: true });
  // Give the store a beat to create the session table, then clear it.
  await new Promise((r) => setTimeout(r, 500));
  await pool.query("DELETE FROM session").catch(() => {});
  app.use(session({ store, secret: "test-secret", resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax" } }));
  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());
  const httpServer = http.createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise<void>((resolve) => httpServer.listen(SOCK_PATH, resolve));

  try {
    // ===== First-admin seeding idempotency =====
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "admin-password-123";
    await seedAdminUser();
    await seedAdminUser(); // second call must be idempotent
    const adminRows = await db.select().from(users).where(eq(users.email, "admin@example.com"));
    assert(adminRows.length === 1, "first-admin seeding creates exactly one admin and is idempotent");
    assert(adminRows[0]?.isAdmin === true, "seeded admin has isAdmin=true");
    assert(adminRows[0]?.passwordHash !== "admin-password-123" && adminRows[0]?.passwordHash.startsWith("scrypt$"), "admin password stored as scrypt hash, not plaintext");

    const userA = makeClient();
    const userB = makeClient();
    const adminClient = makeClient();

    // ===== Signup =====
    const suA = await userA.request("POST", "/api/auth/signup", { email: "alice@example.com", password: "password123", displayName: "Alice" });
    assert(suA.status === 201, `signup returns 201 (got ${suA.status})`);
    assert(suA.json && suA.json.passwordHash === undefined, "signup response has no passwordHash");
    assert(suA.json?.email === "alice@example.com", "signup returns the created user email");

    const aliceRow = await db.select().from(users).where(eq(users.email, "alice@example.com"));
    assert(aliceRow[0]?.passwordHash.startsWith("scrypt$") && aliceRow[0]?.passwordHash !== "password123", "stored password is a scrypt hash (never plaintext)");

    // Duplicate email -> 409
    const dup = await userA.request("POST", "/api/auth/signup", { email: "alice@example.com", password: "password123" });
    assert(dup.status === 409, `duplicate signup rejected with 409 (got ${dup.status})`);

    // Signup validation (short password) -> 400
    const badpw = await makeClient().request("POST", "/api/auth/signup", { email: "x@example.com", password: "short" });
    assert(badpw.status === 400, `short password rejected with 400 (got ${badpw.status})`);

    // ===== me (authed via signup session) =====
    const meA = await userA.request("GET", "/api/auth/me");
    assert(meA.status === 200 && meA.json?.email === "alice@example.com", "GET /api/auth/me returns the safe user when authed");
    assert(meA.json?.passwordHash === undefined, "me response has no passwordHash");

    // ===== me unauthenticated =====
    const meAnon = await makeClient().request("GET", "/api/auth/me");
    assert(meAnon.status === 401, `GET /api/auth/me is 401 when unauthenticated (got ${meAnon.status})`);

    // ===== logout =====
    const lo = await userA.request("POST", "/api/auth/logout");
    assert(lo.status === 200 && lo.json?.ok === true, "logout returns { ok:true }");
    const meAfterLogout = await userA.request("GET", "/api/auth/me");
    assert(meAfterLogout.status === 401, `me is 401 after logout (got ${meAfterLogout.status})`);

    // ===== login wrong password =====
    const badLogin = await userA.request("POST", "/api/auth/login", { email: "alice@example.com", password: "wrongpass" });
    assert(badLogin.status === 401, `login with wrong password returns 401 (got ${badLogin.status})`);

    // ===== login correct =====
    const okLogin = await userA.request("POST", "/api/auth/login", { email: "alice@example.com", password: "password123" });
    assert(okLogin.status === 200 && okLogin.json?.email === "alice@example.com", "login with correct credentials succeeds");
    const meRelogin = await userA.request("GET", "/api/auth/me");
    assert(meRelogin.status === 200, "session established after login (me is 200)");

    // ===== second user =====
    await userB.request("POST", "/api/auth/signup", { email: "bob@example.com", password: "password123", displayName: "Bob" });

    // ===== quiz sessions: unauthenticated blocked =====
    const anonList = await makeClient().request("GET", "/api/quiz-sessions");
    assert(anonList.status === 401, `GET /api/quiz-sessions requires auth (got ${anonList.status})`);

    // ===== create sessions for A and B =====
    const createBody = { examBodyId: 1, subjectId: 1, totalQuestions: 5, createdAt: new Date().toISOString() };
    const aSess = await userA.request("POST", "/api/quiz-sessions", { ...createBody, userId: 99999 /* attempt to spoof - must be ignored */ });
    assert(aSess.status === 200, `user A creates a session (got ${aSess.status})`);
    const aSessId = aSess.json?.id;
    assert(aSess.json?.userId !== 99999, "client-provided userId is ignored (server sets owner)");

    const bSess = await userB.request("POST", "/api/quiz-sessions", createBody);
    const bSessId = bSess.json?.id;

    // ===== list is user-scoped =====
    const aList = await userA.request("GET", "/api/quiz-sessions");
    const bList = await userB.request("GET", "/api/quiz-sessions");
    assert(aList.json.length === 1 && aList.json[0].id === aSessId, "user A sees only their own session");
    assert(bList.json.length === 1 && bList.json[0].id === bSessId, "user B sees only their own session");
    assert(!aList.json.some((s: any) => s.id === bSessId), "user A cannot see user B's session in the list");

    // ===== ownership on GET by id =====
    const aGetsB = await userA.request("GET", `/api/quiz-sessions/${bSessId}`);
    assert(aGetsB.status === 404, `user A cannot GET user B's session by id (got ${aGetsB.status})`);
    const aGetsOwn = await userA.request("GET", `/api/quiz-sessions/${aSessId}`);
    assert(aGetsOwn.status === 200, "user A can GET their own session by id");

    // ===== ownership on PATCH =====
    const aPatchesB = await userA.request("PATCH", `/api/quiz-sessions/${bSessId}`, { answeredQuestions: 3 });
    assert(aPatchesB.status === 404, `user A cannot PATCH user B's session (got ${aPatchesB.status})`);

    // ===== ownership on submit =====
    const aSubmitsB = await userA.request("POST", `/api/quiz-sessions/${bSessId}/submit`, { answers: {} });
    assert(aSubmitsB.status === 404, `user A cannot submit user B's session (got ${aSubmitsB.status})`);
    const aSubmitsOwn = await userA.request("POST", `/api/quiz-sessions/${aSessId}/submit`, { answers: {}, questionIds: [] });
    assert(aSubmitsOwn.status === 200, `user A can submit their own session (got ${aSubmitsOwn.status})`);

    // ===== per-user stats =====
    const aStats = await userA.request("GET", "/api/stats");
    assert(aStats.json.totalSessions === 1, `user A personal totalSessions=1 (got ${aStats.json.totalSessions})`);
    assert(aStats.json.completedSessions === 1, `user A completedSessions=1 after submit (got ${aStats.json.completedSessions})`);
    const bStats = await userB.request("GET", "/api/stats");
    assert(bStats.json.totalSessions === 1 && bStats.json.completedSessions === 0, "user B personal stats independent of A");
    const anonStats = await makeClient().request("GET", "/api/stats");
    assert(anonStats.status === 200 && anonStats.json.totalSessions === 0 && typeof anonStats.json.totalQuestions === "number", "unauthenticated stats: zeroed personal, global catalog present");

    // ===== requireAdmin role authorization =====
    const nonAdminAdminCall = await userA.request("GET", "/api/admin/study-tips");
    assert(nonAdminAdminCall.status === 401, `non-admin authenticated user rejected from admin route (got ${nonAdminAdminCall.status})`);

    await adminClient.request("POST", "/api/auth/login", { email: "admin@example.com", password: "admin-password-123" });
    const adminAdminCall = await adminClient.request("GET", "/api/admin/study-tips");
    assert(adminAdminCall.status === 200, `admin user allowed on admin route (got ${adminAdminCall.status})`);
    const anonAdminCall = await makeClient().request("GET", "/api/admin/study-tips");
    assert(anonAdminCall.status === 401, `unauthenticated rejected from admin route (got ${anonAdminCall.status})`);

    // admin/verify role-based
    const adminVerify = await adminClient.request("POST", "/api/admin/verify", {});
    assert(adminVerify.status === 200 && adminVerify.json?.ok === true, "admin/verify ok:true for admin session");
    const nonAdminVerify = await userA.request("POST", "/api/admin/verify", {});
    assert(nonAdminVerify.status === 401, "admin/verify 401 for non-admin");
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await pool.end();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
