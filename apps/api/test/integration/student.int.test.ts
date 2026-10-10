import { status, type ServiceError } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Locale } from "@center/proto-gen/common/v1/common";
import { ProjectStatus } from "@center/proto-gen/learning/v1/learning";
import { StudentServiceClient } from "@center/proto-gen/student/v1/student";
import { VALIDATION_ERRORS_METADATA_KEY } from "../../src/common/errors";
import { NOW, seedCatalog } from "../fixtures";
import { call, metadata, resetDatabase, startTestApp, type TestApp } from "../helpers";

type DashboardRes = {
  user?: { email: string };
  enrollments: Array<{ courseTitle: string; progressPct: number; sessionLabel?: string }>;
  nextEvents: Array<{ startsAt?: Date }>;
  unreadNotifications: number;
};

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

async function makeUser(role: "STUDENT" | "TRAINER" | "ADMIN" = "STUDENT", locale: "FR" | "EN" = "FR") {
  seq += 1;
  const user = await app.prisma.user.create({
    data: {
      email: `u${seq}@test.invalid`,
      role,
      status: "ACTIVE",
      locale,
      firstName: "Prénom",
      lastName: `Nom${seq}`,
      ...(role === "STUDENT" && { student: { create: {} } }),
    },
    include: { student: true },
  });
  const { token } = await app.jwt.signAccessToken({ userId: user.id, role });
  return { user, studentId: user.student?.id, md: metadata({ authorization: `Bearer ${token}` }) };
}

/** Étudiant inscrit à une session (formation "Python (test)") avec un projet. */
async function enrolledStudent() {
  const { courseA } = await seedCatalog(app.prisma);
  const session = await app.prisma.courseSession.create({
    data: { courseId: courseA.id, label: "Groupe A", status: "ONGOING" },
  });
  const me = await makeUser();
  const enrollment = await app.prisma.enrollment.create({
    data: { studentId: me.studentId!, sessionId: session.id, status: "ACTIVE", progressPct: 40 },
  });
  const project = await app.prisma.project.create({ data: { enrollmentId: enrollment.id, title: "Projet final" } });
  return { me, session, enrollment, project, courseA };
}

const student = () => app.clients.student;
const errorOf = async (p: Promise<unknown>) => (await p.then(() => null, (e: ServiceError) => e)) as ServiceError | null;
const fieldsOf = (e: ServiceError) =>
  Object.fromEntries(
    (JSON.parse(String(e.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0])) as Array<{ field: string; code: string }>).map(
      (x) => [x.field, x.code],
    ),
  );

describe("StudentService : accès", () => {
  it("refuse l'anonyme (UNAUTHENTICATED) et les autres rôles (PERMISSION_DENIED)", async () => {
    const anon = await errorOf(call((cb) => student().getDashboard({ locale: Locale.LOCALE_UNSPECIFIED }, cb)));
    expect(anon?.code).toBe(status.UNAUTHENTICATED);
    for (const role of ["TRAINER", "ADMIN"] as const) {
      const other = await makeUser(role);
      const err = await errorOf(call((cb) => student().getDashboard({ locale: Locale.LOCALE_UNSPECIFIED }, other.md, cb)));
      expect(err?.code).toBe(status.PERMISSION_DENIED);
    }
  });
});

