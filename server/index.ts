import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { randomBytes } from "crypto";
import passport from "passport";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { pool } from "./storage";
import { configurePassport } from "./auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security headers. helmet's default contentSecurityPolicy blocks the Vite dev
// client and inline assets, so disable CSP outside production so the SPA loads.
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);

// Request body-size limits. Bulk question import can be large, so allow 2mb.
// The verify/rawBody hook is preserved for downstream consumers.
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ---- Sessions + authentication ----
// Persist sessions in Postgres via connect-pg-simple, backed by the shared pg
// pool. SESSION_SECRET is required in production; in non-production we fall back
// to a generated ephemeral secret (sessions won't survive a restart) with a
// clear warning, mirroring the Phase 1 fail-safe style.
const isProduction = process.env.NODE_ENV === "production";
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    throw new Error(
      "SESSION_SECRET is required in production. Set a long random value.",
    );
  }
  sessionSecret = randomBytes(32).toString("hex");
  console.warn(
    "[security] SESSION_SECRET is not set; using an ephemeral secret. Sessions will not survive a restart. Set SESSION_SECRET for stable sessions.",
  );
}

const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  pool,
  tableName: "session",
  createTableIfMissing: true,
});

// Trust the first proxy hop so secure cookies work behind a TLS-terminating
// proxy in production.
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Seed database with initial data
  await seedDatabase();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
