import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { Enrollment as ProtoEnrollment, Project as ProtoProject } from "@center/proto-gen/learning/v1/learning";
import type { Payment as ProtoPayment } from "@center/proto-gen/payment/v1/payment";
import type { Registration as ProtoRegistration } from "@center/proto-gen/registration/v1/registration";
import { StudentServiceService } from "@center/proto-gen/student/v1/student";
import { updateMyProjectInputSchema } from "@center/shared";
import {
  certificateTypeMap,
  enrollmentStatusMap,
  levelMap,
  localeMap,
  paymentMethodMap,
  paymentStatusMap,
  projectStatusMap,
  registrationStatusMap,
} from "../../common/enums";
import { notFound, failedPrecondition, unauthenticated, validationError } from "../../common/errors";
import { formatTnd } from "../../common/format";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import { EnrollmentStatus, NotificationType, ProjectStatus, type Locale } from "../../generated/prisma/enums";
import type { RequestContext, UnaryFactory } from "../../grpc/handler";
import { localesToLoad, pickByLocale } from "../course/course.mapper";
import { countUnread, toProtoUser } from "../user/user.mapper";

/** Nombre maximal d'évènements d'emploi du temps renvoyés (borne de sécurité). */
const MAX_SCHEDULE_EVENTS = 200;
const DASHBOARD_EVENTS = 5;
/** Un projet n'est modifiable que tant qu'il n'est ni rendu (en attente de correction) ni validé. */
const EDITABLE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.NOT_STARTED,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.REVIEWED,
];

const courseTitleSelect = (locales: Locale[]) => ({
  slug: true,
  translations: { where: { locale: { in: locales } }, select: { locale: true, title: true } },
});
const sessionSelect = (locales: Locale[]) => ({
  id: true,
  label: true,
  course: { select: courseTitleSelect(locales) },
  room: { select: { name: true } },
});