describe("StudentService : lecture", () => {
  it("renvoie le tableau de bord de l'étudiant connecté, avec titres localisés et prochains cours", async () => {
    const { me, session } = await enrolledStudent();
    await app.prisma.scheduleEvent.createMany({
      data: [
        { sessionId: session.id, startsAt: new Date("2026-10-04T08:00:00Z"), endsAt: new Date("2026-10-04T10:00:00Z") },
        { sessionId: session.id, startsAt: new Date("2026-10-07T08:00:00Z"), endsAt: new Date("2026-10-07T10:00:00Z") },
        { sessionId: session.id, startsAt: new Date("2026-10-06T08:00:00Z"), endsAt: new Date("2026-10-06T10:00:00Z") },
      ],
    });
    await app.prisma.notification.create({ data: { userId: me.user.id, type: "SYSTEM" } });
    const res = await call<DashboardRes>((cb) =>
      student().getDashboard({ locale: Locale.LOCALE_EN }, me.md, cb),
    );
    expect(res.user?.email).toBe(me.user.email);
    expect(res.enrollments).toHaveLength(1);
    expect(res.enrollments[0]).toMatchObject({ courseTitle: "Python (test) EN", progressPct: 40, sessionLabel: "Groupe A" });
    // L'évènement passé est exclu ; les autres sont triés par date.
    expect(res.nextEvents.map((e) => e.startsAt?.toISOString())).toEqual([
      "2026-10-06T08:00:00.000Z",
      "2026-10-07T08:00:00.000Z",
    ]);
    expect(res.unreadNotifications).toBe(1);
  });

  it("utilise la langue du profil par défaut, avec repli sur le français", async () => {
    const { courseA } = await seedCatalog(app.prisma);
    const session = await app.prisma.courseSession.create({ data: { courseId: courseA.id, status: "ONGOING" } });
    const en = await makeUser("STUDENT", "EN");
    await app.prisma.enrollment.create({ data: { studentId: en.studentId!, sessionId: session.id } });
    const res = await call<{ enrollments: Array<{ courseTitle: string }> }>((cb) =>
      student().listMyEnrollments({ locale: Locale.LOCALE_UNSPECIFIED }, en.md, cb),
    );
    expect(res.enrollments[0]?.courseTitle).toBe("Python (test) EN");
    const ar = await call<{ enrollments: Array<{ courseTitle: string }> }>((cb) =>
      student().listMyEnrollments({ locale: Locale.LOCALE_AR }, en.md, cb),
    );
    expect(ar.enrollments[0]?.courseTitle).toBe("Python (test)");
  });

  it("n'expose jamais les données d'un autre étudiant ni les notes internes", async () => {
    const { enrollment, project } = await enrolledStudent();
    const stranger = await makeUser();
    expect(
      (await call<{ enrollments: unknown[] }>((cb) => student().listMyEnrollments({ locale: Locale.LOCALE_UNSPECIFIED }, stranger.md, cb))).enrollments,
    ).toHaveLength(0);
    expect(
      (await call<{ projects: unknown[] }>((cb) => student().listMyProjects({}, stranger.md, cb))).projects,
    ).toHaveLength(0);
    const err = await errorOf(
      call((cb) => student().updateMyProject({ projectId: project.id, repoUrl: "https://github.com/x/y", submit: false }, stranger.md, cb)),
    );
    expect(err?.code).toBe(status.NOT_FOUND);

    await app.prisma.payment.create({
      data: { enrollmentId: enrollment.id, amount: "50", status: "PARTIAL", method: "CASH", note: "NOTE INTERNE" },
    });
    const owner = await app.prisma.user.findFirstOrThrow({ where: { student: { enrollments: { some: { id: enrollment.id } } } } });
    const { token } = await app.jwt.signAccessToken({ userId: owner.id, role: "STUDENT" });
    const md = metadata({ authorization: `Bearer ${token}` });
    const pay = await call<{ payments: Array<{ amount: string; note?: string }> }>((cb) => student().listMyPayments({}, md, cb));
    expect(pay.payments).toHaveLength(1);
    expect(pay.payments[0]?.amount).toBe("50.000");
    expect(JSON.stringify(pay)).not.toContain("NOTE INTERNE");
    expect(
      (await call<{ payments: unknown[] }>((cb) => student().listMyPayments({}, stranger.md, cb))).payments,
    ).toHaveLength(0);
  });

  it("liste mes demandes d'inscription (par compte ou e-mail) sans la note d'administration", async () => {
    const { courseA } = await seedCatalog(app.prisma);
    const me = await makeUser();
    const base = {
      firstName: "A", lastName: "B", phone: "12345678", age: 20, educationLevel: "L3", courseId: courseA.id,
      level: "BEGINNER" as const, hasOwnLaptop: true, consentAt: NOW, adminNote: "SECRET",
    };
    await app.prisma.registration.create({ data: { ...base, email: me.user.email } });
    await app.prisma.registration.create({ data: { ...base, email: "autre@test.invalid" } });
    const res = await call<{ registrations: Array<{ courseTitle: string }> }>((cb) =>
      student().listMyRegistrations({ locale: Locale.LOCALE_UNSPECIFIED }, me.md, cb),
    );
    expect(res.registrations).toHaveLength(1);
    expect(res.registrations[0]?.courseTitle).toBe("Python (test)");
    expect(JSON.stringify(res)).not.toContain("SECRET");
  });

  it("liste les attestations de l'étudiant", async () => {
    const { me, enrollment } = await enrolledStudent();
    await app.prisma.certificate.create({ data: { enrollmentId: enrollment.id, code: "ATT-TEST-0001" } });
    const res = await call<{ certificates: Array<{ code: string; courseTitle: string }> }>((cb) =>
      student().listMyCertificates({ locale: Locale.LOCALE_UNSPECIFIED }, me.md, cb),
    );
    expect(res.certificates).toMatchObject([{ code: "ATT-TEST-0001", courseTitle: "Python (test)" }]);
  });
});

