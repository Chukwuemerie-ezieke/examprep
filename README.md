# ExamPrep

ExamPrep is a full-stack web app for practising Nigerian secondary-school
examinations: WAEC, NECO, and JAMB. It ships a catalog of past-question style
items across Mathematics, English Language, Physics, and Chemistry, and lets a
signed-in user work through them in two ways:

- **Practice mode**, with immediate answers and explanations.
- **CBT / exam mode**, a timed computer-based-test flow where questions are
  served without answers, submitted as a set, and graded server-side.

Each user gets their own **quiz history** and **stats**, and a **role-based
admin area** (authorized by the logged-in user's `isAdmin` role) is available
for managing subjects, topics, questions (including bulk import), and study
tips.

## Stack

**Backend**

- Express 5 (TypeScript, ESM) serving a JSON API.
- Drizzle ORM over PostgreSQL (`drizzle-orm/node-postgres` with a `pg` pool).
- Authentication with `express-session` + `passport-local`, sessions stored in
  Postgres via `connect-pg-simple`.
- Password hashing with Node's built-in `crypto.scrypt` (no external
  dependency); hashes are stored as `scrypt$<saltHex>$<hashHex>`.
- `helmet` for security headers.

**Frontend**

- React 18 with Vite 7.
- Wouter for routing (hash-based routing).
- TanStack Query for server state.
- Tailwind CSS with shadcn/Radix UI components.

A single Node process serves both the API and the client. In development, Vite
runs as middleware with hot reload; in production, the built SPA is served from
`dist/public` alongside the server bundle.

## Prerequisites

