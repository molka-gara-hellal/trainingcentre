import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("mots de passe (argon2id)", () => {
  it("produit un hash argon2id salé : jamais le mot de passe, jamais deux fois le même hash", async () => {
    const [a, b] = await Promise.all([hashPassword("correct horse battery"), hashPassword("correct horse battery")]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(a).not.toContain("correct horse battery");
    expect(a).not.toBe(b);
  });

  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "correct horse batterY")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("refuse sans erreur quand il n'y a pas de hash (compte inexistant ou non activé) ou un hash corrompu", async () => {
    expect(await verifyPassword(null, "n'importe quoi")).toBe(false);
    expect(await verifyPassword(undefined, "n'importe quoi")).toBe(false);
    expect(await verifyPassword("pas-un-hash", "n'importe quoi")).toBe(false);
  });
});
