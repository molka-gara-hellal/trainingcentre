import { status, type ServiceError } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CourseLevel, Locale } from "@center/proto-gen/common/v1/common";
import { CourseStatus, SessionStatus } from "@center/proto-gen/course/v1/course";
import { EnrollmentStatus } from "@center/proto-gen/learning/v1/learning";
import { PaymentMethod, PaymentStatus } from "@center/proto-gen/payment/v1/payment";
import { InboxStatus, RegistrationDecision } from "@center/proto-gen/registration/v1/registration";
import { SettingStatus } from "@center/proto-gen/site/v1/site";
import { UserStatus } from "@center/proto-gen/user/v1/user";
import { VALIDATION_ERRORS_METADATA_KEY } from "../../src/common/errors";
import { NOW, seedCatalog } from "../fixtures";
import { call, metadata, resetDatabase, startTestApp, type TestApp } from "../helpers";

let app: TestApp;
let seq = 0;
beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app.prisma);
});

async function makeUser(role: "STUDENT" | "TRAINER" | "ADMIN") {
  seq += 1;
  const user = await app.prisma.user.create({
    data: {
      email: `a${seq}@test.invalid`, role, status: "ACTIVE", firstName: "Prénom", lastName: `Nom${seq}`,
      ...(role === "STUDENT" && { student: { create: {} } }),
      ...(role === "TRAINER" && { trainer: { create: {} } }),
    },
    include: { student: true, trainer: true },
  });
  const { token } = await app.jwt.signAccessToken({ userId: user.id, role });
  return { user, studentId: user.student?.id, trainerId: user.trainer?.id, md: metadata({ authorization: `Bearer ${token}` }) };
}

const errorOf = async (p: Promise<unknown>) => (await p.then(() => null, (e: ServiceError) => e)) as ServiceError | null;
const fieldsOf = (e: ServiceError) =>
  Object.fromEntries(
    (JSON.parse(String(e.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0])) as Array<{ field: string; code: string }>).map((x) => [x.field, x.code]),
  );

const LOC = Locale.LOCALE_UNSPECIFIED;
const c = () => app.clients;

const courseBody = (categoryId: string, slug = "nouvelle-formation") => ({
  slug, categoryId, level: CourseLevel.COURSE_LEVEL_BEGINNER, durationHours: 20, sessionsCount: 10, priceTnd: undefined,
  translations: [{ locale: Locale.LOCALE_FR, title: "Nouvelle formation", summary: undefined, description: undefined, objectives: ["Obj"], prerequisites: [], skills: [], finalProject: undefined, program: [{ title: "Module 1", topics: ["a"] }] }],
});

describe("Admin : contrôle d'accès", () => {
  it("anonyme, étudiant et formateur sont refusés sur les RPC d'administration", async () => {
    const student = await makeUser("STUDENT");
    const trainer = await makeUser("TRAINER");
    expect((await errorOf(call((cb) => c().admin.getStats({ locale: LOC }, cb))))?.code).toBe(status.UNAUTHENTICATED);
    for (const u of [student, trainer]) {
      expect((await errorOf(call((cb) => c().admin.getStats({ locale: LOC }, u.md, cb))))?.code).toBe(status.PERMISSION_DENIED);
      expect((await errorOf(call((cb) => c().payment.listPayments({ locale: LOC }, u.md, cb))))?.code).toBe(status.PERMISSION_DENIED);
      expect((await errorOf(call((cb) => c().course.listAdminCourses({ page: undefined }, u.md, cb))))?.code).toBe(status.PERMISSION_DENIED);
      expect((await errorOf(call((cb) => c().registration.listRegistrations({ locale: LOC }, u.md, cb))))?.code).toBe(status.PERMISSION_DENIED);
    }
  });
});

