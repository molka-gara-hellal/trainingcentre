import { EnrollmentStatus, ProjectStatus } from "@center/proto-gen/learning/v1/learning";
import { NotificationType } from "@center/proto-gen/notification/v1/notification";
import { PaymentMethod, PaymentStatus } from "@center/proto-gen/payment/v1/payment";
import { RegistrationStatus } from "@center/proto-gen/registration/v1/registration";

const tag = (locale: string) => `${locale === "ar" ? "ar-TN" : locale}-u-nu-latn`;
const TZ = "Africa/Tunis";

export const formatDateTime = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(date);
export const formatDay = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(tag(locale), { dateStyle: "full", timeZone: TZ }).format(date);
export const formatTime = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(tag(locale), { timeStyle: "short", timeZone: TZ }).format(date);
export const formatShortDate = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: TZ }).format(date);
/** Clé de regroupement par jour (fuseau de Tunis). */
export const dayKey = (date: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);

export const formatTnd = (amount: string, locale: string): string => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return `${new Intl.NumberFormat(tag(locale), { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)} TND`;
};

export const enrollmentStatusKey = (s: EnrollmentStatus): "ACTIVE" | "COMPLETED" | "DROPPED" | undefined =>
  s === EnrollmentStatus.ENROLLMENT_STATUS_ACTIVE ? "ACTIVE"
  : s === EnrollmentStatus.ENROLLMENT_STATUS_COMPLETED ? "COMPLETED"
  : s === EnrollmentStatus.ENROLLMENT_STATUS_DROPPED ? "DROPPED" : undefined;

export type ProjectStatusKey = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "REVIEWED" | "VALIDATED";
export const projectStatusKey = (s: ProjectStatus): ProjectStatusKey | undefined =>
  (({
    [ProjectStatus.PROJECT_STATUS_NOT_STARTED]: "NOT_STARTED",
    [ProjectStatus.PROJECT_STATUS_IN_PROGRESS]: "IN_PROGRESS",
    [ProjectStatus.PROJECT_STATUS_SUBMITTED]: "SUBMITTED",
    [ProjectStatus.PROJECT_STATUS_REVIEWED]: "REVIEWED",
    [ProjectStatus.PROJECT_STATUS_VALIDATED]: "VALIDATED",
  }) as Partial<Record<ProjectStatus, ProjectStatusKey>>)[s];
/** Mêmes règles que l'API : seuls ces statuts sont modifiables par l'étudiant. */
export const isProjectEditable = (s: ProjectStatus): boolean =>
  s === ProjectStatus.PROJECT_STATUS_NOT_STARTED ||
  s === ProjectStatus.PROJECT_STATUS_IN_PROGRESS ||
  s === ProjectStatus.PROJECT_STATUS_REVIEWED;

export const paymentStatusKey = (s: PaymentStatus): "UNPAID" | "PARTIAL" | "PAID" | "REFUNDED" | undefined =>
  s === PaymentStatus.PAYMENT_STATUS_UNPAID ? "UNPAID"
  : s === PaymentStatus.PAYMENT_STATUS_PARTIAL ? "PARTIAL"
  : s === PaymentStatus.PAYMENT_STATUS_PAID ? "PAID"
  : s === PaymentStatus.PAYMENT_STATUS_REFUNDED ? "REFUNDED" : undefined;
export const paymentMethodKey = (m: PaymentMethod | undefined): "CASH" | "BANK_TRANSFER" | "OTHER" | undefined =>
  m === PaymentMethod.PAYMENT_METHOD_CASH ? "CASH"
  : m === PaymentMethod.PAYMENT_METHOD_BANK_TRANSFER ? "BANK_TRANSFER"
  : m === PaymentMethod.PAYMENT_METHOD_OTHER ? "OTHER" : undefined;

export const registrationStatusKey = (s: RegistrationStatus): "PENDING" | "ACCEPTED" | "REJECTED" | "WAITLIST" | undefined =>
  s === RegistrationStatus.REGISTRATION_STATUS_PENDING ? "PENDING"
  : s === RegistrationStatus.REGISTRATION_STATUS_ACCEPTED ? "ACCEPTED"
  : s === RegistrationStatus.REGISTRATION_STATUS_REJECTED ? "REJECTED"
  : s === RegistrationStatus.REGISTRATION_STATUS_WAITLIST ? "WAITLIST" : undefined;

export type NotificationKind = "REGISTRATION_DECISION" | "PAYMENT_UPDATE" | "PROJECT_REVIEWED" | "CERTIFICATE_ISSUED" | "PROJECT_SUBMITTED" | "SYSTEM";
/** Les types réservés à l'administration s'affichent comme message générique côté étudiant. */
export const notificationKind = (t: NotificationType): NotificationKind =>
  t === NotificationType.NOTIFICATION_TYPE_REGISTRATION_DECISION ? "REGISTRATION_DECISION"
  : t === NotificationType.NOTIFICATION_TYPE_PAYMENT_UPDATE ? "PAYMENT_UPDATE"
  : t === NotificationType.NOTIFICATION_TYPE_PROJECT_REVIEWED ? "PROJECT_REVIEWED"
  : t === NotificationType.NOTIFICATION_TYPE_CERTIFICATE_ISSUED ? "CERTIFICATE_ISSUED"
  : t === NotificationType.NOTIFICATION_TYPE_PROJECT_SUBMITTED ? "PROJECT_SUBMITTED" : "SYSTEM";
export const NOTIFICATION_LINKS: Record<NotificationKind, string | undefined> = {
  REGISTRATION_DECISION: "/espace/inscriptions",
  PAYMENT_UPDATE: "/espace/paiements",
  PROJECT_REVIEWED: "/espace/projets",
  CERTIFICATE_ISSUED: "/espace/attestations",
  PROJECT_SUBMITTED: "/espace",
  SYSTEM: undefined,
};

/** Lien précis d'une notification « projet rendu » : la page des projets de la session (identifiant relu défensivement). */
export function notificationHref(kind: NotificationKind, payloadJson: string): string | undefined {
  if (kind === "PROJECT_SUBMITTED") {
    try {
      const sessionId = (JSON.parse(payloadJson) as { sessionId?: unknown }).sessionId;
      if (typeof sessionId === "string" && /^[0-9a-f-]{36}$/i.test(sessionId)) return `/espace/sessions/${sessionId}/projets`;
    } catch {
      /* payload invalide : lien générique */
    }
  }
  return NOTIFICATION_LINKS[kind];
}
