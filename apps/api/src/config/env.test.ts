import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5433/db",
  JWT_ACCESS_SECRET: "x".repeat(32),
};

afterEach(() => vi.restoreAllMocks());

function expectExit(env: NodeJS.ProcessEnv) {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => loadEnv(env)).toThrow("process.exit");
  expect(exit).toHaveBeenCalledWith(1);
}

describe("loadEnv", () => {
  it("applique les valeurs par défaut", () => {
    const env = loadEnv(base);
    expect(env.API_PORT).toBe(50051);
    expect(env.NODE_ENV).toBe("development");
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(14);
    expect(env.EMAIL_PROVIDER).toBe("console");
  });

  it("convertit le port en nombre", () => {
    expect(loadEnv({ ...base, API_PORT: "6000" }).API_PORT).toBe(6000);
  });

  it("refuse de démarrer sans secret JWT ou avec un secret trop court", () => {
    expectExit({ DATABASE_URL: base.DATABASE_URL });
    expectExit({ ...base, JWT_ACCESS_SECRET: "trop-court" });
  });

  it("n'envoie rien par défaut en production et interdit le fournisseur 'console'", () => {
    expect(loadEnv({ ...base, NODE_ENV: "production" }).EMAIL_PROVIDER).toBe("none");
    expectExit({ ...base, NODE_ENV: "production", EMAIL_PROVIDER: "console" });
  });

  it("SMTP : exige l'hôte et l'expéditeur, et un couple identifiant / mot de passe complet", () => {
    expectExit({ ...base, EMAIL_PROVIDER: "smtp" });
    expectExit({ ...base, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.exemple.tn", EMAIL_FROM: "a@exemple.tn", SMTP_USER: "u" });
    const ok = loadEnv({ ...base, NODE_ENV: "production", EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.exemple.tn", EMAIL_FROM: "a@exemple.tn" });
    expect(ok.SMTP_PORT).toBe(587);
    expect(ok.SMTP_SECURE).toBe("false");
  });

  it("traite les variables vides (Docker Compose) comme absentes", () => {
    const env = loadEnv({ ...base, NODE_ENV: "production", EMAIL_PROVIDER: "none", SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", EMAIL_FROM: "", EMAIL_BRAND_NAME: "" });
    expect(env.EMAIL_PROVIDER).toBe("none");
    expect(env.SMTP_HOST).toBeUndefined();
    expectExit({ ...base, JWT_ACCESS_SECRET: "" });
  });
});
