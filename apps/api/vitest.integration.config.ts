import { defineConfig } from "vitest/config";

// Tests d'INTÉGRATION : vrai serveur gRPC + vrai PostgreSQL (base dédiée "<nom>_test").
// Lancés par `pnpm test:integration` (PostgreSQL doit tourner : `pnpm db:up`).
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Les fichiers partagent la même base : exécution séquentielle.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
