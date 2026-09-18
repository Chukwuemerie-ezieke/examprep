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

## Importing content

Questions can be added in bulk through two avenues that share the same core:
they normalize each record, resolve entities **by name**, de-duplicate, and
insert. Both reference the exam body, subject, and topic by their **names**
(not numeric ids).

Resolution rules (identical for both avenues):

- **Subjects and topics are auto-created** when their names are new
  (case-insensitive). Repeated names within one import map to a single row.
- **Exam bodies are rejected when unknown** — they are a small fixed seeded set
  (`WAEC`, `NECO`, `JAMB`) and are never auto-created, so a typo surfaces as a
  row error instead of silently creating a new body.
- **De-duplication is idempotent.** The dedupe key is the *normalized*
  `questionText` (lowercased, trimmed, internal whitespace collapsed) combined
  with the resolved `examBodyId`, `subjectId`, and `year`. Re-importing the same
  content skips the duplicates rather than inserting them again, so imports are
  safe to re-run.

Both avenues return a report: `{ created, skippedDuplicates, total, errors }`,
where `errors` is a list of `{ row, message }` (1-based row numbers).

### CSV column spec

The canonical column order is:

```
examBody,subject,topic,year,questionNumber,questionText,optionA,optionB,optionC,optionD,optionE,correctAnswer,explanation,difficulty,textbookRef
```

| Column | Required | Notes |
| --- | --- | --- |
| `examBody` | Yes | Name of a seeded exam body: `WAEC`, `NECO`, or `JAMB`. Unknown names are rejected. |
| `subject` | Yes | Subject name; auto-created if new. |
| `topic` | No | Topic name within the subject; auto-created if new. Blank means no topic. |
| `year` | Yes | Positive integer year. |
| `questionNumber` | No | Integer; blank allowed. |
| `questionText` | Yes | The question. |
| `optionA`–`optionD` | Yes | All four are required. |
| `optionE` | No | Optional fifth option; required only if `correctAnswer` is `E`. |
| `correctAnswer` | Yes | One of `A`–`E` (case-insensitive), must point at a provided option. |
| `explanation` | No | Falls back to a generic placeholder when empty. |
| `difficulty` | No | `easy`, `medium`, or `hard`; defaults to `medium`. |
| `textbookRef` | No | Free-text reference; blank allowed. |

### JSON example

A JSON import is an array of objects referencing entities by name:

```json
[
  {
    "examBody": "WAEC",
    "subject": "Mathematics",
    "topic": "Algebra",
    "year": 2019,
    "questionNumber": 1,
    "questionText": "What is 2 + 2?",
    "optionA": "3",
    "optionB": "4",
    "optionC": "5",
    "optionD": "6",
    "correctAnswer": "B",
    "explanation": "Basic arithmetic: 2 + 2 = 4.",
    "difficulty": "easy"
  }
]
```

### Admin UI

In the admin area, open the **Import** tab:

1. Choose the format (**CSV** or **JSON**).
2. Paste the content into the textarea, or **upload** a `.csv`/`.json` file
   (its text is loaded into the textarea).
3. Use **Download CSV template** / **Download JSON sample** to get a
   ready-to-fill starting point.
4. Click **Import** to see the `created` / `skippedDuplicates` / `total` counts
   and an expandable list of per-row errors.

The import posts to `POST /api/admin/questions/import` (admin-only). The older
`POST /api/admin/questions/bulk` endpoint (raw numeric-id JSON array) is
unchanged.

### CLI (`npm run ingest`)

`script/ingest.ts` is a `tsx` dev tool (not part of the server bundle) that runs
the same normalize + dedupe + insert core from the command line via a pluggable
`SourceAdapter` interface. It requires `DATABASE_URL`.

Import from a local file (CSV or JSON):

```bash
npm run ingest -- --source=file --file=path/to/questions.csv
npm run ingest -- --source=file --file=path/to/questions.json
```

For a JSON file whose elements are raw ALOC v2 items, add `--aloc-json` to map
them through the ALOC adapter shape.

Import from the [ALOC](https://questions.aloc.com.ng/) question bank:

```bash
npm run ingest -- --source=aloc --subject=english --type=utme --year=2019 --count=20
```

The ALOC source reads its token from `ALOC_ACCESS_TOKEN` (a free token from the
ALOC playground). If the token is unset, the CLI prints a message explaining how
to obtain one and exits cleanly **without** hardcoding any token. It requests a
single batch from `/api/v2/m` (falling back to `/api/v2/q`), caps the mapped
items to `--count` (default `20`), and does not hammer the API.

Notes:

- A **live ALOC fetch was not exercised in-sandbox** (no token available); the
  ALOC mapping is covered by fixture unit tests instead.
- **ALOC images are ignored.** The questions schema has no media column, so the
  `image` field on ALOC items is intentionally dropped (out of scope).

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
| `ALOC_ACCESS_TOKEN` | No | none | Access token for the ALOC source of the ingestion CLI (`npm run ingest -- --source=aloc ...`). Free token from the [ALOC playground](https://questions.aloc.com.ng/). Read from the environment only; never commit a real token. |

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
  analytics.ts Pure per-user analytics aggregation used by the analytics route
  ingest/      Pure, DB-free ingestion core: normalize.ts (normalizer + dedupe key),
               adapters.ts (dependency-free CSV parser + ALOC mapping), resolve.ts
               (DB-backed ResolutionContext factory: auto-create subjects/topics,
               reject unknown exam bodies) shared by the import endpoint and CLI
  static.ts    Production static serving of the built client from dist/public
  vite.ts      Vite dev middleware wiring (development only)
shared/
  schema.ts    Drizzle tables, Zod schemas (signup/login/insert), and shared types
client/
  src/         React 18 SPA (Vite, Wouter, TanStack Query, Tailwind + shadcn)
script/
  build.ts     Client + server build (Vite + esbuild) with a runtime dependency allowlist
  ingest.ts    Pluggable content-ingestion CLI (`npm run ingest`): file + ALOC adapters
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
