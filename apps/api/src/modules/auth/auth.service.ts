import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { Logger } from "pino";
import { AuthServiceService } from "@center/proto-gen/auth/v1/auth";
import {
  activateAccountInputSchema,
  changePasswordInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  refreshTokenInputSchema,
  registerAccountInputSchema,
  resetPasswordInputSchema,
} from "@center/shared";
import { createFailureLimiter, createQuota } from "../../common/attempt-limiter";
import { buildEmailLink, type EmailKind, type EmailProvider } from "../../common/email";
import { localeMap } from "../../common/enums";
import { invalidCredentials, unauthenticated, validationError } from "../../common/errors";
import { hashPassword, verifyPassword } from "../../common/password";
import { Prisma, type PrismaClient } from "../../common/prisma";
import { generateOpaqueToken, hashToken, type JwtService } from "../../common/tokens";
import { parseInput } from "../../common/validate";
import type { User } from "../../generated/prisma/client";
import { toProtoUser } from "../user/user.mapper";
import type { RequestContext, UnaryFactory } from "../../grpc/handler";
import {
  issueTokens,
  revokeAllSessions,
  revokeFamily,
  rotateRefreshToken,
  type IssuedTokens,
  type SessionConfig,
} from "./session";

export const ACTIVATION_TTL_MS = 72 * 3_600_000;
const RESET_TTL_MS = 1 * 3_600_000;

export type AuthServiceDeps = {
  prisma: PrismaClient;
  unary: UnaryFactory;
  jwt: JwtService;
  session: SessionConfig;
  email: EmailProvider;
  siteUrl: string;
  now?: () => Date;
};


const toProtoTokens = (t: IssuedTokens) => ({
  accessToken: t.accessToken,
  refreshToken: t.refreshToken,
  accessExpiresAt: t.accessExpiresAt,
  refreshExpiresAt: t.refreshExpiresAt,
});

const invalidToken = () => validationError([{ field: "token", code: "invalid_token" }]);

function requireAuth(ctx: RequestContext) {
  if (!ctx.auth) throw unauthenticated(); // ne devrait pas arriver : la politique d'accès l'impose déjà
  return ctx.auth;
}

export type Tx = Pick<PrismaClient, "passwordResetToken" | "user" | "refreshToken">;

/** Crée un jeton à usage unique (remplace les jetons non utilisés précédents de l'utilisateur). */
export async function createOneTimeToken(tx: Tx, userId: string, ttlMs: number, now: Date): Promise<string> {
  await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  const { token, hash } = generateOpaqueToken();
  await tx.passwordResetToken.create({
    data: { userId, tokenHash: hash, expiresAt: new Date(now.getTime() + ttlMs) },
  });
  return token;
}

/**
 * Consomme un jeton à usage unique. Le jeton d'ACTIVATION ne sert que pour un compte en attente d'activation,
 * celui de RÉINITIALISATION que pour un compte actif : on ne peut pas détourner l'un pour l'autre.
 */
async function consumeOneTimeToken(tx: Tx, token: string, now: Date, expected: "ACTIVE" | "PENDING_ACTIVATION") {
  const row = await tx.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row || row.usedAt || row.expiresAt <= now || row.user.deletedAt || row.user.status !== expected) {
    throw invalidToken();
  }
  const claimed = await tx.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) throw invalidToken();
  return row.user;
}

