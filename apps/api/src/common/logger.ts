import pino from "pino";
import type { Env } from "../config/env";

export function createLogger(env: Pick<Env, "NODE_ENV" | "LOG_LEVEL">) {
  return pino({
    level: env.LOG_LEVEL,
    // Ne jamais journaliser de secrets
    redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });
}
