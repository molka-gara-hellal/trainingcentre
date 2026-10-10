import { status } from "@grpc/grpc-js";
import { describe, expect, it } from "vitest";
import { createFailureLimiter, createQuota } from "./attempt-limiter";

describe("limiteur d'échecs", () => {
  it("bloque après N échecs, par clé, et se réinitialise après un succès", async () => {
    const limiter = createFailureLimiter({ maxFailures: 3, windowSeconds: 60 });
    for (let i = 0; i < 3; i += 1) {
      await limiter.assertAllowed("a@b.co|1.1.1.1");
      await limiter.recordFailure("a@b.co|1.1.1.1");
    }
    await expect(limiter.assertAllowed("a@b.co|1.1.1.1")).rejects.toMatchObject({ code: status.RESOURCE_EXHAUSTED });
    await expect(limiter.assertAllowed("a@b.co|2.2.2.2")).resolves.toBeUndefined(); // autre IP : non bloquée

    await limiter.reset("a@b.co|1.1.1.1");
    await expect(limiter.assertAllowed("a@b.co|1.1.1.1")).resolves.toBeUndefined();
  });
});

describe("quota d'e-mails", () => {
  it("autorise N envois puis refuse sans lever d'erreur", async () => {
    const quota = createQuota({ max: 2, windowSeconds: 60 });
    expect(await quota.allow("a@b.co")).toBe(true);
    expect(await quota.allow("a@b.co")).toBe(true);
    expect(await quota.allow("a@b.co")).toBe(false);
    expect(await quota.allow("autre@b.co")).toBe(true);
  });
});
