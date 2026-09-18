import { defineConfig } from "vitest/config";
import path from "path";

// Vitest configuration. Reuses the same path aliases as vite.config.ts so tests
// can import from @ (client/src) and @shared (shared). Tests run in a Node
// environment (backend logic) and live under tests/ as *.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
