import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

describe("CSP", () => {
  it("production : nonce + strict-dynamic, aucune évaluation ni script en ligne", () => {
    const csp = buildCsp("abc123", { upgradeInsecure: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("les styles en ligne ne sont autorisés que comme attributs, pas comme éléments", () => {
    const csp = buildCsp("n");
    expect(csp).toMatch(/style-src 'self' 'nonce-n'(;|$)/);
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });
  it("développement : eval et websockets autorisés, jamais en production", () => {
    expect(buildCsp("n", { isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp("n")).not.toContain("ws:");
  });
  it("nonces imprévisibles, 128 bits", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/); // jamais de guillemet ni de point-virgule
  });
});