- **Node 20.** The project targets Node 20 for production, CI, and Docker.
- **A running PostgreSQL instance** reachable via `DATABASE_URL`.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file by copying the example and filling in real
   values:

   ```bash
   cp .env.example .env
   ```

   See the [Environment variables](#environment-variables) section for what each
   value means.

3. Create the database schema. Drizzle pushes the schema straight from
   `shared/schema.ts`:

   ```bash
   npm run db:push
   ```

4. Seeding runs automatically on startup and is idempotent:

   - `seedDatabase()` (in `server/seed.ts`) seeds the catalog (exam bodies,
     subjects, topics, questions, study tips) the first time it runs against an
     empty database, and does nothing on subsequent boots.
   - The **first admin account** is created from `ADMIN_EMAIL` and
     `ADMIN_PASSWORD` when both are set and no user with that email exists. The
     password is scrypt-hashed, and an existing admin is left untouched.

## Running

### Development

```bash
npm run dev
```

This runs `server/index.ts` with `tsx`, mounts Vite as middleware for the
client, and enables hot reload. `NODE_ENV` is `development`.

Note: if `SESSION_SECRET` is not set outside production, the server generates an
ephemeral secret and logs a warning. Sessions will not survive a restart (you
will be logged out on each restart). Set a fixed `SESSION_SECRET` in `.env` for
stable local sessions.

### Type-checking

```bash
npm run check
```

This runs `tsc` and must pass with zero errors.

### Production

```bash
npm run build
npm start
```

- `npm run build` runs `script/build.ts`, which builds the client into
  `dist/public` (Vite) and bundles the server into `dist/index.cjs` (esbuild).
- `npm start` runs `node dist/index.cjs` with `NODE_ENV=production`, serving the
  API and the built client from a single process on `PORT` (default `5000`).

## Testing

Tests use [Vitest](https://vitest.dev/) and live under `tests/` as
`*.test.ts`. Run the suite once (non-watch):

```bash
npm test
```

For a watch loop during development:

```bash
npm run test:watch
```

The current suite is pure and needs no database. It covers:

- **Password hashing** (`tests/auth.test.ts`): scrypt hash/verify round-trip and
  rejection of wrong or malformed input.
- **Zod validation** (`tests/schema.test.ts`): the signup, login, and insert
  schemas from `shared/schema.ts`.
- **CBT grading** (`tests/grading.test.ts`): the pure grading function in
  `server/grading.ts`.

By convention, any database-gated integration tests run only when a real
Postgres is reachable. To enable that subset, point `DATABASE_URL` at a
reachable Postgres instance and run `npm run db:push` first, then `npm test`.

## Docker

The repo ships a multi-stage `Dockerfile`. The build stage installs all
dependencies, runs `npm run build`, then prunes dev dependencies; the runtime
stage ships `dist/` plus the pruned production `node_modules`. The single
container process serves both the API and the client on `PORT`.

Build the image:

```bash
docker build -t examprep .
```

Run it, supplying runtime environment variables (never bake secrets into the
image):

```bash
docker run --rm -p 5000:5000 \
  -e DATABASE_URL="postgres://user:password@host:5432/examprep" \
  -e SESSION_SECRET="a-long-random-string" \
  -e ADMIN_EMAIL="admin@example.com" \
  -e ADMIN_PASSWORD="change-me" \
  examprep
```

Required and optional runtime variables (matching the `Dockerfile`):

- `DATABASE_URL` (required): Postgres connection string.
- `SESSION_SECRET` (required in production): the server throws on startup if it
  is unset when `NODE_ENV=production`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` (optional): first-admin bootstrap on
  startup, idempotent.
- `PORT` (optional): HTTP port to listen on; defaults to `5000`. The container
  exposes `5000`.

`NODE_ENV` is set to `production` in the runtime image.

## Environment variables

Mirror `.env.example`. Copy it to `.env` and fill in real values; never commit
`.env`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | none | PostgreSQL connection string in the form `postgres://<user>:<password>@<host>:<port>/<database>`. |
| `SESSION_SECRET` | In production | none | Session signing secret. Required in production (the server throws on startup if unset when `NODE_ENV=production`). In non-production, an ephemeral secret is generated with a warning and sessions do not survive a restart. Use a long random value, e.g. `openssl rand -hex 32`. |
| `ADMIN_EMAIL` | No | none | First-admin bootstrap. With `ADMIN_PASSWORD`, seeds an admin user on startup if no user with that email exists. |
| `ADMIN_PASSWORD` | No | none | Password for the first-admin account (scrypt-hashed at seed time). |
| `PORT` | No | `5000` | HTTP port the server listens on. |
| `NODE_ENV` | No | `development` | Node environment: `development` or `production`. |

## Project structure

```
server/
  index.ts     Express bootstrap: helmet, JSON body limit, session + passport, seed, routes, listen on PORT
  routes.ts    All JSON API routes (auth, catalog, quiz sessions, CBT submit, admin)
  storage.ts   Drizzle data layer: exports the pg pool, db, and the storage (DatabaseStorage) implementation
  seed.ts      Idempotent seeding: seedDatabase() (catalog) and seedAdminUser() (first admin)
  auth.ts      Passport local strategy, session wiring, and password helpers (re-exported)
  password.ts  scrypt hashPassword / verifyPassword helpers
  grading.ts   Pure CBT grading function used by the submit route
  static.ts    Production static serving of the built client from dist/public
  vite.ts      Vite dev middleware wiring (development only)
shared/
  schema.ts    Drizzle tables, Zod schemas (signup/login/insert), and shared types
client/
  src/         React 18 SPA (Vite, Wouter, TanStack Query, Tailwind + shadcn)
script/
  build.ts     Client + server build (Vite + esbuild) with a runtime dependency allowlist
  verify-auth.ts  In-process auth verification harness (not part of the test suite)
tests/         Vitest suites: auth.test.ts, schema.test.ts, grading.test.ts
.github/workflows/ci.yml  GitHub Actions CI pipeline
Dockerfile     Multi-stage production image
```

Path aliases: `@` maps to `client/src` and `@shared` maps to `shared`, defined
in both `vite.config.ts` / `vitest.config.ts` and `tsconfig.json`.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request
to `main`. It spins up a PostgreSQL service, then runs `npm ci`, the type check
(`npm run check`), `npm run db:push`, the tests (`npm test`), and the build
(`npm run build`).
