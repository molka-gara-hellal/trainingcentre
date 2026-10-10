import { status, type ServiceError } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Locale } from "@center/proto-gen/common/v1/common";
import { AttendanceStatus, ProjectStatus } from "@center/proto-gen/learning/v1/learning";
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
      email: `t${seq}@test.invalid`, role, status: "ACTIVE", firstName: "Prénom", lastName: `Nom${seq}`,
      ...(role === "STUDENT" && { student: { create: {} } }),
      ...(role === "TRAINER" && { trainer: { create: {} } }),
    },
    include: { student: true, trainer: true },
  });
  const { token } = await app.jwt.signAccessToken({ userId: user.id, role });
  return { user, studentId: user.student?.id, trainerId: user.trainer?.id, md: metadata({ authorization: `Bearer ${token}` }) };
}

/** Un formateur avec sa session, 2 étudiants, 1 cours passé et 1 cours futur, un projet rendu par étudiant. */
async function setup() {
  const { courseA } = await seedCatalog(app.prisma);
  const trainer = await makeUser("TRAINER");
  const session = await app.prisma.courseSession.create({
    data: { courseId: courseA.id, trainerId: trainer.trainerId!, label: "Groupe A", status: "ONGOING" },
  });
  const students = [];
  for (let i = 0; i < 2; i += 1) {
    const s = await makeUser("STUDENT");
    const enrollment = await app.prisma.enrollment.create({ data: { studentId: s.studentId!, sessionId: session.id } });
    const project = await app.prisma.project.create({
      data: { enrollmentId: enrollment.id, title: `Projet ${i}`, status: "SUBMITTED", repoUrl: "https://github.com/a/b", submittedAt: NOW },
    });
    students.push({ ...s, enrollment, project });
  }
  const past = await app.prisma.scheduleEvent.create({
    data: { sessionId: session.id, startsAt: new Date("2026-10-04T08:00:00Z"), endsAt: new Date("2026-10-04T10:00:00Z") },
  });
  const future = await app.prisma.scheduleEvent.create({
    data: { sessionId: session.id, startsAt: new Date("2026-10-09T08:00:00Z"), endsAt: new Date("2026-10-09T10:00:00Z") },
  });
  return { trainer, session, students, past, future, courseA };
}

const t = () => app.clients.trainer;
const errorOf = async (p: Promise<unknown>) => (await p.then(() => null, (e: ServiceError) => e)) as ServiceError | null;
const fieldsOf = (e: ServiceError) =>
  Object.fromEntries(
    (JSON.parse(String(e.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0])) as Array<{ field: string; code: string }>).map((x) => [x.field, x.code]),
  );

describe("TrainerService : accès", () => {
  it("anonyme → UNAUTHENTICATED ; étudiant et admin → PERMISSION_DENIED", async () => {
    expect((await errorOf(call((cb) => t().listMySessions({ locale: Locale.LOCALE_UNSPECIFIED }, cb))))?.code).toBe(status.UNAUTHENTICATED);
    for (const role of ["STUDENT", "ADMIN"] as const) {
      const u = await makeUser(role);
      expect((await errorOf(call((cb) => t().listMySessions({ locale: Locale.LOCALE_UNSPECIFIED }, u.md, cb))))?.code).toBe(status.PERMISSION_DENIED);
    }
  });
});

