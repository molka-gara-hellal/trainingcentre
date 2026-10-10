import { execSync } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { Client } from "pg";

/**
 * Prépare une base DÉDIÉE aux tests. On n'utilise JAMAIS la base de développement : les tests vident les tables.
 *
 * - TEST_DATABASE_URL (optionnel) : URL de la base de test. Sinon, DATABASE_URL avec "_test" ajouté au nom de la base.
 * - TEST_DB_PREPARED=1 : saute la création + les migrations (CI ou base déjà préparée).
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env["TEST_DATABASE_URL"];
  const source = explicit ?? env["DATABASE_URL"];
  if (!source) {
    throw new Error("DATABASE_URL (ou TEST_DATABASE_URL) manquante : voir .env.example.");
  }
  const url = new URL(source);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName) throw new Error("Nom de base absent de l'URL de connexion.");
  if (!dbName.endsWith("_test")) {
    if (explicit) {
      throw new Error(`TEST_DATABASE_URL doit viser une base dont le nom finit par "_test" (reçu : ${dbName}).`);
    }
    url.pathname = `/${encodeURIComponent(`${dbName}_test`)}`;
  }
  return url.toString();
}

export default async function setup() {
  loadDotenv({ path: [".env", "../../.env"], quiet: true });
  const testUrl = resolveTestDatabaseUrl();
  process.env["TEST_DATABASE_URL"] = testUrl;

  if (process.env["TEST_DB_PREPARED"] === "1") return;

  // 1. Créer la base de test si elle n'existe pas (connexion à la base de maintenance "postgres").
  const target = new URL(testUrl);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const maintenance = new URL(testUrl);
  maintenance.pathname = "/postgres";
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
  } finally {
    await client.end();
  }

  // 2. Appliquer les migrations versionnées sur la base de test.
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
