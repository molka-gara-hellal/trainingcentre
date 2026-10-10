import { z } from "zod";
import { SITE_DEFAULTS } from "../placeholders";
import { cleanText, optionalText, requiredText, slugField, emailField } from "./text";

// ---- Briques communes ---------------------------------------------------------------------------

const uuid = z.uuid("invalid_value");

/** Liste de textes courts (objectifs, prérequis, compétences...) : les lignes vides sont ignorées. */
const textList = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().transform(cleanText))
    .transform((items) => items.filter((item) => item !== ""))
    .pipe(z.array(z.string().max(maxLength, "too_long")).max(maxItems, "too_long"));

/** Montant en dinars : 7 chiffres entiers au plus, 3 décimales au plus ("120", "120.5", "120.500"). */
export const amountField = z
  .string("required")
  .transform(cleanText)
  .pipe(z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/, "invalid_number"));

const isoDate = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_value")
      .refine((value) => {
        const [y, m, d] = value.split("-").map(Number) as [number, number, number];
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
      }, "invalid_value"),
  );

const optionalInt = (min: number, max: number) => z.number("invalid_number").int("invalid_number").min(min, "out_of_range").max(max, "out_of_range").optional();

// ---- Formations ---------------------------------------------------------------------------------

const programModule = z.object({
  title: requiredText(150),
  topics: textList(30, 200),
});

export const courseTranslationSchema = z.object({
  locale: z.enum(["FR", "AR", "EN"], "invalid_value"),
  title: requiredText(150),
  summary: optionalText(400),
  description: optionalText(6000),
  objectives: textList(20, 300),
  prerequisites: textList(20, 300),
  skills: textList(30, 100),
  finalProject: optionalText(600),
  program: z.array(programModule).max(30, "too_long"),
});

export const courseInputSchema = z
  .object({
    slug: slugField,
    categoryId: uuid,
    level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"], "invalid_value").optional(),
    durationHours: optionalInt(1, 2000),
    sessionsCount: optionalInt(1, 500),
    // Prix inconnu = absent = « À définir ». Jamais de valeur par défaut inventée.
    priceTnd: amountField.optional(),
    translations: z.array(courseTranslationSchema).min(1, "required").max(3, "too_long"),
  })
  .superRefine((value, ctx) => {
    const locales = value.translations.map((t) => t.locale);
    if (new Set(locales).size !== locales.length) {
      ctx.addIssue({ code: "custom", path: ["translations"], message: "invalid_value" });
    }
    if (!locales.includes("FR")) {
      ctx.addIssue({ code: "custom", path: ["translations"], message: "french_required" });
    }
  });

// ---- Sessions et cours --------------------------------------------------------------------------

export const sessionInputSchema = z
  .object({
    courseId: uuid,
    trainerId: uuid.optional(),
    roomId: uuid.optional(),
    label: optionalText(100),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    scheduleNote: optionalText(300),
    capacity: optionalInt(1, 500),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "end_before_start" });
    }
  });

export const scheduleEventInputSchema = z
  .object({ sessionId: uuid, startsAt: z.date("required"), endsAt: z.date("required") })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "end_before_start" });
    if (value.endsAt.getTime() - value.startsAt.getTime() > 12 * 3_600_000) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "out_of_range" });
    }
  });

// ---- FAQ et paramètres --------------------------------------------------------------------------

export const faqInputSchema = z.object({
  id: uuid.optional(),
  locale: z.enum(["FR", "AR", "EN"], "invalid_value"),
  question: requiredText(300),
  answer: requiredText(3000),
  sortOrder: z.number().int("invalid_number").min(0, "out_of_range").max(1000, "out_of_range"),
  published: z.boolean(),
});

export const SETTING_KEYS = Object.keys(SITE_DEFAULTS) as [keyof typeof SITE_DEFAULTS, ...Array<keyof typeof SITE_DEFAULTS>];

export const settingInputSchema = z
  .object({
    key: z.enum(SETTING_KEYS, "invalid_value"),
    value: z.string().transform(cleanText).pipe(z.string().max(500, "too_long")),
    status: z.enum(["TODO", "SET"], "invalid_value"),
  })
  .superRefine((value, ctx) => {
    if (value.status === "SET" && (value.value === "" || value.value === "TODO")) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "required" });
    }
  });

// ---- Demandes d'inscription, paiements ----------------------------------------------------------

export const decideRegistrationInputSchema = z.object({
  id: uuid,
  decision: z.enum(["ACCEPT", "REJECT", "WAITLIST"], "invalid_value"),
  sessionId: uuid.optional(),
  adminNote: optionalText(1000),
});

export const recordPaymentInputSchema = z.object({
  enrollmentId: uuid,
  amount: amountField.refine((value) => Number(value) > 0, "out_of_range"),
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"], "invalid_value"),
  method: z.enum(["CASH", "BANK_TRANSFER", "OTHER"], "invalid_value").optional(),
  reference: optionalText(100),
  note: optionalText(500),
  paidAt: z.date().optional(),
});

export const updatePaymentInputSchema = z.object({
  id: uuid,
  status: z.enum(["UNPAID", "PARTIAL", "PAID", "REFUNDED"], "invalid_value"),
  method: z.enum(["CASH", "BANK_TRANSFER", "OTHER"], "invalid_value").optional(),
  note: optionalText(500),
});

// ---- Étudiants, formateurs, inscriptions --------------------------------------------------------

export const createTrainerInputSchema = z.object({
  email: emailField,
  firstName: requiredText(80),
  lastName: requiredText(80),
  bio: optionalText(2000),
  specialties: textList(10, 50),
});

export const updateTrainerInputSchema = createTrainerInputSchema.omit({ email: true }).extend({ id: uuid });

export const setStudentStatusInputSchema = z.object({
  userId: uuid,
  status: z.enum(["ACTIVE", "SUSPENDED"], "invalid_value"),
});

export const updateEnrollmentInputSchema = z
  .object({
    id: uuid,
    status: z.enum(["ACTIVE", "COMPLETED", "DROPPED"], "invalid_value").optional(),
    progressPct: optionalInt(0, 100),
  })
  .superRefine((value, ctx) => {
    if (value.status === undefined && value.progressPct === undefined) {
      ctx.addIssue({ code: "custom", path: ["progressPct"], message: "required" });
    }
  });

export const createProjectInputSchema = z.object({
  enrollmentId: uuid,
  title: requiredText(150),
  description: optionalText(2000),
});


export type CourseInput = z.infer<typeof courseInputSchema>;
export type SessionInput = z.infer<typeof sessionInputSchema>;
