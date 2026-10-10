import { randomUUID } from "node:crypto";
import type { Role } from "@center/shared";
import { unauthenticated } from "../../common/errors";
import type { PrismaClient } from "../../common/prisma";
import { generateOpaqueToken, hashToken, type JwtService } from "../../common/tokens";

/**
 * Fenêtre de tolérance : si deux requêtes simultanées (ex. plusieurs composants serveur qui découvrent en même
 * temps que le jeton d'accès a expiré) présentent le MÊME refresh token, la 2e ne doit pas être prise pour un vol.
 * Au-delà de cette fenêtre, la réutilisation d'un jeton déjà consommé révoque toute la session.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export type SessionConfig = { accessTtlSeconds: number; refreshTtlSeconds: number };

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

type Tx = Pick<PrismaClient, "refreshToken">;

/** Émet un couple access (JWT) + refresh (opaque, stocké haché). `familyId` regroupe la chaîne de rotation. */
export async function issueTokens(
  deps: { db: Tx; jwt: JwtService; config: SessionConfig },
  user: { id: string; role: Role },
  now: Date,
  familyId: string = randomUUID(),
): Promise<IssuedTokens> {
  const access = await deps.jwt.signAccessToken({ userId: user.id, role: user.role }, now);
  const refresh = generateOpaqueToken();
  const refreshExpiresAt = new Date(now.getTime() + deps.config.refreshTtlSeconds * 1000);
  await deps.db.refreshToken.create({
    data: { userId: user.id, familyId, tokenHash: refresh.hash, expiresAt: refreshExpiresAt },
  });
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt: access.expiresAt,
    refreshExpiresAt,
  };
}

/** Révoque toute une session (chaîne de rotation). */
export function revokeFamily(db: Tx, familyId: string, now: Date) {
  return db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } });
}

/** Révoque toutes les sessions d'un utilisateur (changement/réinitialisation de mot de passe). */
export function revokeAllSessions(db: Tx, userId: string, now: Date) {
  return db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}

/**
 * Échange un refresh token contre un nouveau couple de jetons ; l'ancien est invalidé (usage unique).
 * Toute anomalie répond UNAUTHENTICATED sans détail.
 */
export async function rotateRefreshToken(
  deps: { prisma: PrismaClient; jwt: JwtService; config: SessionConfig; onReuse?: (userId: string) => void },
  refreshToken: string,
  now: Date,
): Promise<{ user: { id: string; role: Role }; tokens: IssuedTokens }> {
  const row = await deps.prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: { select: { id: true, role: true, status: true, deletedAt: true } } },
  });
  if (!row || row.expiresAt <= now) throw unauthenticated();

  if (row.revokedAt) {
    if (now.getTime() - row.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      // Jeton déjà consommé présenté hors fenêtre : vol probable → on coupe toute la session.
      await revokeFamily(deps.prisma, row.familyId, now);
      deps.onReuse?.(row.userId);
    }
    throw unauthenticated();
  }

  const { user } = row;
  if (user.deletedAt !== null || user.status !== "ACTIVE") {
    await revokeFamily(deps.prisma, row.familyId, now);
    throw unauthenticated();
  }

  return deps.prisma.$transaction(async (tx) => {
    // Réclamation atomique : une seule requête concurrente peut consommer ce jeton.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) throw unauthenticated();
    const tokens = await issueTokens({ db: tx, jwt: deps.jwt, config: deps.config }, user, now, row.familyId);
    return { user: { id: user.id, role: user.role }, tokens };
  });
}
