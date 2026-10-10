import type { Logger } from "pino";

export type EmailKind = "account_activation" | "password_reset";

export type EmailMessage = {
  to: string;
  kind: EmailKind;
  locale: "fr" | "ar" | "en";
  /** Lien à usage unique (contient le jeton). */
  link: string;
};

/**
 * Abstraction d'envoi d'e-mails : le service d'authentification ne connaît pas le fournisseur.
 * Phase 12 : ajouter une implémentation SMTP (Nodemailer) sans toucher au reste du code.
 */
export type EmailProvider = {
  send(message: EmailMessage): Promise<void>;
};

/** Ne fait rien. Défaut en production tant qu'aucun SMTP n'est configuré. */
export const noopEmailProvider = (logger: Logger): EmailProvider => ({
  async send(message) {
    // Volontairement SANS le lien : il donne accès au compte.
    logger.warn({ kind: message.kind }, "e-mail non envoyé : aucun fournisseur configuré (EMAIL_PROVIDER=none)");
  },
});

/** DÉVELOPPEMENT uniquement : affiche le lien dans la console pour pouvoir tester sans SMTP. */
export const consoleEmailProvider = (logger: Logger): EmailProvider => ({
  async send(message) {
    logger.info({ to: message.to, kind: message.kind, link: message.link }, "[DEV] e-mail simulé");
  },
});

/** Pages du site (Phase 6) vers lesquelles pointent les liens. */
export const EMAIL_LINK_PATHS: Record<EmailKind, string> = {
  account_activation: "activer-compte",
  password_reset: "reinitialiser",
};

export function buildEmailLink(siteUrl: string, kind: EmailKind, locale: "fr" | "ar" | "en", token: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/${locale}/${EMAIL_LINK_PATHS[kind]}?token=${encodeURIComponent(token)}`;
}