describe("Admin : formations", () => {
  it("crée en brouillon, refuse un slug dupliqué et exige le français", async () => {
    const admin = await makeUser("ADMIN");
    const { web } = await seedCatalog(app.prisma);
    const created = await call<{ course?: { id: string; status: CourseStatus } }>((cb) => c().course.createCourse(courseBody(web.id), admin.md, cb));
    expect(created.course?.status).toBe(CourseStatus.COURSE_STATUS_DRAFT);
    expect((await errorOf(call((cb) => c().course.createCourse(courseBody(web.id), admin.md, cb))))?.message).toContain("slug_already_used");
    const noFr = { ...courseBody(web.id, "sans-francais"), translations: [{ ...courseBody(web.id).translations[0]!, locale: Locale.LOCALE_EN }] };
    const err = await errorOf(call((cb) => c().course.createCourse(noFr, admin.md, cb)));
    expect(err?.code).toBe(status.INVALID_ARGUMENT);
    expect(fieldsOf(err!)["translations"]).toBe("french_required");
    expect(await app.prisma.auditLog.count({ where: { action: "course.create", actorId: admin.user.id } })).toBe(1);
  });

  it("publie, met à jour (remplace les traductions), puis supprime en douceur", async () => {
    const admin = await makeUser("ADMIN");
    const { courseA } = await seedCatalog(app.prisma);
    const body = { ...courseBody(courseA.categoryId, "python-test"), id: courseA.id };
    const updated = await call<{ course?: { translations: unknown[] } }>((cb) => c().course.updateCourse(body, admin.md, cb));
    expect(updated.course?.translations).toHaveLength(1); // EN supprimée
    await call((cb) => c().course.setCourseStatus({ id: courseA.id, status: CourseStatus.COURSE_STATUS_DISABLED }, admin.md, cb));
    expect((await app.prisma.course.findUniqueOrThrow({ where: { id: courseA.id } })).status).toBe("DISABLED");
    await call((cb) => c().course.deleteCourse({ id: courseA.id }, admin.md, cb));
    expect((await app.prisma.course.findUniqueOrThrow({ where: { id: courseA.id } })).deletedAt).not.toBeNull();
    expect((await errorOf(call((cb) => c().course.getAdminCourse({ id: courseA.id }, admin.md, cb))))?.code).toBe(status.NOT_FOUND);
  });

  it("refuse de supprimer une formation ayant des inscrits actifs", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "OPEN" } });
    await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: session.id } });
    expect((await errorOf(call((cb) => c().course.deleteCourse({ id: courseA.id }, admin.md, cb))))?.message).toContain("course_has_enrollments");
  });
});

describe("Admin : sessions et planning", () => {
  const sessionBody = (courseId: string, extra: Record<string, unknown> = {}) => ({
    courseId, trainerId: undefined, roomId: undefined, label: "Groupe 1", startDate: "2026-11-01", endDate: "2026-12-01", scheduleNote: undefined, capacity: 10, ...extra,
  });

  it("crée une session, refuse des dates incohérentes et une capacité sous les inscrits", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const created = await call<{ session?: { id: string } }>((cb) => c().course.createSession({ session: sessionBody(courseA.id) }, admin.md, cb));
    const id = created.session!.id;
    const bad = await errorOf(call((cb) => c().course.createSession({ session: sessionBody(courseA.id, { endDate: "2026-10-01" }) }, admin.md, cb)));
    expect(fieldsOf(bad!)["endDate"]).toBe("end_before_start");
    await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: id } });
    const low = await errorOf(call((cb) => c().course.updateSession({ id, session: sessionBody(courseA.id, { capacity: 0 }) }, admin.md, cb)));
    expect(low).not.toBeNull();
    const one = await call<{ session?: { id: string; courseId: string } }>((cb) => c().course.getAdminSession({ id }, admin.md, cb));
    expect(one.session).toMatchObject({ id, courseId: courseA.id });
    expect((await errorOf(call((cb) => c().course.getAdminSession({ id: "0198f0f0-0000-7000-8000-000000000000" }, admin.md, cb))))?.code).toBe(status.NOT_FOUND);
    const upd = await call<{ session?: { capacity?: number } }>((cb) => c().course.updateSession({ id, session: sessionBody(courseA.id, { capacity: 5 }) }, admin.md, cb));
    expect(upd.session?.capacity).toBe(5);
    await call((cb) => c().course.setSessionStatus({ id, status: SessionStatus.SESSION_STATUS_OPEN }, admin.md, cb));
  });

  it("ajoute des cours sans chevauchement et protège ceux qui ont une présence", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "ONGOING" } });
    const at = (h: number) => new Date(`2026-11-02T${String(h).padStart(2, "0")}:00:00Z`);
    const ev = await call<{ event?: { id: string } }>((cb) => c().course.addScheduleEvent({ sessionId: session.id, startsAt: at(8), endsAt: at(10) }, admin.md, cb));
    expect((await errorOf(call((cb) => c().course.addScheduleEvent({ sessionId: session.id, startsAt: at(9), endsAt: at(11) }, admin.md, cb))))?.message).toContain("event_overlap");
    await call((cb) => c().course.addScheduleEvent({ sessionId: session.id, startsAt: at(10), endsAt: at(12) }, admin.md, cb)); // adjacent : OK
    const list = await call<{ events: unknown[] }>((cb) => c().course.listSessionEvents({ sessionId: session.id, locale: LOC }, admin.md, cb));
    expect(list.events).toHaveLength(2);
    const enrollment = await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: session.id } });
    await app.prisma.attendance.create({ data: { enrollmentId: enrollment.id, scheduleEventId: ev.event!.id, status: "PRESENT" } });
    expect((await errorOf(call((cb) => c().course.deleteScheduleEvent({ id: ev.event!.id }, admin.md, cb))))?.message).toContain("event_has_attendance");
  });
});

