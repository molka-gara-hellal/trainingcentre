import { status } from "@grpc/grpc-js";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { createRateLimiter } from "./rate-limit";

const tiny = { points: 2, durationSeconds: 60 };
const config = { read: tiny, submit: tiny, auth: tiny, default: tiny };

describe("createRateLimiter", () => {
  it("laisse passer jusqu'à la limite puis refuse avec RESOURCE_EXHAUSTED", async () => {
    const limiter = createRateLimiter(config);
    await limiter.consume("submit", "1.2.3.4|m");
    await limiter.consume("submit", "1.2.3.4|m");
    const failure = await limiter.consume("submit", "1.2.3.4|m").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).code).toBe(status.RESOURCE_EXHAUSTED);
    expect((failure as AppError).retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("compte séparément chaque clé (IP + méthode) et chaque classe de limite", async () => {
    const limiter = createRateLimiter(config);
    await limiter.consume("submit", "A");
    await limiter.consume("submit", "A");
    await expect(limiter.consume("submit", "B")).resolves.toBeUndefined();
    await expect(limiter.consume("read", "A")).resolves.toBeUndefined();
  });
});
