import type { z } from "zod";
import { fieldErrorsFromZod } from "@center/shared";
import { validationError } from "./errors";

/** Valide une entrée avec un schéma Zod ; lève INVALID_ARGUMENT avec la liste {champ, code} sinon. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(fieldErrorsFromZod(result.error));
  return result.data;
}
