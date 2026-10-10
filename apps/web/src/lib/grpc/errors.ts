import { status as GrpcStatus, type Metadata, type ServiceError } from "@grpc/grpc-js";

export type FieldError = { field: string; code: string };

const VALIDATION_ERRORS_KEY = "x-validation-errors";
const REQUEST_ID_KEY = "x-request-id";
const RETRY_AFTER_KEY = "retry-after";

/**
 * Erreur renvoyée par le backend, déjà "nettoyée" : `code` est un code stable ("invalid_credentials",
 * "course_not_found", "rate_limited"...) que l'interface traduit. Aucun détail technique n'y figure.
 */
export class ApiError extends Error {
  constructor(
    readonly grpcCode: number,
    readonly code: string,
    readonly fieldErrors: FieldError[] = [],
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
  ) {
    super(code);
    this.name = "ApiError";
  }

  get isUnauthenticated(): boolean {
    return this.grpcCode === GrpcStatus.UNAUTHENTICATED;
  }
  get isUnavailable(): boolean {
    return this.grpcCode === GrpcStatus.UNAVAILABLE || this.grpcCode === GrpcStatus.DEADLINE_EXCEEDED;
  }
}

const first = (md: Metadata | undefined, key: string): string | undefined => {
  const value = md?.get(key)[0];
  return typeof value === "string" ? value : undefined;
};

function parseFieldErrors(raw: string | undefined): FieldError[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) =>
      item && typeof item === "object" && typeof (item as FieldError).field === "string" && typeof (item as FieldError).code === "string"
        ? [{ field: (item as FieldError).field, code: (item as FieldError).code }]
        : [],
    );
  } catch {
    return [];
  }
}

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,60}$/;

export function toApiError(err: ServiceError): ApiError {
  const retry = Number(first(err.metadata, RETRY_AFTER_KEY));
  // `details` est un code stable côté API ; sinon on n'expose rien de plus que le type d'erreur.
  const code = CODE_PATTERN.test(err.details ?? "")
    ? err.details
    : err.code === GrpcStatus.UNAVAILABLE || err.code === GrpcStatus.DEADLINE_EXCEEDED
      ? "service_unavailable"
      : "internal_error";
  return new ApiError(
    err.code,
    code,
    parseFieldErrors(first(err.metadata, VALIDATION_ERRORS_KEY)),
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
    first(err.metadata, REQUEST_ID_KEY),
  );
}
