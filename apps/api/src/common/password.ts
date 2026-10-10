import argon2 from "argon2";

/**
 * argon2id, paramètres de la recommandation OWASP (m = 19 MiB, t = 2, p = 1).
 * Le sel est généré aléatoirement par la bibliothèque et stocké dans le hash (format PHC) :
 * rien d'autre à conserver. Le mot de passe en clair n'est jamais journalisé ni stocké.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

// Hash factice, calculé une seule fois : sert à dépenser le même temps quand l'e-mail est inconnu.
let dummyHash: Promise<string> | undefined;

/**
 * Vérifie un mot de passe. Si `hash` est absent (compte inexistant ou non activé), on vérifie quand même
 * contre un hash factice : le temps de réponse ne révèle pas si le compte existe.
 */
export async function verifyPassword(hash: string | null | undefined, plain: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= hashPassword("mot-de-passe-factice-pour-egaliser-le-temps");
    await argon2.verify(await dummyHash, plain).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // hash corrompu : jamais d'exception qui fuiterait vers le client
  }
}
