import { Locale as ProtoLocale, CourseLevel as ProtoCourseLevel, Role as ProtoRole } from "@center/proto-gen/common/v1/common";
import { CourseStatus as ProtoCourseStatus, SessionStatus as ProtoSessionStatus } from "@center/proto-gen/course/v1/course";
import { InboxStatus as ProtoInboxStatus, RegistrationStatus as ProtoRegistrationStatus } from "@center/proto-gen/registration/v1/registration";
import { SettingStatus as ProtoSettingStatus } from "@center/proto-gen/site/v1/site";
import {
  AttendanceStatus as ProtoAttendanceStatus,
  CertificateType as ProtoCertificateType,
  EnrollmentStatus as ProtoEnrollmentStatus,
  ProjectStatus as ProtoProjectStatus,
} from "@center/proto-gen/learning/v1/learning";
import { NotificationType as ProtoNotificationType } from "@center/proto-gen/notification/v1/notification";
import {
  PaymentMethod as ProtoPaymentMethod,
  PaymentStatus as ProtoPaymentStatus,
} from "@center/proto-gen/payment/v1/payment";
import { UserStatus as ProtoUserStatus } from "@center/proto-gen/user/v1/user";
import type {
  AttendanceStatus,
  CertificateType,
  EnrollmentStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  ProjectStatus,
  CourseLevel,
  CourseStatus,
  InboxStatus,
  Locale,
  RegistrationStatus,
  Role,
  SessionStatus,
  SettingStatus,
  UserStatus,
} from "../generated/prisma/enums";

/**
 * Correspondance explicite entre les enums protobuf (COURSE_STATUS_PUBLISHED) et les enums Prisma (PUBLISHED).
 * La valeur *_UNSPECIFIED n'a pas d'équivalent en base : `toDb` renvoie alors undefined.
 */
function enumMapper<P extends string, D extends string>(pairs: ReadonlyArray<readonly [P, D]>) {
  const toDbMap = new Map<P, D>(pairs);
  const toProtoMap = new Map<D, P>(pairs.map(([p, d]) => [d, p]));
  return {
    toDb: (value: P | undefined): D | undefined => (value === undefined ? undefined : toDbMap.get(value)),
    toProto: (value: D): P => {
      const mapped = toProtoMap.get(value);
      if (mapped === undefined) throw new Error(`Valeur d'enum sans correspondance protobuf : ${value}`);
      return mapped;
    },
  };
}

export const localeMap = enumMapper<ProtoLocale, Locale>([
  [ProtoLocale.LOCALE_FR, "FR"],
  [ProtoLocale.LOCALE_AR, "AR"],
  [ProtoLocale.LOCALE_EN, "EN"],
]);

export const levelMap = enumMapper<ProtoCourseLevel, CourseLevel>([
  [ProtoCourseLevel.COURSE_LEVEL_BEGINNER, "BEGINNER"],
  [ProtoCourseLevel.COURSE_LEVEL_INTERMEDIATE, "INTERMEDIATE"],
  [ProtoCourseLevel.COURSE_LEVEL_ADVANCED, "ADVANCED"],
]);

export const roleMap = enumMapper<ProtoRole, Role>([
  [ProtoRole.ROLE_STUDENT, "STUDENT"],
  [ProtoRole.ROLE_TRAINER, "TRAINER"],
  [ProtoRole.ROLE_ADMIN, "ADMIN"],
]);

export const courseStatusMap = enumMapper<ProtoCourseStatus, CourseStatus>([
  [ProtoCourseStatus.COURSE_STATUS_DRAFT, "DRAFT"],
  [ProtoCourseStatus.COURSE_STATUS_PUBLISHED, "PUBLISHED"],
  [ProtoCourseStatus.COURSE_STATUS_DISABLED, "DISABLED"],
]);

export const sessionStatusMap = enumMapper<ProtoSessionStatus, SessionStatus>([
  [ProtoSessionStatus.SESSION_STATUS_PLANNED, "PLANNED"],
  [ProtoSessionStatus.SESSION_STATUS_OPEN, "OPEN"],
  [ProtoSessionStatus.SESSION_STATUS_FULL, "FULL"],
  [ProtoSessionStatus.SESSION_STATUS_ONGOING, "ONGOING"],
  [ProtoSessionStatus.SESSION_STATUS_COMPLETED, "COMPLETED"],
  [ProtoSessionStatus.SESSION_STATUS_CANCELLED, "CANCELLED"],
]);

export const registrationStatusMap = enumMapper<ProtoRegistrationStatus, RegistrationStatus>([
  [ProtoRegistrationStatus.REGISTRATION_STATUS_PENDING, "PENDING"],
  [ProtoRegistrationStatus.REGISTRATION_STATUS_ACCEPTED, "ACCEPTED"],
  [ProtoRegistrationStatus.REGISTRATION_STATUS_REJECTED, "REJECTED"],
  [ProtoRegistrationStatus.REGISTRATION_STATUS_WAITLIST, "WAITLIST"],
]);

