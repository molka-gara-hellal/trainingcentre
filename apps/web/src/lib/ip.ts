import { getEnv } from "./env";

/**
 * IP du visiteur à transmettre à l'API pour la limitation de débit.
 * On ne fait confiance à X-Forwarded-For que pour le nombre de proxys déclaré (TRUSTED_PROXY_HOPS) :
 * l'entrée ajoutée par NOTRE proxy est la N-ième en partant de la fin ; tout ce qui précède est falsifiable.
 */
export function clientIpFrom(headers: { get(name: string): string | null }): string | undefined {
  const hops = getEnv().TRUSTED_PROXY_HOPS;
  if (hops === 0) return undefined;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return undefined;
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  const candidate = parts[parts.length - hops];
  return candidate && candidate.length <= 64 ? candidate : undefined;
}