describe("StudentService.updateMyProject : notification du formateur", () => {
  const submit = (md: ReturnType<typeof metadata>, projectId: string) =>
    call((cb) => student().updateMyProject({ projectId, repoUrl: "https://github.com/molka/projet", submit: true }, md, cb));

  it("prévient le formateur de la session quand un projet est rendu (une seule fois, sans donnée personnelle)", async () => {
    const { me, session, project } = await enrolledStudent();
    const trainerUser = await app.prisma.user.create({
      data: { email: "formateur-notif@test.invalid", role: "TRAINER", status: "ACTIVE", firstName: "F", lastName: "T", trainer: { create: {} } },
      include: { trainer: true },
    });
    await app.prisma.courseSession.update({ where: { id: session.id }, data: { trainerId: trainerUser.trainer!.id } });
    // Un simple enregistrement (sans rendre) ne notifie personne.
    await call((cb) => student().updateMyProject({ projectId: project.id, description: "brouillon", submit: false }, me.md, cb));
    expect(await app.prisma.notification.count({ where: { type: "PROJECT_SUBMITTED" } })).toBe(0);
    await submit(me.md, project.id);
    const rows = await app.prisma.notification.findMany({ where: { type: "PROJECT_SUBMITTED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: trainerUser.id, readAt: null });
    expect(rows[0]!.payload).toEqual({ projectId: project.id, sessionId: session.id });
    // Un projet verrouillé ne peut pas être rendu à nouveau : pas de seconde notification.
    expect(await errorOf(submit(me.md, project.id))).not.toBeNull();
    expect(await app.prisma.notification.count({ where: { type: "PROJECT_SUBMITTED" } })).toBe(1);
  });

  it("sans formateur assigné : le projet est rendu, aucune notification", async () => {
    const { me, project } = await enrolledStudent();
    await submit(me.md, project.id);
    expect(await app.prisma.notification.count({ where: { type: "PROJECT_SUBMITTED" } })).toBe(0);
  });
});

describe("StudentService.updateMyProject", () => {
  const update = (md: ReturnType<typeof metadata>, req: Parameters<StudentServiceClient["updateMyProject"]>[0]) =>
    call<{ project?: { status: ProjectStatus; repoUrl?: string; description?: string; submittedAt?: Date } }>((cb) =>
      student().updateMyProject(req, md, cb),
    );

  it("passe en cours dès la première modification, puis rend le projet", async () => {
    const { me, project } = await enrolledStudent();
    const a = await update(me.md, { projectId: project.id, description: "Mon appli", submit: false });
    expect(a.project).toMatchObject({ status: ProjectStatus.PROJECT_STATUS_IN_PROGRESS, description: "Mon appli" });

    const b = await update(me.md, { projectId: project.id, repoUrl: "https://github.com/molka/projet", submit: true });
    expect(b.project?.status).toBe(ProjectStatus.PROJECT_STATUS_SUBMITTED);
    expect(b.project?.submittedAt?.toISOString()).toBe(NOW.toISOString());
    // La description déjà saisie est conservée.
    expect(b.project?.description).toBe("Mon appli");
  });

  it("refuse le rendu sans dépôt, les URL non HTTPS et les projets verrouillés", async () => {
    const { me, project } = await enrolledStudent();
    const noRepo = await errorOf(update(me.md, { projectId: project.id, submit: true }));
    expect(noRepo?.code).toBe(status.INVALID_ARGUMENT);
    expect(fieldsOf(noRepo!)).toEqual({ repoUrl: "required" });

    for (const bad of ["javascript:alert(1)", "http://github.com/x/y", "https://u:p@github.com/x", "pas une url"]) {
      const err = await errorOf(update(me.md, { projectId: project.id, repoUrl: bad, submit: false }));
      expect(fieldsOf(err!)).toEqual({ repoUrl: "invalid_url" });
    }

    await update(me.md, { projectId: project.id, repoUrl: "https://github.com/molka/projet", submit: true });
    const locked = await errorOf(update(me.md, { projectId: project.id, description: "x", submit: false }));
    expect(locked?.code).toBe(status.FAILED_PRECONDITION);
    expect(locked?.details).toBe("project_locked");

    await app.prisma.project.update({ where: { id: project.id }, data: { status: "VALIDATED" } });
    expect((await errorOf(update(me.md, { projectId: project.id, description: "y", submit: false })))?.details).toBe("project_locked");
  });

  it("autorise la correction après relecture du formateur (REVIEWED → SUBMITTED)", async () => {
    const { me, project } = await enrolledStudent();
    await app.prisma.project.update({
      data: { status: "REVIEWED", repoUrl: "https://github.com/molka/projet", feedback: "À améliorer", reviewedAt: NOW },
      where: { id: project.id },
    });
    const res = await update(me.md, { projectId: project.id, submit: true });
    expect(res.project?.status).toBe(ProjectStatus.PROJECT_STATUS_SUBMITTED);
  });

  it("refuse la modification si l'inscription n'est plus active", async () => {
    const { me, project, enrollment } = await enrolledStudent();
    await app.prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED" } });
    const err = await errorOf(update(me.md, { projectId: project.id, description: "x", submit: false }));
    expect(err?.details).toBe("enrollment_not_active");
  });
});