describe("TrainerService : lecture limitée aux sessions assignées", () => {
  it("liste mes sessions, étudiants et planning ; les sessions des autres sont introuvables", async () => {
    const { trainer, session, students } = await setup();
    const other = await makeUser("TRAINER");
    const mine = await call<{ sessions: Array<{ id: string; courseTitle: string }> }>((cb) =>
      t().listMySessions({ locale: Locale.LOCALE_EN }, trainer.md, cb),
    );
    expect(mine.sessions.map((s) => [s.id, s.courseTitle])).toEqual([[session.id, "Python (test) EN"]]);
    expect((await call<{ sessions: unknown[] }>((cb) => t().listMySessions({ locale: Locale.LOCALE_UNSPECIFIED }, other.md, cb))).sessions).toHaveLength(0);

    const list = await call<{ students: Array<{ email: string; enrollment?: { progressPct: number } }> }>((cb) =>
      t().listSessionStudents({ sessionId: session.id, locale: Locale.LOCALE_UNSPECIFIED }, trainer.md, cb),
    );
    expect(list.students.map((s) => s.email).sort()).toEqual(students.map((s) => s.user.email).sort());

    const sched = await call<{ events: unknown[] }>((cb) => t().listSessionSchedule({ sessionId: session.id, locale: Locale.LOCALE_UNSPECIFIED }, trainer.md, cb));
    expect(sched.events).toHaveLength(2);

    for (const rpc of ["listSessionStudents", "listSessionSchedule", "listSessionProjects"] as const) {
      const err = await errorOf(call((cb) => (t()[rpc] as (...a: unknown[]) => unknown)({ sessionId: session.id, locale: Locale.LOCALE_UNSPECIFIED }, other.md, cb)));
      expect(err?.code).toBe(status.NOT_FOUND);
    }
    const bad = await errorOf(call((cb) => t().listSessionStudents({ sessionId: "x", locale: Locale.LOCALE_UNSPECIFIED }, trainer.md, cb)));
    expect(bad?.code).toBe(status.INVALID_ARGUMENT);
  });

  it("n'inclut pas les étudiants ayant abandonné", async () => {
    const { trainer, session, students } = await setup();
    await app.prisma.enrollment.update({ where: { id: students[0]!.enrollment.id }, data: { status: "DROPPED" } });
    const list = await call<{ students: unknown[] }>((cb) => t().listSessionStudents({ sessionId: session.id, locale: Locale.LOCALE_UNSPECIFIED }, trainer.md, cb));
    expect(list.students).toHaveLength(1);
  });
});

describe("TrainerService : présences", () => {
  it("enregistre puis met à jour les présences (upsert) et les relit", async () => {
    const { trainer, students, past } = await setup();
    const [a, b] = students;
    await call((cb) =>
      t().markAttendance(
        { scheduleEventId: past.id, records: [
          { enrollmentId: a!.enrollment.id, status: AttendanceStatus.ATTENDANCE_STATUS_PRESENT },
          { enrollmentId: b!.enrollment.id, status: AttendanceStatus.ATTENDANCE_STATUS_ABSENT, note: "malade" },
        ] },
        trainer.md, cb,
      ),
    );
    await call((cb) =>
      t().markAttendance({ scheduleEventId: past.id, records: [{ enrollmentId: b!.enrollment.id, status: AttendanceStatus.ATTENDANCE_STATUS_EXCUSED }] }, trainer.md, cb),
    );
    const res = await call<{ records: Array<{ enrollmentId: string; status: AttendanceStatus; note?: string }> }>((cb) =>
      t().getEventAttendance({ scheduleEventId: past.id }, trainer.md, cb),
    );
    expect(res.records).toHaveLength(2);
    const rb = res.records.find((r) => r.enrollmentId === b!.enrollment.id);
    expect(rb).toMatchObject({ status: AttendanceStatus.ATTENDANCE_STATUS_EXCUSED });
    expect(rb?.note).toBeUndefined(); // la note est remplacée à la mise à jour
  });

  it("refuse un cours futur, une inscription d'une autre session, un doublon et un cours d'un autre formateur", async () => {
    const { trainer, students, past, future, courseA } = await setup();
    const rec = (id: string) => ({ enrollmentId: id, status: AttendanceStatus.ATTENDANCE_STATUS_PRESENT });
    const a = students[0]!.enrollment.id;
    expect((await errorOf(call((cb) => t().markAttendance({ scheduleEventId: future.id, records: [rec(a)] }, trainer.md, cb))))?.details).toBe("event_not_started");

    const otherSession = await app.prisma.courseSession.create({ data: { courseId: courseA.id } });
    const stranger = await makeUser("STUDENT");
    const foreign = await app.prisma.enrollment.create({ data: { studentId: stranger.studentId!, sessionId: otherSession.id } });
    const err = await errorOf(call((cb) => t().markAttendance({ scheduleEventId: past.id, records: [rec(foreign.id)] }, trainer.md, cb)));
    expect(err?.code).toBe(status.INVALID_ARGUMENT);
    expect(fieldsOf(err!)).toEqual({ records: "invalid_value" });

    expect((await errorOf(call((cb) => t().markAttendance({ scheduleEventId: past.id, records: [rec(a), rec(a)] }, trainer.md, cb))))?.code).toBe(status.INVALID_ARGUMENT);
    expect((await errorOf(call((cb) => t().markAttendance({ scheduleEventId: past.id, records: [{ enrollmentId: a, status: AttendanceStatus.ATTENDANCE_STATUS_UNSPECIFIED }] }, trainer.md, cb))))?.code).toBe(status.INVALID_ARGUMENT);

    const other = await makeUser("TRAINER");
    expect((await errorOf(call((cb) => t().markAttendance({ scheduleEventId: past.id, records: [rec(a)] }, other.md, cb))))?.code).toBe(status.NOT_FOUND);
    expect((await errorOf(call((cb) => t().getEventAttendance({ scheduleEventId: past.id }, other.md, cb))))?.code).toBe(status.NOT_FOUND);
    expect(await app.prisma.attendance.count()).toBe(0);
  });
});

