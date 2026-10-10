import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { ScheduleEvent, Project as ProtoProject } from "@center/proto-gen/learning/v1/learning";
import { TrainerServiceService } from "@center/proto-gen/trainer/v1/trainer";
import { attendanceInputSchema, reviewProjectInputSchema } from "@center/shared";
import {
  attendanceStatusMap,
  enrollmentStatusMap,
  localeMap,
  projectStatusMap,
} from "../../common/enums";
import { failedPrecondition, notFound, unauthenticated, validationError } from "../../common/errors";
import { normalizePage, pageInfo } from "../../common/format";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import { EnrollmentStatus, NotificationType, ProjectStatus, type Locale } from "../../generated/prisma/enums";
import type { RequestContext, UnaryFactory } from "../../grpc/handler";
import { localesToLoad, mapSession, pickByLocale, sessionInclude } from "../course/course.mapper";

const REVIEWABLE: ProjectStatus[] = [ProjectStatus.SUBMITTED, ProjectStatus.REVIEWED];

export function buildTrainerService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;

  /** Le formateur est déduit du jeton ; aucun identifiant de formateur n'est accepté dans les requêtes. */
  async function me(ctx: RequestContext, requested?: Parameters<typeof localeMap.toDb>[0]) {
    if (!ctx.auth) throw unauthenticated();
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      include: { trainer: { select: { id: true } } },
    });
    if (!user?.trainer) throw unauthenticated();
    const locale: Locale = localeMap.toDb(requested) ?? user.locale;
    return { trainerId: user.trainer.id, locale, locales: localesToLoad(locale) };
  }

  /** Session assignée au formateur, sinon « introuvable » (on ne révèle pas l'existence des autres sessions). */
  async function ownSession(trainerId: string, sessionId: string, locales: Locale[]) {
    const session = await prisma.courseSession.findFirst({
      where: { id: sessionId, trainerId },
      include: { course: { select: { slug: true, translations: { where: { locale: { in: locales } }, select: { locale: true, title: true } } } } },
    });
    if (!session) throw notFound();
    return session;
  }
  const requireUuid = (field: string, value: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw validationError([{ field, code: "invalid_value" }]);
    }
  };

  const toProtoProject = (row: {
    id: string; enrollmentId: string; title: string; description: string | null; repoUrl: string | null;
    status: ProjectStatus; feedback: string | null; grade: { toFixed(d: number): string } | null;
    submittedAt: Date | null; reviewedAt: Date | null;
  }): ProtoProject => ({
    id: row.id,
    enrollmentId: row.enrollmentId,
    title: row.title,
    description: row.description ?? undefined,
    repoUrl: row.repoUrl ?? undefined,
    status: projectStatusMap.toProto(row.status),
    feedback: row.feedback ?? undefined,
    grade: row.grade ? row.grade.toFixed(2) : undefined,
    submittedAt: row.submittedAt ?? undefined,
    reviewedAt: row.reviewedAt ?? undefined,
  });

  return {
    listMySessions: unary(TrainerServiceService.listMySessions, async (req, ctx) => {
      const { trainerId, locale, locales } = await me(ctx, req.locale);
      const params = normalizePage(req.page, 20, 50);
      const where = { trainerId };
      const [rows, total] = await Promise.all([
        prisma.courseSession.findMany({
          where,
          include: sessionInclude(locales),
          orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
          skip: params.skip,
          take: params.pageSize,
        }),
        prisma.courseSession.count({ where }),
      ]);
      return { sessions: rows.map((row) => mapSession(row, locale)), pageInfo: pageInfo(params, total) };
    }),

    listSessionStudents: unary(TrainerServiceService.listSessionStudents, async (req, ctx) => {
      const { trainerId, locale, locales } = await me(ctx, req.locale);
      requireUuid("sessionId", req.sessionId);
      const session = await ownSession(trainerId, req.sessionId, locales);
      const title = pickByLocale(session.course.translations, locale)?.title ?? session.course.slug;
      const rows = await prisma.enrollment.findMany({
        where: { sessionId: session.id, status: { not: EnrollmentStatus.DROPPED } },
        include: { student: { select: { user: { select: { firstName: true, lastName: true, email: true } } } } },
        orderBy: { student: { user: { lastName: "asc" } } },
      });
      return {
        students: rows.map((row) => ({
          enrollment: {
            id: row.id,
            studentId: row.studentId,
            sessionId: row.sessionId,
            courseSlug: session.course.slug,
            courseTitle: title,
            sessionLabel: session.label ?? undefined,
            status: enrollmentStatusMap.toProto(row.status),
            progressPct: row.progressPct,
          },
          firstName: row.student.user.firstName,
          lastName: row.student.user.lastName,
          email: row.student.user.email,
        })),
      };
    }),

    listSessionSchedule: unary(TrainerServiceService.listSessionSchedule, async (req, ctx) => {
      const { trainerId, locale, locales } = await me(ctx, req.locale);
      requireUuid("sessionId", req.sessionId);
      const session = await ownSession(trainerId, req.sessionId, locales);
      const title = pickByLocale(session.course.translations, locale)?.title ?? session.course.slug;
      const rows = await prisma.scheduleEvent.findMany({
        where: { sessionId: session.id },
        orderBy: { startsAt: "asc" },
        take: 500,
        include: { room: { select: { name: true } } },
      });
      const events: ScheduleEvent[] = rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        courseTitle: title,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        roomName: row.room?.name ?? undefined,
      }));
      return { events };
    }),

    getEventAttendance: unary(TrainerServiceService.getEventAttendance, async (req, ctx) => {
      const { trainerId } = await me(ctx);
      requireUuid("scheduleEventId", req.scheduleEventId);
      const event = await prisma.scheduleEvent.findFirst({
        where: { id: req.scheduleEventId, session: { trainerId } },
        select: { id: true },
      });
      if (!event) throw notFound();
      const rows = await prisma.attendance.findMany({ where: { scheduleEventId: event.id } });
      return {
        records: rows.map((row) => ({
          enrollmentId: row.enrollmentId,
          status: attendanceStatusMap.toProto(row.status),
          note: row.note ?? undefined,
        })),
      };
    }),

    markAttendance: unary(TrainerServiceService.markAttendance, async (req, ctx) => {
      const { trainerId } = await me(ctx);
      const input = parseInput(attendanceInputSchema, {
        scheduleEventId: req.scheduleEventId,
        records: req.records.map((record) => ({
          enrollmentId: record.enrollmentId,
          status: attendanceStatusMap.toDb(record.status),
          note: record.note,
        })),
      });
      if (new Set(input.records.map((r) => r.enrollmentId)).size !== input.records.length) {
        throw validationError([{ field: "records", code: "invalid_value" }]);
      }
      const event = await prisma.scheduleEvent.findFirst({
        where: { id: input.scheduleEventId, session: { trainerId } },
        select: { id: true, sessionId: true, startsAt: true },
      });
      if (!event) throw notFound();
      // On ne pointe pas les présences d'un cours qui n'a pas encore commencé.
      if (event.startsAt > now()) throw failedPrecondition("event_not_started");

      // Toutes les inscriptions doivent appartenir à CETTE session et ne pas être abandonnées.
      const valid = await prisma.enrollment.findMany({
        where: {
          id: { in: input.records.map((r) => r.enrollmentId) },
          sessionId: event.sessionId,
          status: { not: EnrollmentStatus.DROPPED },
        },
        select: { id: true },
      });
      if (valid.length !== input.records.length) throw validationError([{ field: "records", code: "invalid_value" }]);

      await prisma.$transaction(
        input.records.map((record) =>
          prisma.attendance.upsert({
            where: { enrollmentId_scheduleEventId: { enrollmentId: record.enrollmentId, scheduleEventId: event.id } },
            create: { enrollmentId: record.enrollmentId, scheduleEventId: event.id, status: record.status, note: record.note ?? null },
            update: { status: record.status, note: record.note ?? null },
          }),
        ),
      );
      return {};
    }),

    listSessionProjects: unary(TrainerServiceService.listSessionProjects, async (req, ctx) => {
      const { trainerId, locales } = await me(ctx);
      requireUuid("sessionId", req.sessionId);
      const session = await ownSession(trainerId, req.sessionId, locales);
      const rows = await prisma.project.findMany({
        where: { enrollment: { sessionId: session.id, status: { not: EnrollmentStatus.DROPPED } } },
        orderBy: [{ submittedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        include: { enrollment: { select: { student: { select: { user: { select: { firstName: true, lastName: true } } } } } } },
      });
      return {
        projects: rows.map((row) => ({
          project: toProtoProject(row),
          firstName: row.enrollment.student.user.firstName,
          lastName: row.enrollment.student.user.lastName,
        })),
      };
    }),

    reviewProject: unary(TrainerServiceService.reviewProject, async (req, ctx) => {
      const { trainerId } = await me(ctx);
      const input = parseInput(reviewProjectInputSchema, {
        projectId: req.projectId,
        status: projectStatusMap.toDb(req.status),
        feedback: req.feedback,
        grade: req.grade,
      });
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, enrollment: { session: { trainerId } } },
        include: { enrollment: { select: { student: { select: { userId: true } } } } },
      });
      if (!project) throw notFound();
      // On ne relit qu'un projet rendu par l'étudiant (ou déjà relu) ; un projet validé est définitif.
      if (!REVIEWABLE.includes(project.status)) throw failedPrecondition("project_not_reviewable");

      const reviewedAt = now();
      const userId = project.enrollment.student.userId;
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.project.updateMany({
          where: { id: project.id, status: project.status },
          data: {
            status: input.status,
            feedback: input.feedback ?? null,
            grade: input.grade ?? null,
            reviewedAt,
          },
        });
        if (claimed.count !== 1) throw failedPrecondition("project_not_reviewable");
        await tx.notification.create({
          data: { userId, type: NotificationType.PROJECT_REVIEWED, payload: { projectId: project.id, status: input.status } },
        });
        return tx.project.findUniqueOrThrow({ where: { id: project.id } });
      });
      return { project: toProtoProject(updated) };
    }),
  };
}
