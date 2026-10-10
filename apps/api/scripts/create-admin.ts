/**
 * Création du premier administrateur : `pnpm admin:create` (depuis la racine du projet).
 * Les informations sont saisies à l'invite ; le mot de passe est masqué et n'est jamais écrit sur disque.
 * En mode non interactif (CI), variables ADMIN_EMAIL, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_PASSWORD.
 */
import { createInterface } from "node:readline/promises";
import { config as loadDotenv } from "dotenv";
import { createPrismaClient } from "../src/common/prisma";
import { AdminBootstrapError, createAdminAccount } from "../src/modules/auth/admin-bootstrap";

loadDotenv({ path: [".env", "../../.env"], quiet: true });

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function collect() {
  if (!process.stdin.isTTY) {
    const env = process.env;
    return {
      email: env["ADMIN_EMAIL"] ?? "",
      firstName: env["ADMIN_FIRST_NAME"] ?? "",
      lastName: env["ADMIN_LAST_NAME"] ?? "",
      password: env["ADMIN_PASSWORD"] ?? "",
    };
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("E-mail de l'administrateur : ");
  const firstName = await rl.question("Prénom : ");
  const lastName = await rl.question("Nom : ");
  rl.close();
  const password = await readHidden("Mot de passe (10 caractères minimum, masqué) : ");
  const confirmation = await readHidden("Confirmer le mot de passe : ");
  if (password !== confirmation) throw new AdminBootstrapError("Les deux mots de passe sont différents.");
  return { email, firstName, lastName, password };
}

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL manquante (voir .env.example).");
  process.exit(1);
}
const prisma = createPrismaClient(databaseUrl);
try {
  const user = await createAdminAccount(prisma, await collect());
  console.log(`Administrateur créé : ${user.email}`);
} catch (err) {
  if (err instanceof AdminBootstrapError) console.error(err.message);
  else console.error("Échec :", err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
