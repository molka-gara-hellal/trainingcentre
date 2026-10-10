import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(50051),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, "DATABASE_URL doit commencer par postgresql://"),

    // --- Authentification (Phase 5) ---
    /** Secret de signature des JWT d'accès (HS256). Aléatoire, >= 32 caractères, jamais committé. */
    JWT_ACCESS_SECRET: z
      .string({ error: "JWT_ACCESS_SECRET manquante" })
      .min(32, "JWT_ACCESS_SECRET doit contenir au moins 32 caractères (voir README : génération)"),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    /** URL publique du site, utilisée pour construire les liens envoyés par e-mail. */
    SITE_URL: z.url().default("http://localhost:3000"),
    /**
     * "console" : écrit le lien dans les logs (DÉVELOPPEMENT uniquement : le lien donne accès au compte).
     * "none"    : n'envoie rien (défaut en production tant que le SMTP n'est pas configuré).
     * "smtp"    : envoi réel via un serveur SMTP (SMTP_HOST, EMAIL_FROM obligatoires).
     */
    EMAIL_PROVIDER: z.enum(["console", "none", "smtp"]).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** true = TLS implicite (port 465) ; false = STARTTLS (port 587, exigé, jamais en clair). */
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    /** Expéditeur, ex. « Nom du centre <contact@domaine.tn> » (à définir : aucun nom ni adresse n'est inventé). */
    EMAIL_FROM: z.string().min(3).optional(),
    /** Nom affiché dans les e-mails ; par défaut le nom de domaine du site. */
    EMAIL_BRAND_NAME: z.string().min(1).max(80).optional(),
  })
  .transform((env, ctx) => {
    const provider = env.EMAIL_PROVIDER ?? (env.NODE_ENV === "production" ? "none" : "console");
    if (env.NODE_ENV === "production" && provider === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PROVIDER"],
        message: "EMAIL_PROVIDER=console est interdit en production (les liens apparaîtraient dans les logs).",
      });
      return z.NEVER;
    }
    if (provider === "smtp") {
      for (const key of ["SMTP_HOST", "EMAIL_FROM"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} est obligatoire avec EMAIL_PROVIDER=smtp.` });
      }
      if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
        ctx.addIssue({ code: "custom", path: ["SMTP_USER"], message: "SMTP_USER et SMTP_PASSWORD vont ensemble." });
      }
      if (ctx.issues.length > 0) return z.NEVER;
    }
    return { ...env, EMAIL_PROVIDER: provider };
  });

export type Env = z.output<typeof schema>;

/** Valide l'environnement au démarrage : le process s'arrête si la config est invalide. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Docker Compose transmet les variables non renseignées comme chaînes VIDES : on les traite comme absentes.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    console.error("Variables d'environnement invalides :", z.prettifyError(parsed.error));
    process.exit(1);
  }
  return parsed.data;
}
