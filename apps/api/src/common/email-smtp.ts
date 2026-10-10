import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "pino";
import type { EmailKind, EmailMessage, EmailProvider } from "./email";

type Locale = EmailMessage["locale"];

/** Textes des e-mails transactionnels. Texte brut : aucun HTML, donc aucune injection possible. */
const TEXTS: Record<Locale, Record<EmailKind, { subject: (brand: string) => string; body: (brand: string, link: string) => string }>> = {
  fr: {
    account_activation: {
      subject: (b) => `${b} : activez votre compte`,
      body: (b, link) =>
        `Bonjour,\n\nUn compte a été créé pour vous sur ${b}. Pour choisir votre mot de passe et l'activer, ouvrez ce lien (valable une durée limitée, à usage unique) :\n\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    },
    password_reset: {
      subject: (b) => `${b} : réinitialisation du mot de passe`,
      body: (b, link) =>
        `Bonjour,\n\nUne réinitialisation du mot de passe a été demandée pour votre compte ${b}. Ouvrez ce lien (à usage unique, durée limitée) :\n\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.`,
    },
  },
  en: {
    account_activation: {
      subject: (b) => `${b}: activate your account`,
      body: (b, link) =>
        `Hello,\n\nAn account has been created for you on ${b}. To choose your password and activate it, open this link (single use, limited validity):\n\n${link}\n\nIf you did not expect this, ignore this message.`,
    },
    password_reset: {
      subject: (b) => `${b}: password reset`,
      body: (b, link) =>
        `Hello,\n\nA password reset was requested for your ${b} account. Open this link (single use, limited validity):\n\n${link}\n\nIf you did not request it, ignore this message: your password is unchanged.`,
    },
  },
  ar: {
    account_activation: {
      subject: (b) => `${b}: تفعيل حسابك`,
      body: (b, link) =>
        `مرحبًا،\n\nتم إنشاء حساب لك على ${b}. لاختيار كلمة المرور وتفعيل الحساب، افتح هذا الرابط (للاستخدام مرة واحدة ولمدة محدودة):\n\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة.`,
    },
    password_reset: {
      subject: (b) => `${b}: إعادة تعيين كلمة المرور`,
      body: (b, link) =>
        `مرحبًا،\n\nتم طلب إعادة تعيين كلمة المرور لحسابك على ${b}. افتح هذا الرابط (للاستخدام مرة واحدة ولمدة محدودة):\n\n${link}\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.`,
    },
  },
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  password?: string | undefined;
  from: string;
  brand: string;
};

/** Fournisseur SMTP (Nodemailer). TLS imposé : STARTTLS obligatoire quand `secure` est faux. */
export function smtpEmailProvider(config: SmtpConfig, logger: Logger, transporter?: Transporter): EmailProvider {
  const transport =
    transporter ??
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      ...(config.user && config.password ? { auth: { user: config.user, pass: config.password } } : {}),
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  return {
    async send(message) {
      const text = TEXTS[message.locale][message.kind];
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: text.subject(config.brand),
        text: text.body(config.brand, message.link),
      });
      // Jamais le lien ni l'adresse complète dans les logs.
      logger.info({ kind: message.kind }, "e-mail envoyé");
    },
  };
}