describe("Admin : paramètres et FAQ", () => {
  it("met à jour un paramètre connu, refuse une clé inconnue et force « TODO »", async () => {
    const admin = await makeUser("ADMIN");
    const ok = await call<{ setting?: { value: string; status: SettingStatus } }>((cb) => c().site.updateSetting({ key: "CITY", value: "Monastir", status: SettingStatus.SETTING_STATUS_SET }, admin.md, cb));
    expect(ok.setting?.value).toBe("Monastir");
    expect((await errorOf(call((cb) => c().site.updateSetting({ key: "HACK", value: "x", status: SettingStatus.SETTING_STATUS_SET }, admin.md, cb))))?.code).toBe(status.INVALID_ARGUMENT);
    const todo = await call<{ setting?: { value: string } }>((cb) => c().site.updateSetting({ key: "PHONE", value: "0000", status: SettingStatus.SETTING_STATUS_TODO }, admin.md, cb));
    expect(todo.setting?.value).toBe("TODO");
  });

  it("crée, liste et supprime une FAQ", async () => {
    const admin = await makeUser("ADMIN");
    const f = await call<{ faq?: { id: string } }>((cb) => c().course.upsertFaq({ id: undefined, locale: Locale.LOCALE_FR, question: "Question ?", answer: "Réponse.", sortOrder: 1, published: true }, admin.md, cb));
    expect((await call<{ faqs: unknown[] }>((cb) => c().course.listAdminFaqs({}, admin.md, cb))).faqs).toHaveLength(1);
    await call((cb) => c().course.deleteFaq({ id: f.faq!.id }, admin.md, cb));
    expect(await app.prisma.faq.count()).toBe(0);
  });
});

