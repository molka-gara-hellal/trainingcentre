import { defineConfig } from "vitest/config";

// Tests UNITAIRES : aucune base de données requise. Lancés par `pnpm test`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.int.test.ts"],
  },
});
