import { describe, expect, it } from "vitest";
import {
  changePasswordInputSchema,
  loginInputSchema,
  newPasswordField,
  opaqueTokenField,
  registerAccountInputSchema,
} from "./auth";

describe("mots de passe", () => {
  it("exige 10 caractères minimum, sans règle de complexité", () => {
    expect(newPasswordField.safeParse("123456789").success).toBe(false);
    expect(newPasswordField.safeParse("aaaaaaaaaa").success).toBe(true);
    expect(newPasswordField.safeParse("une phrase de passe avec des espaces").success).toBe(true);
  });

  it("borne la longueur maximale (évite d'envoyer 10 Mo au hash)", () => {
    expect(newPasswordField.safeParse("a".repeat(128)).success).toBe(true);
    const tooLong = newPasswordField.safeParse("a".repeat(129));
    expect(tooLong.success).toBe(false);
  });

  it("ne rejoue pas la politique à la connexion (ancien mot de passe court accepté)", () => {
    expect(loginInputSchema.safeParse({ email: "a@b.co", password: "court" }).success).toBe(true);
    expect(loginInputSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("n'altère pas le mot de passe (espaces conservés)", () => {
    const parsed = changePasswordInputSchema.parse({
      currentPassword: " ancien ",
      newPassword: "  nouveau mot de passe  ",
    });
    expect(parsed.currentPassword).toBe(" ancien ");
    expect(parsed.newPassword).toBe("  nouveau mot de passe  ");
  });
});

describe("jetons et comptes", () => {
  it("n'accepte que des jetons base64url de longueur plausible", () => {
    expect(opaqueTokenField.safeParse("abc").success).toBe(false);
    expect(opaqueTokenField.safeParse("a".repeat(43)).success).toBe(true);
    expect(opaqueTokenField.safeParse(`${"a".repeat(30)}'; DROP TABLE`).success).toBe(false);
  });

  it("normalise l'e-mail de la demande de compte et applique la langue par défaut", () => {
    const parsed = registerAccountInputSchema.parse({
      email: "  Molka@Example.COM ",
      firstName: " Molka ",
      lastName: "Gara",
    });
    expect(parsed).toEqual({ email: "molka@example.com", firstName: "Molka", lastName: "Gara", locale: "FR" });
  });
});
