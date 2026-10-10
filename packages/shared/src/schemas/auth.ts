import { z } from "zod";
import { cleanText, emailField, localeField, requiredText } from "./text";

/**
 * Politique de mot de passe (recommandations NIST/OWASP) : la LONGUEUR compte, pas la complexité imposée.
 * Pas de règle "1 majuscule + 1 symbole" ; on accepte les phrases de passe, espaces compris.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const newPasswordField = z
  .string("required")
  .min(PASSWORD_MIN_LENGTH, "password_too_short")
  .max(PASSWORD_MAX_LENGTH, "password_too_long");

/** À la connexion on ne rejoue pas la politique : un ancien mot de passe doit pouvoir être saisi. */
const loginPasswordField = z.string("required").min(1, "required").max(PASSWORD_MAX_LENGTH, "password_too_long");

/** Jeton opaque (activation, réinitialisation, refresh) : base64url, longueur bornée. */
export const opaqueTokenField = z
  .string("required")
  .transform(cleanText)
  .pipe(z.string().min(20, "invalid_token").max(200, "invalid_token").regex(/^[A-Za-z0-9_-]+$/, "invalid_token"));

export const registerAccountInputSchema = z.object({
  email: emailField,
  firstName: requiredText(80),
  lastName: requiredText(80),
  locale: localeField,
});

export const activateAccountInputSchema = z.object({
  token: opaqueTokenField,
  password: newPasswordField,
});

export const loginInputSchema = z.object({
  email: emailField,
  password: loginPasswordField,
});

export const refreshTokenInputSchema = z.object({ refreshToken: opaqueTokenField });

export const forgotPasswordInputSchema = z.object({ email: emailField, locale: localeField });

export const resetPasswordInputSchema = z.object({
  token: opaqueTokenField,
  newPassword: newPasswordField,
});

export const changePasswordInputSchema = z.object({
  currentPassword: loginPasswordField,
  newPassword: newPasswordField,
});
