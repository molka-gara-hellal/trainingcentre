import { config as loadDotenv } from "dotenv";
import { loadEnv } from "./config/env";
import { consoleEmailProvider, noopEmailProvider, type EmailProvider } from "./common/email";
import { smtpEmailProvider } from "./common/email-smtp";
import { createLogger } from "./common/logger";
import { createPrismaClient } from "./common/prisma";
import { createJwtService } from "./common/tokens";
import { createGrpcServer, listen } from "./grpc/server";

// En dev, le .env est à la racine du monorepo (en Docker/prod, les variables viennent de l'environnement).
loadDotenv({ path: [".env", "../../.env"], quiet: true });

const env = loadEnv();
const logger = createLogger(env);

// Échec rapide : on vérifie la base avant d'ouvrir le port gRPC.
const prisma = createPrismaClient(env.DATABASE_URL);
try {
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Connexion PostgreSQL OK");
} catch (err) {
  logger.fatal({ err }, "Connexion PostgreSQL impossible (base démarrée ? DATABASE_URL correcte ?)");
  process.exit(1);
}

function buildEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === "console") return consoleEmailProvider(logger);
  if (env.EMAIL_PROVIDER === "smtp") {
    return smtpEmailProvider(
      {
        host: env.SMTP_HOST!,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === "true",
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.EMAIL_FROM!,
        brand: env.EMAIL_BRAND_NAME ?? new URL(env.SITE_URL).hostname,
      },
      logger,
    );
  }
  return noopEmailProvider(logger);
}

const accessTtlSeconds = env.ACCESS_TOKEN_TTL_MINUTES * 60;
const server = createGrpcServer({
  prisma,
  logger,
  auth: {
    jwt: createJwtService({ secret: env.JWT_ACCESS_SECRET, accessTtlSeconds }),
    session: { accessTtlSeconds, refreshTtlSeconds: env.REFRESH_TOKEN_TTL_DAYS * 86_400 },
    email: buildEmailProvider(),
    siteUrl: env.SITE_URL,
  },
});
try {
  const port = await listen(server, `${env.API_HOST}:${env.API_PORT}`);
  logger.info(`Serveur gRPC en écoute sur ${env.API_HOST}:${port}`);
} catch (err) {
  logger.fatal({ err }, "Impossible de démarrer le serveur gRPC (port déjà utilisé ?)");
  process.exit(1);
}

function shutdown(signal: string) {
  logger.info(`${signal} reçu, arrêt en cours...`);
  server.tryShutdown(async (err) => {
    if (err) logger.error({ err }, "Erreur à l'arrêt");
    await prisma.$disconnect();
    process.exit(err ? 1 : 0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
