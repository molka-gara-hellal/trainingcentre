import type { Logger } from "pino";
import { buildEmailLink, type EmailProvider } from "../../common/email";

/** Envoi non bloquant du lien d'activation (même comportement que l'inscription publique). */
export function sendActivationLink(
  deps: { email: EmailProvider; siteUrl: string },
  user: { email: string; locale: "FR" | "AR" | "EN" },
  token: string,
  log: Logger,
): void {
  const locale = user.locale.toLowerCase() as "fr" | "ar" | "en";
  const link = buildEmailLink(deps.siteUrl, "account_activation", locale, token);
  void deps.email.send({ to: user.email, kind: "account_activation", locale, link }).catch((err: unknown) => {
    log.error({ err, kind: "account_activation" }, "échec d'envoi d'e-mail");
  });
}