describe("Admin : demandes d'inscription", () => {
  async function pendingRegistration(opts: { email?: string; capacity?: number | null } = {}) {
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "OPEN", capacity: opts.capacity === undefined ? 5 : opts.capacity } });
    const reg = await app.prisma.registration.create({
      data: {
        firstName: "Sami", lastName: "Test", email: opts.email ?? "candidat@test.invalid", phone: "00000000", age: 20, educationLevel: "Licence",
        courseId: courseA.id, sessionId: session.id, level: "BEGINNER", hasOwnLaptop: true, consentAt: NOW,
      },
    });
    return { reg, session, courseA };
  }
  const decide = (admin: { md: ReturnType<typeof metadata> }, id: string, decision: RegistrationDecision, extra: Record<string, unknown> = {}) =>
    call<{ registration?: { status: unknown } }>((cb) => c().registration.decideRegistration({ id, decision, sessionId: undefined, adminNote: undefined, locale: LOC, ...extra }, admin.md, cb));

  it("accepte : crée le compte, l'inscription, l'activation, la notification et l'audit", async () => {
    const admin = await makeUser("ADMIN");
    const { reg, session } = await pendingRegistration();
    await decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_ACCEPT);
    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: "candidat@test.invalid" }, include: { student: true } });
    expect(user.status).toBe("PENDING_ACTIVATION");
    expect(await app.prisma.enrollment.count({ where: { sessionId: session.id, studentId: user.student!.id } })).toBe(1);
    expect(await app.prisma.notification.count({ where: { userId: user.id, type: "REGISTRATION_DECISION" } })).toBe(1);
    expect(await app.prisma.auditLog.count({ where: { action: "registration.decide" } })).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(app.emails.some((e) => e.to === "candidat@test.invalid" && e.kind === "account_activation")).toBe(true);
    // Une demande déjà décidée ne se rejoue pas.
    expect((await errorOf(decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_REJECT)))?.message).toContain("registration_already_decided");
  });

  it("rejette et met en liste d'attente sans créer d'inscription", async () => {
    const admin = await makeUser("ADMIN");
    const { reg } = await pendingRegistration();
    const wl = await decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_WAITLIST);
    expect(wl.registration).toBeDefined();
    expect(await app.prisma.enrollment.count()).toBe(0);
    await decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_REJECT, { adminNote: "Dossier incomplet" });
    expect((await app.prisma.registration.findUniqueOrThrow({ where: { id: reg.id } })).status).toBe("REJECTED");
    expect(await app.prisma.user.count({ where: { email: "candidat@test.invalid" } })).toBe(0);
  });

  it("refuse l'acceptation quand la session est complète, et ferme la session à la dernière place", async () => {
    const admin = await makeUser("ADMIN");
    const { reg, session, courseA } = await pendingRegistration({ capacity: 1 });
    const second = await app.prisma.registration.create({
      data: { firstName: "B", lastName: "B", email: "b@test.invalid", phone: "1", age: 20, educationLevel: "x", courseId: courseA.id, sessionId: session.id, level: "BEGINNER", hasOwnLaptop: true, consentAt: NOW },
    });
    await decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_ACCEPT);
    expect((await app.prisma.courseSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("FULL");
    expect((await errorOf(decide(admin, second.id, RegistrationDecision.REGISTRATION_DECISION_ACCEPT)))?.message).toContain("session_full");
  });

  it("refuse si l'e-mail est celui d'un membre du personnel ou d'un compte suspendu", async () => {
    const admin = await makeUser("ADMIN");
    const staff = await makeUser("TRAINER");
    const { reg } = await pendingRegistration({ email: staff.user.email });
    expect((await errorOf(decide(admin, reg.id, RegistrationDecision.REGISTRATION_DECISION_ACCEPT)))?.message).toContain("email_belongs_to_staff");
    const suspended = await makeUser("STUDENT");
    await app.prisma.user.update({ where: { id: suspended.user.id }, data: { status: "SUSPENDED" } });
    const other = await app.prisma.registration.update({ where: { id: reg.id }, data: { email: suspended.user.email } });
    expect((await errorOf(decide(admin, other.id, RegistrationDecision.REGISTRATION_DECISION_ACCEPT)))?.message).toContain("account_unavailable");
  });

  it("liste avec filtres, et gère la boîte de réception (contact, PFE)", async () => {
    const admin = await makeUser("ADMIN");
    await pendingRegistration();
    const list = await call<{ registrations: Array<{ courseTitle: string; adminNote?: string }> }>((cb) => c().registration.listRegistrations({ query: "sami", locale: Locale.LOCALE_FR }, admin.md, cb));
    expect(list.registrations).toHaveLength(1);
    expect(list.registrations[0]!.courseTitle).toBe("Python (test)");
    const msg = await app.prisma.contactMessage.create({ data: { name: "X", email: "x@test.invalid", subject: "S", message: "M", consentAt: NOW } });
    const closed = await call<{ message?: { status: InboxStatus } }>((cb) => c().registration.setContactMessageStatus({ id: msg.id, status: InboxStatus.INBOX_STATUS_CLOSED }, admin.md, cb));
    expect(closed.message?.status).toBe(InboxStatus.INBOX_STATUS_CLOSED);
    const pfe = await app.prisma.pfeRequest.create({ data: { name: "X", email: "x@test.invalid", topic: "T", consentAt: NOW } });
    expect((await call<{ requests: unknown[] }>((cb) => c().registration.listPfeRequests({ page: undefined }, admin.md, cb))).requests).toHaveLength(1);
    await call((cb) => c().registration.setPfeRequestStatus({ id: pfe.id, status: InboxStatus.INBOX_STATUS_IN_REVIEW }, admin.md, cb));
  });
});

