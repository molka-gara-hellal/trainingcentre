import type { Role } from "@center/shared";
import type { LimitClass } from "../common/rate-limit";
import { AdminServiceService } from "@center/proto-gen/admin/v1/admin";
import { AuthServiceService } from "@center/proto-gen/auth/v1/auth";
import { CourseServiceService } from "@center/proto-gen/course/v1/course";
import { NotificationServiceService } from "@center/proto-gen/notification/v1/notification";
import { PaymentServiceService } from "@center/proto-gen/payment/v1/payment";
import { RegistrationServiceService } from "@center/proto-gen/registration/v1/registration";
import { SiteServiceService } from "@center/proto-gen/site/v1/site";
import { StudentServiceService } from "@center/proto-gen/student/v1/student";
import { TrainerServiceService } from "@center/proto-gen/trainer/v1/trainer";
import { UserServiceService } from "@center/proto-gen/user/v1/user";

/**
 * Qui peut appeler quoi.
 * - "public"        : tout le monde (visiteur non connecté inclus)
 * - "authenticated" : tout utilisateur connecté
 * - [rôles]         : uniquement ces rôles
 */
export type Access = "public" | "authenticated" | readonly Role[];
export type Policy = { access: Access; limit: LimitClass };

const pub = (limit: LimitClass): Policy => ({ access: "public", limit });
const authed: Policy = { access: "authenticated", limit: "default" };
const roles = (...r: Role[]): Policy => ({ access: r, limit: "default" });
const admin = roles("ADMIN");
const student = roles("STUDENT");
const trainer = roles("TRAINER");

/**
 * `Record<keyof D, Policy>` : si une méthode est ajoutée dans un .proto, TypeScript refuse de compiler
 * tant qu'on n'a pas décidé de sa politique d'accès. Impossible d'oublier un endpoint.
 */
function define<D extends Record<string, { path: string }>>(
  service: D,
  table: Record<keyof D, Policy>,
): Array<[string, Policy]> {
  return (Object.keys(service) as Array<keyof D & string>).map((name) => [
    service[name]!.path,
    table[name],
  ]);
}

const entries: Array<[string, Policy]> = [
  ...define(CourseServiceService, {
    listCategories: pub("read"),
    listCourses: pub("read"),
    getCourse: pub("read"),
    listUpcomingSessions: pub("read"),
    listFaqs: pub("read"),
    listAdminCourses: admin,
    getAdminCourse: admin,
    createCourse: admin,
    updateCourse: admin,
    deleteCourse: admin,
    setCourseStatus: admin,
    listAdminSessions: admin,
    getAdminSession: admin,
    createSession: admin,
    updateSession: admin,
    setSessionStatus: admin,
    listSessionEvents: admin,
    addScheduleEvent: admin,
    deleteScheduleEvent: admin,
    listAdminFaqs: admin,
    upsertFaq: admin,
    deleteFaq: admin,
  }),
  ...define(RegistrationServiceService, {
    submitRegistration: pub("submit"),
    requestPfeSupport: pub("submit"),
    submitContactMessage: pub("submit"),
    listRegistrations: admin,
    getRegistration: admin,
    decideRegistration: admin,
    listPfeRequests: admin,
    setPfeRequestStatus: admin,
    listContactMessages: admin,
    setContactMessageStatus: admin,
  }),
  ...define(SiteServiceService, {
    getPublicSettings: pub("read"),
    updateSetting: admin,
  }),
  ...define(AuthServiceService, {
    register: pub("auth"),
    activateAccount: pub("auth"),
    login: pub("auth"),
    logout: pub("auth"),
    refreshToken: pub("auth"),
    forgotPassword: pub("auth"),
    resetPassword: pub("auth"),
    changePassword: authed,
    getMe: authed,
  }),
  ...define(UserServiceService, {
    getProfile: authed,
    updateProfile: authed,
  }),
  ...define(StudentServiceService, {
    getDashboard: student,
    listMyEnrollments: student,
    listMySchedule: student,
    listMyProjects: student,
    updateMyProject: student,
    listMyCertificates: student,
    listMyRegistrations: student,
    listMyPayments: student,
  }),
  ...define(TrainerServiceService, {
    listMySessions: trainer,
    listSessionStudents: trainer,
    listSessionSchedule: trainer,
    getEventAttendance: trainer,
    markAttendance: trainer,
    listSessionProjects: trainer,
    reviewProject: trainer,
  }),
  ...define(PaymentServiceService, {
    recordPayment: admin,
    updatePaymentStatus: admin,
    listPayments: admin,
    getEnrollmentPaymentHistory: admin,
  }),
  ...define(NotificationServiceService, {
    listMyNotifications: authed,
    countMyUnread: authed,
    markNotificationRead: authed,
    markAllNotificationsRead: authed,
  }),
  ...define(AdminServiceService, {
    getStats: admin,
    listStudents: admin,
    setStudentStatus: admin,
    listTrainers: admin,
    createTrainer: admin,
    updateTrainer: admin,
    listEnrollments: admin,
    updateEnrollment: admin,
    createProject: admin,
    issueCertificate: admin,
  }),
];

export const POLICIES: ReadonlyMap<string, Policy> = new Map(entries);

export function policyFor(path: string): Policy {
  const policy = POLICIES.get(path);
  if (!policy) throw new Error(`Aucune politique d'accès définie pour ${path}`);
  return policy;
}
