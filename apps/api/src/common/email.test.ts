import { describe, expect, it } from "vitest";
import { buildEmailLink } from "./email";

describe("liens d'e-mail", () => {
  it("construit un lien localisé avec le jeton encodé", () => {
    expect(buildEmailLink("https://exemple.tn/", "password_reset", "ar", "abc_-123")).toBe(
      "https://exemple.tn/ar/reinitialiser?token=abc_-123",
    );
    expect(buildEmailLink("http://localhost:3000", "account_activation", "fr", "t")).toBe(
      "http://localhost:3000/fr/activer-compte?token=t",
    );
  });
});
