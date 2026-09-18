import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { hashPassword, verifyPassword } from "./password";

// Re-export the password hashing primitives so existing importers of
// `./auth` (e.g. server/routes.ts) keep working unchanged.
export { hashPassword, verifyPassword };

// Make req.user carry our User shape across the app.
type SchemaUser = User;
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends SchemaUser {}
  }
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
