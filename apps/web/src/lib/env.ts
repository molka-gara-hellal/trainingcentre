import { z } from "zod";

/**
 * Configuration serveur du site (jamais exposée au navigateur, sauf NEXT_PUBLIC_*).
 * Lue à la demande (pas à l'import) pour que `next build` n'exige aucune variable.
 */
const schema = z.object({
  GRPC_API_URL: z.string().min(1).default("localhost:50051"),
  GRPC_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  /**
   * Nombre de proxys de confiance devant Next.js (0 = aucun).
   * Sert à lire la vraie IP du visiteur dans X-Forwarded-For (limitation de débit côté API).
   * Ne JAMAIS mettre 1 sans proxy : le visiteur pourrait alors falsifier son IP.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Cookies "Secure" : par défaut actif quand le site est en https. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

export type WebEnv = z.infer<typeof schema> & { cookieSecure: boolean };

let cached: WebEnv | undefined;

export function getEnv(): WebEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Variables d'environnement du site invalides : ${detail}`);
  }
  const data = parsed.data;
  cached = {
    ...data,
    cookieSecure: data.COOKIE_SECURE ? data.COOKIE_SECURE === "true" : data.NEXT_PUBLIC_SITE_URL.startsWith("https://"),
  };
  return cached;
}

export const siteUrl = (): string => getEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
