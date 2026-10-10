import type { z } from "zod";

export type FieldError = { field: string; code: string };

/** Transforme une erreur Zod en liste {champ, code}, avec UNE seule erreur par champ (la première). */
export function fieldErrorsFromZod(error: z.ZodError): FieldError[] {
  const seen = new Set<string>();
  const result: FieldError[] = [];
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".") || "_";
    if (seen.has(field)) continue;
    seen.add(field);
    result.push({ field, code: issue.message });
  }
  return result;
}
