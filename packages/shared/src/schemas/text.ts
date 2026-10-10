import { z } from "zod";

// Caractères de contrôle (sauf tabulation et retours à la ligne) : jamais utiles dans un formulaire.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const cleanText = (value: string): string => value.replace(CONTROL_CHARS, "").trim();

/**
 * Les messages d'erreur sont des CODES stables ("required", "too_long", ...) et non des phrases :
 * l'interface les traduit (FR/AR/EN) via next-intl.
 */
export const requiredText = (max: number) =>
  z
    .string("required")
    .transform(cleanText)
    .pipe(z.string().min(1, "required").max(max, "too_long"));

/** Texte facultatif : une chaîne vide est traitée comme "absent". */
export const optionalText = (max: number) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max, "too_long"))
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const emailField = z
  .string("required")
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "required")
      .max(254, "too_long")
      .refine((value) => z.email().safeParse(value).success, "invalid_email"),
  );

/** Téléphone volontairement permissif (+216 12 345 678, 12345678, 12.345.678...). */
export const phoneField = z
  .string("required")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "required")
      .regex(/^\+?[0-9 ().-]{6,20}$/, "invalid_phone"),
  );

export const slugField = z
  .string("required")
  .transform((value) => cleanText(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1, "required")
      .max(100, "too_long")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "invalid_value"),
  );

export const idField = z.string("required").pipe(z.uuid("invalid_id"));
export const optionalIdField = idField.optional();

export const consentField = z
  .boolean("consent_required")
  .refine((value) => value === true, "consent_required");

export const localeField = z.enum(["FR", "AR", "EN"], "invalid_value").default("FR");
export const levelField = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"], "required");
