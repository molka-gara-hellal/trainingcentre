import { z } from "zod";
import { cleanText, localeField, optionalText, phoneField, requiredText } from "./text";

// https://hôte.domaine[:port][/chemin][?requête][#ancre] — pas d'identifiants (@), hôte avec au moins un point.
const HTTPS_URL = /^https:\/\/(?=[^/?#]*\.)[A-Za-z0-9.-]+(?::\d{1,5})?(?:[/?#]\S*)?$/;

/** Lien de dépôt : HTTPS uniquement (refuse javascript:, data:, http:), sans identifiants intégrés. */
export const repoUrlField = z
  .string("required")
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "required")
      .max(300, "too_long")
      .regex(HTTPS_URL, "invalid_url"),
  );

export const updateProfileInputSchema = z.object({
  firstName: requiredText(80),
  lastName: requiredText(80),
  locale: localeField,
  phone: phoneField.optional(),
});

export const updateMyProjectInputSchema = z.object({
  projectId: z.uuid("invalid_value"),
  description: optionalText(2000),
  repoUrl: repoUrlField.optional(),
  submit: z.boolean(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type UpdateMyProjectInput = z.infer<typeof updateMyProjectInputSchema>;

// --- Espace formateur (Phase 8) ---

/** Note sur 20, au plus 2 décimales ("15", "15.5", "15.25"). */
export const gradeField = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .regex(/^\d{1,2}(?:\.\d{1,2})?$/, "invalid_number")
      .refine((value) => Number(value) <= 20, "out_of_range"),
  );

export const reviewProjectInputSchema = z
  .object({
    projectId: z.uuid("invalid_value"),
    status: z.enum(["REVIEWED", "VALIDATED"], "invalid_value"),
    feedback: optionalText(2000),
    grade: gradeField.optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((value, ctx) => {
    // Un projet « à corriger » sans explication ne sert à rien à l'étudiant.
    if (value.status === "REVIEWED" && !value.feedback) {
      ctx.addIssue({ code: "custom", path: ["feedback"], message: "required" });
    }
  });

export const attendanceInputSchema = z.object({
  scheduleEventId: z.uuid("invalid_value"),
  records: z
    .array(
      z.object({
        enrollmentId: z.uuid("invalid_value"),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"], "invalid_value"),
        note: optionalText(300),
      }),
    )
    .min(1, "required")
    .max(200, "too_long"),
});

export type ReviewProjectInput = z.infer<typeof reviewProjectInputSchema>;
export type AttendanceInput = z.infer<typeof attendanceInputSchema>;
