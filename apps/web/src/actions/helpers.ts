import "server-only";
import type { ZodError } from "zod";
import { fieldErrorsFromZod } from "@center/shared";
import { ApiError } from "@/lib/grpc/errors";
import type { FormState } from "@/lib/form-state";

export const text = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

/** Les champs "mot de passe" ne sont jamais renvoyés au navigateur. */
const SECRET_FIELDS = new Set(["password", "newPassword", "confirmPassword", "currentPassword", "token"]);

export function valuesOf(data: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string" && !SECRET_FIELDS.has(key) && !key.startsWith("$ACTION")) values[key] = value.slice(0, 3000);
  }
  return values;
}

export function zodFailure(error: ZodError, data: FormData): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const { field, code } of fieldErrorsFromZod(error)) fieldErrors[field] = code;
  return { status: "error", fieldErrors, values: valuesOf(data) };
}

/** Transforme une erreur du backend en état de formulaire. Les erreurs inattendues sont relancées. */
export function apiFailure(err: unknown, data: FormData): FormState {
  if (!(err instanceof ApiError)) throw err;
  const fieldErrors: Record<string, string> = {};
  for (const { field, code } of err.fieldErrors) fieldErrors[field] = code;
  return {
    status: "error",
    code: Object.keys(fieldErrors).length > 0 ? undefined : err.code,
    retryAfterSeconds: err.retryAfterSeconds,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    values: valuesOf(data),
  };
}

/** Piège à robots : champ invisible que seul un script remplit. */
export const isBot = (data: FormData): boolean => text(data, "website").trim() !== "";

/** Redirection après connexion : uniquement un chemin interne (évite l'open redirect). */
export function safeNextPath(raw: string): string | undefined {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.length > 300) return undefined;
  return raw;
}
