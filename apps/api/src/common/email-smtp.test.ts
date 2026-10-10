import nodemailer from "nodemailer";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { smtpEmailProvider } from "./email-smtp";

const logger = pino({ level: "silent" });
const config = { host: "smtp.invalid", port: 587, secure: false, from: "Centre <contact@exemple.tn>", brand: "exemple.tn" };

describe("fournisseur SMTP", () => {
  it("envoie un texte brut localisé contenant le lien", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const provider = smtpEmailProvider(config, logger, transporter);
    const sent: Array<{ message: string }> = [];
    const original = transporter.sendMail.bind(transporter);
    transporter.sendMail = (async (mail: never) => {
      const info = await original(mail);
      sent.push(info as { message: string });
      return info;
    }) as typeof transporter.sendMail;
    await provider.send({ to: "a@b.tn", kind: "password_reset", locale: "fr", link: "https://exemple.tn/fr/reinitialiser?token=t" });
    const mail = JSON.parse(sent[0]!.message) as { from: { address: string }; to: Array<{ address: string }>; subject: string; text: string; html?: string };
    expect(mail.from.address).toBe("contact@exemple.tn");
    expect(mail.to[0]!.address).toBe("a@b.tn");
    expect(mail.subject).toContain("réinitialisation");
    expect(mail.text).toContain("https://exemple.tn/fr/reinitialiser?token=t");
    expect(mail.html).toBeUndefined();
  });

  it("propage l'erreur du serveur SMTP (l'appelant la journalise)", async () => {
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    transporter.sendMail = (async () => {
      throw new Error("refus SMTP");
    }) as typeof transporter.sendMail;
    await expect(
      smtpEmailProvider(config, logger, transporter).send({ to: "a@b.tn", kind: "account_activation", locale: "ar", link: "https://x" }),
    ).rejects.toThrow("refus SMTP");
  });
});
