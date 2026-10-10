import { describe, expect, it } from "vitest";
import { fieldErrorsFromZod } from "./errors";
import {
  contactMessageInputSchema,
  pfeRequestInputSchema,
  registrationInputSchema,
} from "./forms";

const validRegistration = {
  firstName: "  Amal ",
  lastName: "Ben Salah",
  email: "  Amal.BenSalah@Example.COM ",
  phone: "+216 12 345 678",
  age: 21,
  educationLevel: "Licence 3",
  courseSlug: "python",
  level: "BEGINNER",
  hasOwnLaptop: true,
  consentGiven: true,
} as const;

function errorsOf(schema: { safeParse: (v: unknown) => { success: boolean; error?: never } | { success: false; error: import("zod").ZodError } }, data: unknown) {
  const result = schema.safeParse(data);
  if (result.success || !("error" in result) || !result.error) throw new Error("validation attendue en échec");
  return Object.fromEntries(fieldErrorsFromZod(result.error).map((e) => [e.field, e.code]));
}

describe("registrationInputSchema", () => {
  it("accepte une demande valide et normalise les valeurs", () => {
    const parsed = registrationInputSchema.parse(validRegistration);
    expect(parsed.firstName).toBe("Amal");
    expect(parsed.email).toBe("amal.bensalah@example.com");
    expect(parsed.locale).toBe("FR");
    expect(parsed.institution).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("traite les champs facultatifs vides comme absents", () => {
    const parsed = registrationInputSchema.parse({ ...validRegistration, institution: "  ", message: "" });
    expect(parsed.institution).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("refuse le consentement manquant ou faux avec le code consent_required", () => {
    expect(errorsOf(registrationInputSchema, { ...validRegistration, consentGiven: false })).toEqual({
      consentGiven: "consent_required",
    });
  });

  it("renvoie des codes stables par champ (une seule erreur par champ)", () => {
    const errors = errorsOf(registrationInputSchema, {
      ...validRegistration,
      firstName: "   ",
      email: "pas-un-email",
      phone: "abc",
      age: 3,
      courseSlug: "Python Avancé!",
      level: undefined,
    });
    expect(errors).toEqual({
      firstName: "required",
      email: "invalid_email",
      phone: "invalid_phone",
      age: "out_of_range",
      courseSlug: "invalid_value",
      level: "required",
    });
  });

  it("limite la longueur des textes", () => {
    expect(errorsOf(registrationInputSchema, { ...validRegistration, message: "x".repeat(2001) })).toEqual({
      message: "too_long",
    });
  });

  it("refuse un identifiant de session qui n'est pas un UUID", () => {
    expect(errorsOf(registrationInputSchema, { ...validRegistration, sessionId: "1; DROP TABLE" })).toEqual({
      sessionId: "invalid_id",
    });
  });

  it("supprime les caractères de contrôle", () => {
    const parsed = registrationInputSchema.parse({ ...validRegistration, firstName: "Am\u0000al\u0007" });
    expect(parsed.firstName).toBe("Amal");
  });
});

describe("pfeRequestInputSchema", () => {
  it("accepte une demande sans téléphone ni message", () => {
    const parsed = pfeRequestInputSchema.parse({
      name: "Sami",
      email: "sami@example.com",
      topic: "Application mobile",
      consentGiven: true,
    });
    expect(parsed.phone).toBeUndefined();
  });

  it("accepte un téléphone vide et refuse un téléphone invalide", () => {
    const base = { name: "Sami", email: "sami@example.com", topic: "Sujet", consentGiven: true };
    expect(pfeRequestInputSchema.parse({ ...base, phone: "" }).phone).toBeUndefined();
    expect(errorsOf(pfeRequestInputSchema, { ...base, phone: "xx" })).toEqual({ phone: "invalid_phone" });
  });
});

describe("contactMessageInputSchema", () => {
  it("exige un message et le consentement", () => {
    expect(
      errorsOf(contactMessageInputSchema, {
        name: "Sami",
        email: "sami@example.com",
        subject: "Question",
        message: "",
        consentGiven: false,
      }),
    ).toEqual({ message: "required", consentGiven: "consent_required" });
  });
});