export const inboxStatusMap = enumMapper<ProtoInboxStatus, InboxStatus>([
  [ProtoInboxStatus.INBOX_STATUS_NEW, "NEW"],
  [ProtoInboxStatus.INBOX_STATUS_IN_REVIEW, "IN_REVIEW"],
  [ProtoInboxStatus.INBOX_STATUS_CLOSED, "CLOSED"],
]);

export const settingStatusMap = enumMapper<ProtoSettingStatus, SettingStatus>([
  [ProtoSettingStatus.SETTING_STATUS_TODO, "TODO"],
  [ProtoSettingStatus.SETTING_STATUS_SET, "SET"],
]);

export const userStatusMap = enumMapper<ProtoUserStatus, UserStatus>([
  [ProtoUserStatus.USER_STATUS_PENDING_ACTIVATION, "PENDING_ACTIVATION"],
  [ProtoUserStatus.USER_STATUS_ACTIVE, "ACTIVE"],
  [ProtoUserStatus.USER_STATUS_SUSPENDED, "SUSPENDED"],
]);

export const enrollmentStatusMap = enumMapper<ProtoEnrollmentStatus, EnrollmentStatus>([
  [ProtoEnrollmentStatus.ENROLLMENT_STATUS_ACTIVE, "ACTIVE"],
  [ProtoEnrollmentStatus.ENROLLMENT_STATUS_COMPLETED, "COMPLETED"],
  [ProtoEnrollmentStatus.ENROLLMENT_STATUS_DROPPED, "DROPPED"],
]);

export const attendanceStatusMap = enumMapper<ProtoAttendanceStatus, AttendanceStatus>([
  [ProtoAttendanceStatus.ATTENDANCE_STATUS_PRESENT, "PRESENT"],
  [ProtoAttendanceStatus.ATTENDANCE_STATUS_ABSENT, "ABSENT"],
  [ProtoAttendanceStatus.ATTENDANCE_STATUS_LATE, "LATE"],
  [ProtoAttendanceStatus.ATTENDANCE_STATUS_EXCUSED, "EXCUSED"],
]);

export const projectStatusMap = enumMapper<ProtoProjectStatus, ProjectStatus>([
  [ProtoProjectStatus.PROJECT_STATUS_NOT_STARTED, "NOT_STARTED"],
  [ProtoProjectStatus.PROJECT_STATUS_IN_PROGRESS, "IN_PROGRESS"],
  [ProtoProjectStatus.PROJECT_STATUS_SUBMITTED, "SUBMITTED"],
  [ProtoProjectStatus.PROJECT_STATUS_REVIEWED, "REVIEWED"],
  [ProtoProjectStatus.PROJECT_STATUS_VALIDATED, "VALIDATED"],
]);

export const certificateTypeMap = enumMapper<ProtoCertificateType, CertificateType>([
  [ProtoCertificateType.CERTIFICATE_TYPE_ATTESTATION, "ATTESTATION"],
]);

export const paymentStatusMap = enumMapper<ProtoPaymentStatus, PaymentStatus>([
  [ProtoPaymentStatus.PAYMENT_STATUS_UNPAID, "UNPAID"],
  [ProtoPaymentStatus.PAYMENT_STATUS_PARTIAL, "PARTIAL"],
  [ProtoPaymentStatus.PAYMENT_STATUS_PAID, "PAID"],
  [ProtoPaymentStatus.PAYMENT_STATUS_REFUNDED, "REFUNDED"],
]);

export const paymentMethodMap = enumMapper<ProtoPaymentMethod, PaymentMethod>([
  [ProtoPaymentMethod.PAYMENT_METHOD_CASH, "CASH"],
  [ProtoPaymentMethod.PAYMENT_METHOD_BANK_TRANSFER, "BANK_TRANSFER"],
  [ProtoPaymentMethod.PAYMENT_METHOD_OTHER, "OTHER"],
]);

export const notificationTypeMap = enumMapper<ProtoNotificationType, NotificationType>([
  [ProtoNotificationType.NOTIFICATION_TYPE_NEW_REGISTRATION, "NEW_REGISTRATION"],
  [ProtoNotificationType.NOTIFICATION_TYPE_REGISTRATION_DECISION, "REGISTRATION_DECISION"],
  [ProtoNotificationType.NOTIFICATION_TYPE_NEW_PFE_REQUEST, "NEW_PFE_REQUEST"],
  [ProtoNotificationType.NOTIFICATION_TYPE_NEW_CONTACT_MESSAGE, "NEW_CONTACT_MESSAGE"],
  [ProtoNotificationType.NOTIFICATION_TYPE_PAYMENT_UPDATE, "PAYMENT_UPDATE"],
  [ProtoNotificationType.NOTIFICATION_TYPE_PROJECT_REVIEWED, "PROJECT_REVIEWED"],
  [ProtoNotificationType.NOTIFICATION_TYPE_CERTIFICATE_ISSUED, "CERTIFICATE_ISSUED"],
  [ProtoNotificationType.NOTIFICATION_TYPE_SYSTEM, "SYSTEM"],
  [ProtoNotificationType.NOTIFICATION_TYPE_PROJECT_SUBMITTED, "PROJECT_SUBMITTED"],
]);
