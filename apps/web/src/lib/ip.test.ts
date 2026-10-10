import { afterEach, describe, expect, it, vi } from "vitest";

async function withHops(hops: string) {
  vi.resetModules();
  vi.stubEnv("TRUSTED_PROXY_HOPS", hops);
  return (await import("./ip")).clientIpFrom;
}
afterEach(() => vi.unstubAllEnvs());
const h = (value: string | null) => ({ get: (name: string) => (name === "x-forwarded-for" ? value : null) });

describe("clientIpFrom", () => {
  it("0 proxy de confiance : l'en-tête est ignoré (falsifiable)", async () => {
    expect((await withHops("0"))(h("1.2.3.4"))).toBeUndefined();
  });
  it("1 proxy : on prend la dernière entrée, pas celle fournie par le client", async () => {
    expect((await withHops("1"))(h("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
  });
  it("2 proxys : l'avant-dernière", async () => {
    expect((await withHops("2"))(h("6.6.6.6, 203.0.113.9, 10.0.0.2"))).toBe("203.0.113.9");
  });
  it("en-tête absent ou démesuré → undefined", async () => {
    const f = await withHops("1");
    expect(f(h(null))).toBeUndefined();
    expect(f(h("x".repeat(100)))).toBeUndefined();
  });
});
