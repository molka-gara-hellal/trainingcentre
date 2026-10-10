import { RateLimiterMemory } from "rate-limiter-flexible";
import { rateLimited } from "./errors";

/**
 * Limiteur d'ÉCHECS (mauvais mot de passe) : bloque les devinettes sans pénaliser les connexions réussies.
 * Clé conseillée : "e-mail|IP" (un attaquant distant ne peut pas verrouiller le compte d'une autre personne
 * depuis une autre adresse, au prix de ne pas stopper une attaque répartie sur de nombreuses IP).
 */
export function createFailureLimiter(options: { maxFailures: number; windowSeconds: number }) {
  const limiter = new RateLimiterMemory({ points: options.maxFailures, duration: options.windowSeconds });
  return {
    /** Lève RESOURCE_EXHAUSTED si la clé a épuisé ses essais. */
    async assertAllowed(key: string): Promise<void> {
      const state = await limiter.get(key);
      if (state && state.remainingPoints <= 0) {
        throw rateLimited(Math.max(1, Math.ceil(state.msBeforeNext / 1000)));
      }
    },
    async recordFailure(key: string): Promise<void> {
      await limiter.consume(key).catch(() => undefined);
    },
    async reset(key: string): Promise<void> {
      await limiter.delete(key);
    },
  };
}

/** Quota d'envois d'e-mails (anti "mail bombing") : renvoie false au lieu de lever une erreur. */
export function createQuota(options: { max: number; windowSeconds: number }) {
  const limiter = new RateLimiterMemory({ points: options.max, duration: options.windowSeconds });
  return {
    async allow(key: string): Promise<boolean> {
      try {
        await limiter.consume(key);
        return true;
      } catch {
        return false;
      }
    },
  };
}
