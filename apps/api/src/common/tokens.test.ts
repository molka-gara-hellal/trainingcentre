import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { createJwtService, generateOpaqueToken, hashToken } from "./tokens";

const SECRET = "un-secret-de-test-d-au-moins-32-caracteres!";
const jwt = createJwtService({ secret: SECRET, accessTtlSeconds: 900 });
const USER = { userId: "11111111-1111-4111-8111-111111111111", role: "STUDENT" as const };

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("jetons opaques", () => {
  it("génère des jetons uniques de 256 bits et ne stocke que leur hash", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("JWT d'accès", () => {
  it("signe puis vérifie ; expire à la date prévue", async () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const { token, expiresAt } = await jwt.signAccessToken(USER, now);
    expect(expiresAt.toISOString()).toBe("2026-10-06T10:15:00.000Z");
    await expect(jwt.verifyAccessToken(token, new Date("2026-10-06T10:14:59Z"))).resolves.toEqual({ userId: USER.userId });
    await expect(jwt.verifyAccessToken(token, new Date("2026-10-06T10:15:01Z"))).rejects.toBeInstanceOf(AppError);
  });

  it("rejette un jeton signé avec un autre secret ou modifié", async () => {
    const other = createJwtService({ secret: "un-AUTRE-secret-de-test-de-32-caracteres!!", accessTtlSeconds: 900 });
    const foreign = (await other.signAccessToken(USER)).token;
    await expect(jwt.verifyAccessToken(foreign)).rejects.toBeInstanceOf(AppError);

    const { token } = await jwt.signAccessToken(USER);
    const [header, , signature] = token.split(".");
    const forgedPayload = b64({ sub: "99999999-9999-4999-8999-999999999999", role: "ADMIN" });
    await expect(jwt.verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).rejects.toBeInstanceOf(AppError);
  });

  it("rejette l'attaque 'alg: none' et un autre algorithme que HS256", async () => {
    const payload = b64({ sub: USER.userId, role: "ADMIN", iss: "center-api", aud: "center-web", exp: 9_999_999_999 });
    await expect(jwt.verifyAccessToken(`${b64({ alg: "none", typ: "JWT" })}.${payload}.`)).rejects.toBeInstanceOf(AppError);

    const header = b64({ alg: "HS512", typ: "JWT" });
    const signature = createHmac("sha512", SECRET).update(`${header}.${payload}`).digest("base64url");
    await expect(jwt.verifyAccessToken(`${header}.${payload}.${signature}`)).rejects.toBeInstanceOf(AppError);
  });

  it("rejette un jeton d'un autre émetteur/audience et du texte quelconque", async () => {
    const header = b64({ alg: "HS256", typ: "JWT" });
    const payload = b64({ sub: USER.userId, iss: "autre-api", aud: "center-web", exp: 9_999_999_999 });
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    await expect(jwt.verifyAccessToken(`${header}.${payload}.${signature}`)).rejects.toBeInstanceOf(AppError);
    await expect(jwt.verifyAccessToken("n'importe quoi")).rejects.toBeInstanceOf(AppError);
    await expect(jwt.verifyAccessToken("")).rejects.toBeInstanceOf(AppError);
  });
});