export function buildStudentService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;

  /**
   * Identité de l'étudiant déduite UNIQUEMENT du jeton : aucune requête ne porte d'identifiant d'utilisateur,
   * donc impossible de lire les données d'un autre étudiant.
   */
  async function me(ctx: RequestContext, requested: Parameters<typeof localeMap.toDb>[0]) {
    if (!ctx.auth) throw unauthenticated();
    const user = await prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      include: { student: { select: { id: true } } },
    });
    if (!user?.student) throw unauthenticated();
    const locale: Locale = localeMap.toDb(requested) ?? user.locale;
    return { user, studentId: user.student.id, locale, locales: localesToLoad(locale) };
  }

  async function loadEnrollments(studentId: string, locale: Locale, locales: Locale[]) {
    const rows = await prisma.enrollment.findMany({
      where: { studentId, status: { not: EnrollmentStatus.DROPPED } },
      orderBy: { createdAt: "desc" },
      include: { session: { select: sessionSelect(locales) } },
    });
    return rows.map((row): ProtoEnrollment => ({
      id: row.id,
      studentId: row.studentId,
      sessionId: row.sessionId,
      courseSlug: row.session.course.slug,
      courseTitle: pickByLocale(row.session.course.translations, locale)?.title ?? row.session.course.slug,
      sessionLabel: row.session.label ?? undefined,
      status: enrollmentStatusMap.toProto(row.status),
      progressPct: row.progressPct,
    }));
  }

  async function loadEvents(studentId: string, locale: Locale, locales: Locale[], limit: number) {
    const rows = await prisma.scheduleEvent.findMany({
      where: {
        endsAt: { gte: now() },
        session: { enrollments: { some: { studentId, status: EnrollmentStatus.ACTIVE } } },
      },
      orderBy: { startsAt: "asc" },
      take: limit,
      include: { session: { select: sessionSelect(locales) }, room: { select: { name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      courseTitle: pickByLocale(row.session.course.translations, locale)?.title ?? row.session.course.slug,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      roomName: row.room?.name ?? row.session.room?.name ?? undefined,
    }));
  }

  const toProtoProject = (row: {
    id: string;
    enrollmentId: string;
    title: string;
    description: string | null;
    repoUrl: string | null;
    status: ProjectStatus;
    feedback: string | null;
    grade: { toFixed(digits: number): string } | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
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
    getDashboard: unary(StudentServiceService.getDashboard, async (req, ctx) => {
      const { user, studentId, locale, locales } = await me(ctx, req.locale);
      const [enrollments, nextEvents, unread] = await Promise.all([
        loadEnrollments(studentId, locale, locales),
        loadEvents(studentId, locale, locales, DASHBOARD_EVENTS),
        countUnread(prisma, user.id, user.role),
      ]);
      return { user: toProtoUser(user), enrollments, nextEvents, unreadNotifications: unread };
    }),

    listMyEnrollments: unary(StudentServiceService.listMyEnrollments, async (req, ctx) => {
      const { studentId, locale, locales } = await me(ctx, req.locale);
      return { enrollments: await loadEnrollments(studentId, locale, locales) };
    }),

    listMySchedule: unary(StudentServiceService.listMySchedule, async (req, ctx) => {
      const { studentId, locale, locales } = await me(ctx, req.locale);
      return { events: await loadEvents(studentId, locale, locales, MAX_SCHEDULE_EVENTS) };
    }),

    listMyProjects: unary(StudentServiceService.listMyProjects, async (_req, ctx) => {
      const { studentId } = await me(ctx, undefined);
      const rows = await prisma.project.findMany({
        where: { enrollment: { studentId } },
        orderBy: { createdAt: "desc" },
      });
      return { projects: rows.map(toProtoProject) };
    }),

    updateMyProject: unary(StudentServiceService.updateMyProject, async (req, ctx) => {
      const { studentId } = await me(ctx, undefined);
      const input = parseInput(updateMyProjectInputSchema, {
        projectId: req.projectId,
        description: req.description,
        repoUrl: req.repoUrl,
        submit: req.submit,
      });
      // Propriété vérifiée dans la requête : un projet d'un autre étudiant est "introuvable" (pas d'énumération).
      const project = await prisma.project.findFirst({
        where: { id: input.projectId, enrollment: { studentId } },
        include: { enrollment: { select: { status: true, session: { select: { id: true, trainer: { select: { userId: true } } } } } } },
      });
      if (!project) throw notFound();
      if (project.enrollment.status !== EnrollmentStatus.ACTIVE) throw failedPrecondition("enrollment_not_active");
      if (!EDITABLE_PROJECT_STATUSES.includes(project.status)) throw failedPrecondition("project_locked");

      const description = input.description !== undefined ? input.description : project.description;
      const repoUrl = input.repoUrl ?? project.repoUrl;
      if (input.submit && !repoUrl) throw validationError([{ field: "repoUrl", code: "required" }]);

      const nextStatus: ProjectStatus = input.submit
        ? ProjectStatus.SUBMITTED
        : project.status === ProjectStatus.NOT_STARTED
          ? ProjectStatus.IN_PROGRESS
          : project.status;

      // updateMany avec le statut attendu : si le formateur a changé l'état entre-temps, rien n'est écrasé.
      // La notification du formateur est créée dans la même transaction que le changement de statut.
      const trainerUserId = project.enrollment.session.trainer?.userId;
      await prisma.$transaction(async (tx) => {
        const updated = await tx.project.updateMany({
          where: { id: project.id, status: project.status },
          data: {
            description,
            repoUrl,
            status: nextStatus,
            ...(input.submit && { submittedAt: now(), reviewedAt: null }),
          },
        });
        if (updated.count !== 1) throw failedPrecondition("project_locked");
        // Pas de donnée personnelle dans le payload ; sans formateur assigné, personne à prévenir.
        if (input.submit && trainerUserId) {
          await tx.notification.create({
            data: {
              userId: trainerUserId,
              type: NotificationType.PROJECT_SUBMITTED,
              payload: { projectId: project.id, sessionId: project.enrollment.session.id },
            },
          });
        }
      });
      const fresh = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      return { project: toProtoProject(fresh) };
    }),

    listMyCertificates: unary(StudentServiceService.listMyCertificates, async (req, ctx) => {
      const { studentId, locale, locales } = await me(ctx, req.locale);
      const rows = await prisma.certificate.findMany({
        where: { enrollment: { studentId } },
        orderBy: { issuedAt: "desc" },
        include: { enrollment: { select: { session: { select: { course: { select: courseTitleSelect(locales) } } } } } },
      });
      return {
        certificates: rows.map((row) => ({
          id: row.id,
          enrollmentId: row.enrollmentId,
          courseTitle:
            pickByLocale(row.enrollment.session.course.translations, locale)?.title ??
            row.enrollment.session.course.slug,
          type: certificateTypeMap.toProto(row.type),
          code: row.code,
          issuedAt: row.issuedAt,
        })),
      };
    }),

    listMyRegistrations: unary(StudentServiceService.listMyRegistrations, async (req, ctx) => {
      const { user, studentId, locale, locales } = await me(ctx, req.locale);
      // Rattachées au compte, ou déposées avec l'adresse e-mail du compte (déjà vérifiée à l'activation).
      const rows = await prisma.registration.findMany({
        where: { OR: [{ studentId }, { email: user.email }] },
        orderBy: { createdAt: "desc" },
        include: { course: { select: { id: true, ...courseTitleSelect(locales) } } },
      });
      return {
        registrations: rows.map(
          (row): ProtoRegistration => ({
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            age: row.age,
            educationLevel: row.educationLevel,
            institution: row.institution ?? undefined,
            courseId: row.courseId,
            courseTitle: pickByLocale(row.course.translations, locale)?.title ?? row.course.slug,
            sessionId: row.sessionId ?? undefined,
            level: levelMap.toProto(row.level),
            hasOwnLaptop: row.hasOwnLaptop,
            message: row.message ?? undefined,
            locale: localeMap.toProto(row.locale),
            status: registrationStatusMap.toProto(row.status),
            // La note interne de l'administration n'est JAMAIS exposée à l'étudiant.
            adminNote: undefined,
            createdAt: row.createdAt,
            decidedAt: row.decidedAt ?? undefined,
          }),
        ),
      };
    }),

    listMyPayments: unary(StudentServiceService.listMyPayments, async (_req, ctx) => {
      const { studentId } = await me(ctx, undefined);
      const rows = await prisma.payment.findMany({
        where: { enrollment: { studentId } },
        orderBy: { createdAt: "desc" },
      });
      return {
        payments: rows.map(
          (row): ProtoPayment => ({
            id: row.id,
            enrollmentId: row.enrollmentId,
            amount: formatTnd(row.amount),
            currency: row.currency,
            status: paymentStatusMap.toProto(row.status),
            method: row.method ? paymentMethodMap.toProto(row.method) : undefined,
            reference: row.reference ?? undefined,
            // La note interne n'est pas exposée à l'étudiant.
            note: undefined,
            paidAt: row.paidAt ?? undefined,
            createdAt: row.createdAt,
          }),
        ),
      };
    }),
  };
}
