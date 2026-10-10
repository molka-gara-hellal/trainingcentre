import type { Metadata } from "@grpc/grpc-js";
import type { Role } from "@center/shared";
import { unauthenticated } from "./errors";
import type { PrismaClient } from "./prisma";
import type { JwtService } from "./tokens";

/** Identité de l'appelant, déduite du token (jamais d'un champ de la requête). */
export type AuthContext = { userId: string; role: Role };

/**
 * Lit l'en-tête `authorization` et renvoie l'identité, ou null si anonyme.
 * Lève `unauthenticated()` si un token est présent mais invalide/expiré.
 * (Pour une méthode publique, le gestionnaire traite cette erreur comme "anonyme" : voir handler.ts.)
 */
export type Authenticator = (metadata: Metadata) => Promise<AuthContext | null>;

export const anonymousAuthenticator: Authenticator = async () => null;

/**
 * Vérifie le JWT puis recharge l'utilisateur en base : le RÔLE et le STATUT viennent de la base, pas du jeton.
 * Conséquence : un compte suspendu ou supprimé perd l'accès immédiatement, sans attendre l'expiration du jeton,
 * et un changement de rôle est pris en compte tout de suite. Coût : 1 requête indexée par appel authentifié.
 */
export function createJwtAuthenticator(deps: { jwt: JwtService; prisma: PrismaClient }): Authenticator {
  return async (metadata) => {
    const header = metadata.get("authorization")[0];
    if (header === undefined) return null;
    const match = typeof header === "string" ? /^Bearer ([A-Za-z0-9._-]+)$/.exec(header) : null;
    if (!match?.[1]) throw unauthenticated();

    const { userId } = await deps.jwt.verifyAccessToken(match[1]);
    const user = await deps.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null || user.status !== "ACTIVE") throw unauthenticated();
    return { userId: user.id, role: user.role };
  };
}