describe("Admin : paiements", () => {
  it("enregistre un paiement, notifie l'étudiant, liste avec les noms et trace l'audit", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "OPEN" } });
    const en = await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: session.id } });
    const rec = await call<{ payment?: { id: string; amount: string } }>((cb) =>
      c().payment.recordPayment({ enrollmentId: en.id, amount: "100", status: PaymentStatus.PAYMENT_STATUS_PARTIAL, method: PaymentMethod.PAYMENT_METHOD_CASH, reference: undefined, note: undefined, paidAt: undefined }, admin.md, cb));
    expect(rec.payment?.amount).toBe("100.000");
    expect(await app.prisma.notification.count({ where: { userId: student.user.id, type: "PAYMENT_UPDATE" } })).toBe(1);
    const bad = await errorOf(call((cb) => c().payment.recordPayment({ enrollmentId: en.id, amount: "0", status: PaymentStatus.PAYMENT_STATUS_PAID, method: undefined, reference: undefined, note: undefined, paidAt: undefined }, admin.md, cb)));
    expect(fieldsOf(bad!)["amount"]).toBe("out_of_range");
    await call((cb) => c().payment.updatePaymentStatus({ id: rec.payment!.id, status: PaymentStatus.PAYMENT_STATUS_PAID, method: undefined, note: undefined }, admin.md, cb));
    const list = await call<{ payments: Array<{ firstName: string; courseTitle: string }> }>((cb) => c().payment.listPayments({ locale: Locale.LOCALE_FR }, admin.md, cb));
    expect(list.payments[0]).toMatchObject({ firstName: "Prénom", courseTitle: "Python (test)" });
    const hist = await call<{ payments: unknown[] }>((cb) => c().payment.getEnrollmentPaymentHistory({ enrollmentId: en.id }, admin.md, cb));
    expect(hist.payments).toHaveLength(1);
    expect(await app.prisma.auditLog.count({ where: { entity: "Payment" } })).toBe(2);
  });
});

