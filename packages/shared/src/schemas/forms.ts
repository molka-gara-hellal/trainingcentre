import { z } from "zod";
import {
  consentField,
  emailField,
  localeField,
  levelField,
  optionalIdField,
  optionalText,
  phoneField,
  requiredText,
  slugField,
} from "./text";

/**
 * Demande d'inscription à une formation (formulaire public).
 * Bornes d'âge : simple contrôle de cohérence, PAS une règle d'admission.
 * TODO (juridique) : politique de consentement parental pour les mineurs.
 */
export const registrationInputSchema = z.object({
  firstName: requiredText(80),
  lastName: requiredText(80),
  email: emailField,
  phone: phoneField,
  age: z
    .number("required")
    .int("invalid_number")
    .min(10, "out_of_range")
    .max(100, "out_of_range"),
  educationLevel: requiredText(100),
  institution: optionalText(150),
  courseSlug: slugField,
  sessionId: optionalIdField,
  level: levelField,
  hasOwnLaptop: z.boolean("required"),
  message: optionalText(2000),
  consentGiven: consentField,
  locale: localeField,
});
export type RegistrationInput = z.infer<typeof registrationInputSchema>;

export const pfeRequestInputSchema = z.object({
  name: requiredText(120),
  email: emailField,
  phone: phoneField.optional().or(z.literal("").transform(() => undefined)),
  topic: requiredText(200),
  message: optionalText(2000),
  consentGiven: consentField,
});
export type PfeRequestInput = z.infer<typeof pfeRequestInputSchema>;

export const contactMessageInputSchema = z.object({
  name: requiredText(120),
  email: emailField,
  subject: requiredText(200),
  message: requiredText(3000),
  consentGiven: consentField,
});
export type ContactMessageInput = z.infer<typeof contactMessageInputSchema>;
