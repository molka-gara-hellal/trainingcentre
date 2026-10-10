import { Metadata, status, type ServiceError } from "@grpc/grpc-js";
import { ZodError } from "zod";
import { fieldErrorsFromZod, type FieldError } from "@center/shared";
import { Prisma } from "./prisma";

/**
 * Erreur "métier" renvoyée au client avec un code gRPC.
 * Le message est un CODE stable ("not_found", "validation_failed"...) : l'interface le traduit.
 * Ne jamais y mettre de détail technique ni de donnée personnelle.
 */
export class AppError extends Error {
  constructor(
    readonly code: status,
    message: string,
    readonly fieldErrors?: FieldError[],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const validationError = (fields: FieldError[]) =>
  new AppError(status.INVALID_ARGUMENT, "validation_failed", fields);
export const notFound = (message = "not_found") => new AppError(status.NOT_FOUND, message);
export const alreadyExists = (message = "already_exists") =>
  new AppError(status.ALREADY_EXISTS, message);
export const failedPrecondition = (message: string) =>
  new AppError(status.FAILED_PRECONDITION, message);
export const invalidCredentials = () => new AppError(status.UNAUTHENTICATED, "invalid_credentials");
export const unauthenticated = () => new AppError(status.UNAUTHENTICATED, "unauthenticated");
export const permissionDenied = () => new AppError(status.PERMISSION_DENIED, "permission_denied");
export const rateLimited = (retryAfterSeconds: number) =>
  new AppError(status.RESOURCE_EXHAUSTED, "rate_limited", undefined, retryAfterSeconds);

export const VALIDATION_ERRORS_METADATA_KEY = "x-validation-errors";
export const REQUEST_ID_METADATA_KEY = "x-request-id";
export const RETRY_AFTER_METADATA_KEY = "retry-after";

/** Transforme n'importe quelle erreur en erreur gRPC "sûre" (aucune fuite d'information interne). */
export function toServiceError(
  err: unknown,
  requestId: string,
): { error: Partial<ServiceError>; internal: boolean } {
  const metadata = new Metadata();
  metadata.set(REQUEST_ID_METADATA_KEY, requestId);

  const known = classify(err);
  if (known.fieldErrors?.length) {
    metadata.set(VALIDATION_ERRORS_METADATA_KEY, JSON.stringify(known.fieldErrors));
  }
  if (known.retryAfterSeconds !== undefined) {
    metadata.set(RETRY_AFTER_METADATA_KEY, String(known.retryAfterSeconds));
  }
  return {
    error: { code: known.code, details: known.message, metadata },
    internal: known.code === status.INTERNAL || known.code === status.UNAVAILABLE,
  };
}

function classify(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return validationError(fieldErrorsFromZod(err));
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return alreadyExists();
    if (err.code === "P2025") return notFound();
    if (err.code === "P2003") return failedPrecondition("related_record_missing");
  }
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new AppError(status.UNAVAILABLE, "database_unavailable");
  }
  return new AppError(status.INTERNAL, "internal_error");
}
