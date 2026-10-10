import { CourseStatus, SessionStatus } from "@center/proto-gen/course/v1/course";
import { InboxStatus } from "@center/proto-gen/registration/v1/registration";
import { UserStatus } from "@center/proto-gen/user/v1/user";

export type Tone = "neutral" | "good" | "warn" | "bad";

export const courseStatusKey = (s: CourseStatus): "DRAFT" | "PUBLISHED" | "DISABLED" =>
  s === CourseStatus.COURSE_STATUS_PUBLISHED ? "PUBLISHED" : s === CourseStatus.COURSE_STATUS_DISABLED ? "DISABLED" : "DRAFT";
export const courseStatusTone = (k: string): Tone => (k === "PUBLISHED" ? "good" : k === "DISABLED" ? "bad" : "warn");

export const SESSION_STATUSES = ["PLANNED", "OPEN", "FULL", "ONGOING", "COMPLETED", "CANCELLED"] as const;
export const sessionTone = (s: SessionStatus): Tone =>
  s === SessionStatus.SESSION_STATUS_OPEN || s === SessionStatus.SESSION_STATUS_ONGOING ? "good" : s === SessionStatus.SESSION_STATUS_CANCELLED ? "bad" : s === SessionStatus.SESSION_STATUS_FULL ? "warn" : "neutral";

export const inboxKey = (s: InboxStatus): "NEW" | "IN_REVIEW" | "CLOSED" =>
  s === InboxStatus.INBOX_STATUS_CLOSED ? "CLOSED" : s === InboxStatus.INBOX_STATUS_IN_REVIEW ? "IN_REVIEW" : "NEW";
export const inboxTone = (k: string): Tone => (k === "NEW" ? "warn" : k === "CLOSED" ? "good" : "neutral");

export const userStatusKey = (s: UserStatus): "PENDING_ACTIVATION" | "ACTIVE" | "SUSPENDED" =>
  s === UserStatus.USER_STATUS_ACTIVE ? "ACTIVE" : s === UserStatus.USER_STATUS_SUSPENDED ? "SUSPENDED" : "PENDING_ACTIVATION";
export const userTone = (k: string): Tone => (k === "ACTIVE" ? "good" : k === "SUSPENDED" ? "bad" : "warn");

/** Valeur d'un `<input type="datetime-local">` à partir d'une date (heure de Tunis, UTC+1). */
export const toTunisInput = (d: Date): string => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 16);

export const queryParam = (raw: string | string[] | undefined): string => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? "").trim().slice(0, 100);
};
