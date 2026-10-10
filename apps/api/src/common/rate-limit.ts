import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { rateLimited } from "./errors";

export type LimitClass = "read" | "submit" | "auth" | "default";
export type LimitConfig = Record<LimitClass, { points: number; durationSeconds: number }>;

/**
 * Limites par adresse IP et par méthode. Valeurs raisonnables pour un petit centre :
 * - submit : 10 envois de formulaire / 10 min (plusieurs étudiants peuvent partager la même IP au centre).
 * - auth : limite globale par IP ; plus large car une classe entière peut se connecter depuis la même IP.
 *   Le brute force sur un compte est limité séparément (échecs par e-mail + IP, voir attempt-limiter.ts).
 */
export const DEFAULT_LIMITS: LimitConfig = {
  read: { points: 120, durationSeconds: 60 },
  submit: { points: 10, durationSeconds: 600 },
  auth: { points: 30, durationSeconds: 300 },
  default: { points: 300, durationSeconds: 60 },
};

export type RateLimiter = {
  /** Consomme 1 point ; lève `rateLimited` (RESOURCE_EXHAUSTED) si la limite est dépassée. */
  consume(limitClass: LimitClass, key: string): Promise<void>;
};

/** Stockage en mémoire : suffisant pour une seule instance d'API. Passer à Redis si on scale horizontalement. */
export function createRateLimiter(config: LimitConfig = DEFAULT_LIMITS): RateLimiter {
  const limiters = Object.fromEntries(
    (Object.keys(config) as LimitClass[]).map((name) => [
      name,
      new RateLimiterMemory({
        points: config[name].points,
        duration: config[name].durationSeconds,
        keyPrefix: name,
      }),
    ]),
  ) as Record<LimitClass, RateLimiterMemory>;

  return {
    async consume(limitClass, key) {
      try {
        await limiters[limitClass].consume(key);
      } catch (res) {
        if (res instanceof RateLimiterRes) {
          throw rateLimited(Math.max(1, Math.ceil(res.msBeforeNext / 1000)));
        }
        throw res;
      }
    },
  };
}
