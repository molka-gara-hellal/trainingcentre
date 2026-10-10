import { status } from "@grpc/grpc-js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  notFound,
  rateLimited,
  REQUEST_ID_METADATA_KEY,
  RETRY_AFTER_METADATA_KEY,
  toServiceError,
  VALIDATION_ERRORS_METADATA_KEY,
} from "./errors";
import { Prisma } from "./prisma";

const REQUEST_ID = "req-12345678";

describe("toServiceError", () => {
  it("conserve le code et le message d'une AppError, et renvoie l'identifiant de requête", () => {
    const { error, internal } = toServiceError(notFound("course_not_found"), REQUEST_ID);
    expect(error.code).toBe(status.NOT_FOUND);
    expect(error.details).toBe("course_not_found");
    expect(error.metadata?.get(REQUEST_ID_METADATA_KEY)).toEqual([REQUEST_ID]);
    expect(internal).toBe(false);
  });

  it("transforme une erreur Zod en INVALID_ARGUMENT avec la liste {champ, code}", () => {
    const result = z.object({ email: z.string("required") }).safeParse({});
    expect(result.success).toBe(false);
    const { error } = toServiceError((result as { error: z.ZodError }).error, REQUEST_ID);
    expect(error.code).toBe(status.INVALID_ARGUMENT);
    const raw = error.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0];
    expect(JSON.parse(String(raw))).toEqual([{ field: "email", code: "required" }]);
  });

  it("ne divulgue JAMAIS le détail d'une erreur inattendue", () => {
    const { error, internal } = toServiceError(new Error("password=hunter2 host=db.interne"), REQUEST_ID);
    expect(error.code).toBe(status.INTERNAL);
    expect(error.details).toBe("internal_error");
    expect(JSON.stringify(error)).not.toContain("hunter2");
    expect(internal).toBe(true);
  });

  it("traduit les erreurs Prisma connues (doublon, introuvable, référence manquante)", () => {
    const make = (code: string) =>
      new Prisma.PrismaClientKnownRequestError("détail technique", { code, clientVersion: "test" });
    expect(toServiceError(make("P2002"), REQUEST_ID).error.code).toBe(status.ALREADY_EXISTS);
    expect(toServiceError(make("P2025"), REQUEST_ID).error.code).toBe(status.NOT_FOUND);
    expect(toServiceError(make("P2003"), REQUEST_ID).error.code).toBe(status.FAILED_PRECONDITION);
    expect(toServiceError(make("P9999"), REQUEST_ID).error.code).toBe(status.INTERNAL);
  });

  it("indique le délai d'attente d'une limitation de débit", () => {
    const { error } = toServiceError(rateLimited(42), REQUEST_ID);
    expect(error.code).toBe(status.RESOURCE_EXHAUSTED);
    expect(error.metadata?.get(RETRY_AFTER_METADATA_KEY)).toEqual(["42"]);
  });

  it("reste une AppError reconnaissable", () => {
    expect(notFound()).toBeInstanceOf(AppError);
  });
});