describe("Admin : étudiants, formateurs, inscriptions, statistiques", () => {
  it("suspend un étudiant (sessions révoquées), refuse de cibler un non-étudiant", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    await app.prisma.refreshToken.create({ data: { userId: student.user.id, familyId: student.user.id, tokenHash: "h", expiresAt: new Date("2030-01-01") } });
    const res = await call<{ student?: { status: UserStatus } }>((cb) => c().admin.setStudentStatus({ userId: student.user.id, status: UserStatus.USER_STATUS_SUSPENDED }, admin.md, cb));
    expect(res.student?.status).toBe(UserStatus.USER_STATUS_SUSPENDED);
    expect((await app.prisma.refreshToken.findFirstOrThrow({ where: { userId: student.user.id } })).revokedAt).not.toBeNull();
    // Le jeton d'accès déjà émis ne fonctionne plus (statut relu en base).
    expect((await errorOf(call((cb) => c().student.getDashboard({ locale: LOC }, student.md, cb))))).not.toBeNull();
    expect((await errorOf(call((cb) => c().admin.setStudentStatus({ userId: admin.user.id, status: UserStatus.USER_STATUS_SUSPENDED }, admin.md, cb))))?.code).toBe(status.NOT_FOUND);
    const list = await call<{ students: unknown[] }>((cb) => c().admin.listStudents({ query: undefined, status: UserStatus.USER_STATUS_SUSPENDED, page: undefined }, admin.md, cb));
    expect(list.students).toHaveLength(1);
  });

  it("crée un formateur avec lien d'activation, refuse un e-mail déjà pris, met à jour", async () => {
    const admin = await makeUser("ADMIN");
    const body = { email: "Formateur@Test.invalid", firstName: "Nour", lastName: "F", bio: undefined, specialties: ["Python"] };
    const res = await call<{ trainer?: { id: string; email: string } }>((cb) => c().admin.createTrainer(body, admin.md, cb));
    expect(res.trainer?.email).toBe("formateur@test.invalid");
    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: "formateur@test.invalid" } });
    expect(user).toMatchObject({ role: "TRAINER", status: "PENDING_ACTIVATION" });
    await new Promise((r) => setTimeout(r, 50));
    expect(app.emails.some((e) => e.to === "formateur@test.invalid")).toBe(true);
    expect((await errorOf(call((cb) => c().admin.createTrainer(body, admin.md, cb))))?.message).toContain("email_already_used");
    const upd = await call<{ trainer?: { specialties: string[] } }>((cb) => c().admin.updateTrainer({ id: res.trainer!.id, firstName: "Nour", lastName: "G", bio: "Bio", specialties: ["Python", "SQL"] }, admin.md, cb));
    expect(upd.trainer?.specialties).toEqual(["Python", "SQL"]);
  });

  it("gère les inscriptions : progression, abandon (rouvre la session), projet, attestation unique", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "FULL", capacity: 1 } });
    const en = await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: session.id } });
    const rows = await call<{ enrollments: Array<{ projectsCount: number }> }>((cb) => c().admin.listEnrollments({ sessionId: session.id, locale: Locale.LOCALE_FR }, admin.md, cb));
    expect(rows.enrollments).toHaveLength(1);
    const prog = await call<{ enrollment?: { progressPct: number } }>((cb) => c().admin.updateEnrollment({ id: en.id, status: undefined, progressPct: 60 }, admin.md, cb));
    expect(prog.enrollment?.progressPct).toBe(60);
    expect((await errorOf(call((cb) => c().admin.updateEnrollment({ id: en.id, status: undefined, progressPct: 120 }, admin.md, cb))))?.code).toBe(status.INVALID_ARGUMENT);
    expect((await errorOf(call((cb) => c().admin.updateEnrollment({ id: en.id, status: undefined, progressPct: undefined }, admin.md, cb))))?.code).toBe(status.INVALID_ARGUMENT);
    const project = await call<{ project?: { status: unknown } }>((cb) => c().admin.createProject({ enrollmentId: en.id, title: "Projet final", description: undefined }, admin.md, cb));
    expect(project.project).toBeDefined();
    const cert = await call<{ certificate?: { code: string } }>((cb) => c().admin.issueCertificate({ enrollmentId: en.id }, admin.md, cb));
    expect(cert.certificate?.code).toMatch(/^CERT-[A-Z2-9]{10}$/);
    expect((await errorOf(call((cb) => c().admin.issueCertificate({ enrollmentId: en.id }, admin.md, cb))))?.message).toContain("certificate_already_issued");
    expect(await app.prisma.notification.count({ where: { userId: student.user.id, type: "CERTIFICATE_ISSUED" } })).toBe(1);
    await call((cb) => c().admin.updateEnrollment({ id: en.id, status: EnrollmentStatus.ENROLLMENT_STATUS_DROPPED, progressPct: undefined }, admin.md, cb));
    expect((await app.prisma.courseSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("OPEN");
  });

  it("calcule les statistiques", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "OPEN", capacity: 4 } });
    const en = await app.prisma.enrollment.create({ data: { studentId: student.studentId!, sessionId: session.id } });
    await app.prisma.payment.create({ data: { enrollmentId: en.id, amount: "150", status: "PAID" } });
    await app.prisma.payment.create({ data: { enrollmentId: en.id, amount: "50", status: "PARTIAL" } });
    await app.prisma.registration.create({ data: { firstName: "A", lastName: "B", email: "r@test.invalid", phone: "1", age: 20, educationLevel: "x", courseId: courseA.id, level: "BEGINNER", hasOwnLaptop: true, consentAt: NOW } });
    const stats = await call<{ studentsCount: number; pendingRegistrationsCount: number; revenueTnd: string; fillRatePct: number; activeCoursesCount: number; mostRequestedCourses: Array<{ courseTitle: string }> }>((cb) => c().admin.getStats({ locale: Locale.LOCALE_FR }, admin.md, cb));
    expect(stats).toMatchObject({ studentsCount: 1, pendingRegistrationsCount: 1, revenueTnd: "150.000", fillRatePct: 25, activeCoursesCount: 2 });
    expect(stats.mostRequestedCourses[0]?.courseTitle).toBe("Python (test)");
  });
});
