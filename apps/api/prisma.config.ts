import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// Les commandes Prisma sont lancées depuis apps/api : le .env est à la racine du monorepo.
loadDotenv({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Volontairement tolérant : `prisma generate` (lancé par `pnpm install`) n'a pas besoin de la base.
    // migrate / seed échouent clairement si DATABASE_URL est vide.
    url: process.env["DATABASE_URL"] ?? "",
  },
});
