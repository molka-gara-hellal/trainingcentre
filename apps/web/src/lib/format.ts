import { CourseLevel } from "@center/proto-gen/common/v1/common";
import { SessionStatus } from "@center/proto-gen/course/v1/course";

/** Chiffres latins dans toutes les langues (lisibles et cohérents avec les numéros de téléphone). */
const tag = (locale: string) => `${locale === "ar" ? "ar-TN" : locale}-u-nu-latn`;

export function formatDate(iso: string | undefined, locale: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/** Prix en dinars tunisiens (3 décimales). Renvoie undefined si le prix n'est pas défini. */
export function formatPrice(priceTnd: string | undefined, locale: string): string | undefined {
  if (!priceTnd) return undefined;
  const value = Number(priceTnd);
  if (!Number.isFinite(value)) return undefined;
  const amount = new Intl.NumberFormat(tag(locale), { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value);
  return `${amount} TND`;
}

export type LevelKey = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export const levelKey = (level: CourseLevel | undefined): LevelKey | undefined =>
  level === CourseLevel.COURSE_LEVEL_BEGINNER
    ? "BEGINNER"
    : level === CourseLevel.COURSE_LEVEL_INTERMEDIATE
      ? "INTERMEDIATE"
      : level === CourseLevel.COURSE_LEVEL_ADVANCED
        ? "ADVANCED"
        : undefined;

export type SessionStatusKey = "PLANNED" | "OPEN" | "FULL" | "ONGOING" | "COMPLETED" | "CANCELLED";
export const sessionStatusKey = (status: SessionStatus): SessionStatusKey | undefined =>
  (({
    [SessionStatus.SESSION_STATUS_PLANNED]: "PLANNED",
    [SessionStatus.SESSION_STATUS_OPEN]: "OPEN",
    [SessionStatus.SESSION_STATUS_FULL]: "FULL",
    [SessionStatus.SESSION_STATUS_ONGOING]: "ONGOING",
    [SessionStatus.SESSION_STATUS_COMPLETED]: "COMPLETED",
    [SessionStatus.SESSION_STATUS_CANCELLED]: "CANCELLED",
  }) as Partial<Record<SessionStatus, SessionStatusKey>>)[status];

/** Une session accepte-t-elle encore des demandes ? */
export const isSessionOpenForRequests = (status: SessionStatus): boolean =>
  status === SessionStatus.SESSION_STATUS_PLANNED || status === SessionStatus.SESSION_STATUS_OPEN;
