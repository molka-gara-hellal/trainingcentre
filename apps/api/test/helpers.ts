import { credentials, Metadata, type ServiceError } from "@grpc/grpc-js";
import pino from "pino";
import { AdminServiceClient } from "@center/proto-gen/admin/v1/admin";
import { PaymentServiceClient } from "@center/proto-gen/payment/v1/payment";
import { AuthServiceClient } from "@center/proto-gen/auth/v1/auth";
import { CourseServiceClient } from "@center/proto-gen/course/v1/course";
import { NotificationServiceClient } from "@center/proto-gen/notification/v1/notification";
import { StudentServiceClient } from "@center/proto-gen/student/v1/student";
import { TrainerServiceClient } from "@center/proto-gen/trainer/v1/trainer";
import { UserServiceClient } from "@center/proto-gen/user/v1/user";
import { RegistrationServiceClient } from "@center/proto-gen/registration/v1/registration";
import { SiteServiceClient } from "@center/proto-gen/site/v1/site";
import { createPrismaClient, type PrismaClient } from "../src/common/prisma";
import { createRateLimiter, type RateLimiter } from "../src/common/rate-limit";
import type { Authenticator } from "../src/common/auth";
import type { EmailMessage, EmailProvider } from "../src/common/email";
import { createJwtService } from "../src/common/tokens";
import { createGrpcServer, listen } from "../src/grpc/server";

/** Limites très hautes : les tests fonctionnels ne doivent pas être gênés par la limitation de débit. */
export const relaxedRateLimiter = (): RateLimiter => {
  const high = { points: 100_000, durationSeconds: 60 };
  return createRateLimiter({ read: high, submit: high, auth: high, default: high });
};

export const TEST_JWT_SECRET = "secret-de-test-uniquement-0123456789abcdef";
export const TEST_ACCESS_TTL_SECONDS = 900;
export const TEST_REFRESH_TTL_SECONDS = 14 * 86_400;

export type TestApp = Awaited<ReturnType<typeof startTestApp>>;

export async function startTestApp(
  options: { rateLimiter?: RateLimiter; authenticator?: Authenticator; now?: () => Date } = {},
) {
  const url = process.env["TEST_DATABASE_URL"];
  if (!url || !new URL(url).pathname.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL absente ou ne vise pas une base *_test : arrêt par sécurité.");
  }
  const prisma = createPrismaClient(url);
  // Les e-mails ne partent nulle part : les tests lisent les liens ici.
  const emails: EmailMessage[] = [];
  const email: EmailProvider = {
    async send(message) {
      emails.push(message);
    },
  };
  const jwt = createJwtService({ secret: TEST_JWT_SECRET, accessTtlSeconds: TEST_ACCESS_TTL_SECONDS });
  const server = createGrpcServer({
    prisma,
    auth: {
      jwt,
      session: { accessTtlSeconds: TEST_ACCESS_TTL_SECONDS, refreshTtlSeconds: TEST_REFRESH_TTL_SECONDS },
      email,
      siteUrl: "http://localhost:3000",
    },
    logger: pino({ level: "silent" }),
    rateLimiter: options.rateLimiter ?? relaxedRateLimiter(),
    ...(options.authenticator && { authenticator: options.authenticator }),
    ...(options.now && { now: options.now }),
  });
  const port = await listen(server, "127.0.0.1:0");
  const address = `127.0.0.1:${port}`;
  const creds = credentials.createInsecure();
  const clients = {
    auth: new AuthServiceClient(address, creds),
    course: new CourseServiceClient(address, creds),
    registration: new RegistrationServiceClient(address, creds),
    site: new SiteServiceClient(address, creds),
    student: new StudentServiceClient(address, creds),
    user: new UserServiceClient(address, creds),
    trainer: new TrainerServiceClient(address, creds),
    notification: new NotificationServiceClient(address, creds),
    admin: new AdminServiceClient(address, creds),
    payment: new PaymentServiceClient(address, creds),
  };
  return {
    prisma,
    jwt,
    emails,
    clients,
    async close() {
      clients.auth.close();
      clients.course.close();
      clients.registration.close();
      clients.site.close();
      clients.student.close();
      clients.user.close();
      clients.trainer.close();
      clients.notification.close();
      clients.admin.close();
      clients.payment.close();
      await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
      await prisma.$disconnect();
    },
  };
}

type Callback<Res> = (error: ServiceError | null, response?: Res) => void;

/** Transforme un appel gRPC unaire à callback en Promise (rejette avec la ServiceError). */
export function call<Res>(invoke: (callback: Callback<Res>) => unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    invoke((error, response) => {
      if (error) reject(error);
      else resolve(response as Res);
    });
  });
}

export function metadata(entries: Record<string, string> = {}): Metadata {
  const md = new Metadata();
  for (const [key, value] of Object.entries(entries)) md.set(key, value);
  return md;
}

/** Vide toutes les tables (sauf l'historique des migrations Prisma). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
