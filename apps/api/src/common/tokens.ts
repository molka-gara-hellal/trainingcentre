import { createHash, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@center/shared";
import { unauthenticated } from "./errors";

/** Jeton opaque (refresh, activation, réinitialisation) : 256 bits d'aléa, encodé en base64url. */
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/**
 * Seul le hash SHA-256 est stocké en base : une fuite de la base ne donne aucun jeton utilisable.
 * SHA-256 (rapide) suffit ici car le jeton est aléatoire à 256 bits, contrairement à un mot de passe.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AccessTokenClaims = { userId: string; role: Role };

export type JwtService = {
  signAccessToken(claims: AccessTokenClaims, now?: Date): Promise<{ token: string; expiresAt: Date }>;
  /** Lève UNAUTHENTICATED si le jeton est invalide, expiré, mal signé ou d'un autre émetteur. */
  verifyAccessToken(token: string, now?: Date): Promise<{ userId: string }>;
};

const ISSUER = "center-api";
const AUDIENCE = "center-web";

/**
 * JWT d'accès HS256, courts (15 min par défaut). L'algorithme est imposé à la vérification
 * (jamais celui de l'en-tête du jeton) pour écarter les attaques "alg: none" / confusion d'algorithme.
 * Pour que des services séparés vérifient les jetons sans connaître le secret : passer à une clé asymétrique.
 */
export function createJwtService(options: { secret: string; accessTtlSeconds: number }): JwtService {
  const key = new TextEncoder().encode(options.secret);
  return {
    async signAccessToken({ userId, role }, now = new Date()) {
      const expiresAt = new Date(now.getTime() + options.accessTtlSeconds * 1000);
      const token = await new SignJWT({ role })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setJti(randomUUID())
        .setIssuedAt(Math.floor(now.getTime() / 1000))
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(key);
      return { token, expiresAt };
    },
    async verifyAccessToken(token, now = new Date()) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ["HS256"],
          issuer: ISSUER,
          audience: AUDIENCE,
          currentDate: now,
        });
        if (typeof payload.sub !== "string" || payload.sub === "") throw new Error("sub manquant");
        return { userId: payload.sub };
      } catch {
        // Signature fausse, jeton expiré, mauvais émetteur... : toujours la même réponse, sans détail.
        throw unauthenticated();
      }
    },
  };
}