export function buildAuthService(deps: AuthServiceDeps): UntypedServiceImplementation {
  const { prisma, unary, jwt, session, email, siteUrl, now = () => new Date() } = deps;

  // 5 échecs / 15 min par (e-mail + IP) à la connexion ; 5 échecs / 15 min par utilisateur au changement de mot de passe.
  const loginFailures = createFailureLimiter({ maxFailures: 5, windowSeconds: 900 });
  const changeFailures = createFailureLimiter({ maxFailures: 5, windowSeconds: 900 });
  // 3 e-mails / heure par adresse (activation ou réinitialisation) : évite d'inonder une boîte mail.
  const emailQuota = createQuota({ max: 3, windowSeconds: 3600 });

  /** Envoi non bloquant : un échec d'envoi ne doit ni retarder ni changer la réponse (anti-énumération). */
  function sendLink(user: Pick<User, "email" | "locale">, kind: EmailKind, token: string, log: Logger) {
    const locale = user.locale.toLowerCase() as "fr" | "ar" | "en";
    const link = buildEmailLink(siteUrl, kind, locale, token);
    void email.send({ to: user.email, kind, locale, link }).catch((err: unknown) => {
      log.error({ err, kind }, "échec d'envoi d'e-mail");
    });
  }

  return {
    register: unary(AuthServiceService.register, async (req, ctx) => {
      const input = parseInput(registerAccountInputSchema, {
        email: req.email,
        firstName: req.firstName,
        lastName: req.lastName,
        locale: localeMap.toDb(req.locale),
      });

      // Objet conteneur : la valeur est renseignée dans la transaction (callback), TypeScript ne suit pas ce flux.
      const outcome: { pending?: { user: User; token: string } } = {};
      try {
        await prisma.$transaction(async (tx) => {
          const existing = await tx.user.findUnique({ where: { email: input.email } });
          let user: User;
          if (!existing) {
            user = await tx.user.create({
              data: {
                email: input.email,
                firstName: input.firstName,
                lastName: input.lastName,
                locale: input.locale,
                role: "STUDENT",
                status: "PENDING_ACTIVATION",
                student: { create: {} },
              },
            });
          } else if (existing.status === "PENDING_ACTIVATION" && existing.deletedAt === null) {
            user = existing; // demande répétée : on renvoie un lien d'activation
          } else {
            return; // compte déjà actif/suspendu/supprimé : rien à faire, même réponse
          }
          if (!(await emailQuota.allow(input.email))) return;
          outcome.pending = { user, token: await createOneTimeToken(tx, user.id, ACTIVATION_TTL_MS, now()) };
        });
      } catch (err) {
        // Deux demandes simultanées pour la même adresse : la 2e perd la course sur l'unicité de l'e-mail.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
      if (outcome.pending) {
        sendLink(outcome.pending.user, "account_activation", outcome.pending.token, ctx.log);
      }
      return {};
    }),

    activateAccount: unary(AuthServiceService.activateAccount, async (req) => {
      const input = parseInput(activateAccountInputSchema, { token: req.token, password: req.password });
      const at = now();
      const passwordHash = await hashPassword(input.password);
      const { user, tokens } = await prisma.$transaction(async (tx) => {
        const pendingUser = await consumeOneTimeToken(tx, input.token, at, "PENDING_ACTIVATION");
        const activated = await tx.user.update({
          where: { id: pendingUser.id },
          data: { passwordHash, status: "ACTIVE", lastLoginAt: at },
        });
        const issued = await issueTokens({ db: tx, jwt, config: session }, activated, at);
        return { user: activated, tokens: issued };
      });
      return { user: toProtoUser(user), tokens: toProtoTokens(tokens) };
    }),

    login: unary(AuthServiceService.login, async (req, ctx) => {
      const input = parseInput(loginInputSchema, { email: req.email, password: req.password });
      const key = `${input.email}|${ctx.clientIp}`;
      await loginFailures.assertAllowed(key);

      const user = await prisma.user.findUnique({ where: { email: input.email } });
      // Toujours vérifier un hash (factice si le compte n'existe pas) : même durée, même réponse.
      const passwordOk = await verifyPassword(user?.passwordHash, input.password);
      if (!user || !passwordOk || user.deletedAt !== null || user.status !== "ACTIVE") {
        await loginFailures.recordFailure(key);
        throw invalidCredentials();
      }
      await loginFailures.reset(key);

      const at = now();
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: at } });
      const tokens = await issueTokens({ db: prisma, jwt, config: session }, user, at);
      ctx.log.info({ userId: user.id }, "login");
      return { user: toProtoUser(user), tokens: toProtoTokens(tokens) };
    }),

    logout: unary(AuthServiceService.logout, async (req) => {
      // Idempotent : un jeton inconnu, expiré ou mal formé répond quand même "succès".
      const parsed = refreshTokenInputSchema.safeParse({ refreshToken: req.refreshToken });
      if (parsed.success) {
        const row = await prisma.refreshToken.findUnique({
          where: { tokenHash: hashToken(parsed.data.refreshToken) },
          select: { familyId: true },
        });
        if (row) await revokeFamily(prisma, row.familyId, now());
      }
      return {};
    }),

    refreshToken: unary(AuthServiceService.refreshToken, async (req, ctx) => {
      const parsed = refreshTokenInputSchema.safeParse({ refreshToken: req.refreshToken });
      if (!parsed.success) throw unauthenticated();
      const { tokens } = await rotateRefreshToken(
        {
          prisma,
          jwt,
          config: session,
          onReuse: (userId) => ctx.log.warn({ userId }, "réutilisation d'un refresh token : session révoquée"),
        },
        parsed.data.refreshToken,
        now(),
      );
      return { tokens: toProtoTokens(tokens) };
    }),

    forgotPassword: unary(AuthServiceService.forgotPassword, async (req, ctx) => {
      const input = parseInput(forgotPasswordInputSchema, { email: req.email, locale: undefined });
      const user = await prisma.user.findUnique({ where: { email: input.email } });

      // Même réponse que l'adresse existe ou non. Compte en attente : on renvoie le lien d'ACTIVATION.
      const kind: EmailKind | null =
        !user || user.deletedAt !== null
          ? null
          : user.status === "ACTIVE"
            ? "password_reset"
            : user.status === "PENDING_ACTIVATION"
              ? "account_activation"
              : null; // compte suspendu : aucun lien
      if (user && kind && (await emailQuota.allow(input.email))) {
        const token = await createOneTimeToken(
          prisma,
          user.id,
          kind === "password_reset" ? RESET_TTL_MS : ACTIVATION_TTL_MS,
          now(),
        );
        sendLink(user, kind, token, ctx.log);
      }
      return {};
    }),

    resetPassword: unary(AuthServiceService.resetPassword, async (req, ctx) => {
      const input = parseInput(resetPasswordInputSchema, { token: req.token, newPassword: req.newPassword });
      const at = now();
      const passwordHash = await hashPassword(input.newPassword);
      await prisma.$transaction(async (tx) => {
        const user = await consumeOneTimeToken(tx, input.token, at, "ACTIVE");
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
        await revokeAllSessions(tx, user.id, at); // toutes les sessions ouvertes sont fermées
        ctx.log.info({ userId: user.id }, "password reset");
      });
      return {};
    }),

    changePassword: unary(AuthServiceService.changePassword, async (req, ctx) => {
      const { userId } = requireAuth(ctx);
      const input = parseInput(changePasswordInputSchema, {
        currentPassword: req.currentPassword,
        newPassword: req.newPassword,
      });
      const key = `pw|${userId}`;
      await changeFailures.assertAllowed(key);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw unauthenticated();
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        await changeFailures.recordFailure(key);
        // INVALID_ARGUMENT (et non UNAUTHENTICATED) : la session reste valide, seul le champ est faux.
        throw validationError([{ field: "currentPassword", code: "invalid_password" }]);
      }
      if (input.currentPassword === input.newPassword) {
        throw validationError([{ field: "newPassword", code: "password_unchanged" }]);
      }
      await changeFailures.reset(key);

      const at = now();
      const passwordHash = await hashPassword(input.newPassword);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { passwordHash } });
        // Toutes les sessions sont fermées (y compris celle-ci : reconnexion demandée à l'expiration du jeton d'accès).
        await revokeAllSessions(tx, userId, at);
      });
      ctx.log.info({ userId }, "password changed");
      return {};
    }),

    getMe: unary(AuthServiceService.getMe, async (_req, ctx) => {
      const { userId } = requireAuth(ctx);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw unauthenticated();
      return { user: toProtoUser(user) };
    }),
  };
}