describe("TrainerService : relecture des projets", () => {
  const review = (md: ReturnType<typeof metadata>, req: Record<string, unknown>) =>
    call<{ project?: { status: ProjectStatus; feedback?: string; grade?: string; reviewedAt?: Date } }>((cb) => t().reviewProject(req as never, md, cb));

  it("liste les projets avec le nom de l'étudiant", async () => {
    const { trainer, session } = await setup();
    const res = await call<{ projects: Array<{ project?: { title: string }; firstName: string }> }>((cb) => t().listSessionProjects({ sessionId: session.id }, trainer.md, cb));
    expect(res.projects).toHaveLength(2);
    expect(res.projects[0]?.firstName).toBe("Prénom");
  });

  it("renvoie le projet à corriger : feedback, note, date, et notifie l'étudiant", async () => {
    const { trainer, students } = await setup();
    const s = students[0]!;
    const res = await review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_REVIEWED, feedback: "Ajoutez des tests", grade: "12.5" });
    expect(res.project).toMatchObject({ status: ProjectStatus.PROJECT_STATUS_REVIEWED, feedback: "Ajoutez des tests", grade: "12.50" });
    expect(res.project?.reviewedAt?.toISOString()).toBe(NOW.toISOString());
    const notif = await app.prisma.notification.findMany({ where: { userId: s.user.id } });
    expect(notif).toHaveLength(1);
    expect(notif[0]).toMatchObject({ type: "PROJECT_REVIEWED", readAt: null });
    // L'étudiant voit la notification et sa note via ses propres RPC.
    const mine = await call<{ notifications: unknown[] }>((cb) => app.clients.notification.listMyNotifications({ unreadOnly: true, limit: 0 }, s.md, cb));
    expect(mine.notifications).toHaveLength(1);
    const other = await app.prisma.notification.count({ where: { userId: students[1]!.user.id } });
    expect(other).toBe(0);
  });

  it("valide un projet : définitif, plus modifiable ni par le formateur ni par l'étudiant", async () => {
    const { trainer, students } = await setup();
    const s = students[0]!;
    await review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_VALIDATED, grade: "18" });
    const again = await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_REVIEWED, feedback: "x" }));
    expect(again?.details).toBe("project_not_reviewable");
    const edit = await errorOf(call((cb) => app.clients.student.updateMyProject({ projectId: s.project.id, description: "y", submit: false }, s.md, cb)));
    expect(edit?.details).toBe("project_locked");
  });

  it("refuse : feedback manquant pour « à corriger », note > 20 ou mal formée, statut interdit, projet non rendu, autre formateur", async () => {
    const { trainer, students } = await setup();
    const s = students[0]!;
    const e1 = await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_REVIEWED }));
    expect(fieldsOf(e1!)).toEqual({ feedback: "required" });
    expect(fieldsOf((await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_VALIDATED, grade: "20.5" })))!)).toEqual({ grade: "out_of_range" });
    expect(fieldsOf((await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_VALIDATED, grade: "abc" })))!)).toEqual({ grade: "invalid_number" });
    expect((await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_SUBMITTED, feedback: "x" })))?.code).toBe(status.INVALID_ARGUMENT);

    await app.prisma.project.update({ where: { id: s.project.id }, data: { status: "IN_PROGRESS" } });
    expect((await errorOf(review(trainer.md, { projectId: s.project.id, status: ProjectStatus.PROJECT_STATUS_VALIDATED })))?.details).toBe("project_not_reviewable");

    const other = await makeUser("TRAINER");
    expect((await errorOf(review(other.md, { projectId: students[1]!.project.id, status: ProjectStatus.PROJECT_STATUS_VALIDATED })))?.code).toBe(status.NOT_FOUND);
    expect(await app.prisma.notification.count()).toBe(0);
  });
});
