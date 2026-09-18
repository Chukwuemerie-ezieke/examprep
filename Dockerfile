# syntax=docker/dockerfile:1
#
# Multi-stage build for the ExamPrep full-stack app.
#
# A single Node process serves BOTH the JSON API and the React client: in
# production server/index.ts calls serveStatic (server/static.ts), which serves
# the Vite-built SPA from dist/public sitting alongside the server bundle.
#
# The build stage runs `npm run build` (script/build.ts), which:
#   (a) vite-builds the client into dist/public, and
#   (b) esbuild-bundles server/index.ts into dist/index.cjs (CJS).
# script/build.ts marks most dependencies as esbuild `external`, so the bundle
# still requires production node_modules at runtime (express, pg, drizzle-orm,
# passport, connect-pg-simple, helmet, etc.). The runtime stage therefore ships
# production node_modules in addition to dist/.
#
# ---------------------------------------------------------------------------
# Required / optional runtime environment variables (provided at `docker run`
# time, NEVER baked into the image):
#   DATABASE_URL    (required) Postgres connection string.
#   SESSION_SECRET  (required in production) long random session signing secret;
#                   the server throws on startup if unset when NODE_ENV=production.
#   ADMIN_EMAIL     (optional) first-admin bootstrap; with ADMIN_PASSWORD, seeds
#   ADMIN_PASSWORD  (optional) an admin user on startup if none exists (idempotent).
#   PORT            (optional) HTTP port to listen on; defaults to 5000.
# ---------------------------------------------------------------------------

# ---- Build stage ----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install all dependencies (incl. dev) needed to build the client + server.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and produce dist/index.cjs + dist/public.
COPY . .
RUN npm run build

# Prune dev dependencies so only production node_modules remain to copy into
# the runtime image (keeps the final image lean; the externalized deps stay).
RUN npm prune --omit=dev

# ---- Runtime stage --------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Ship only production artifacts: the built dist/ (server bundle + client SPA)
# and the pruned production node_modules for the externalized dependencies.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# The single process serves both the API and the client on this port.
EXPOSE 5000

# Equivalent to `npm start` (NODE_ENV=production node dist/index.cjs).
CMD ["node", "dist/index.cjs"]
