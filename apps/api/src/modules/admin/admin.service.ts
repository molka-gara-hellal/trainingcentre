import { randomBytes } from "node:crypto";
import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { Logger } from "pino";
import { AdminServiceService, type StudentSummary, type TrainerSummary } from "@center/proto-gen/admin/v1/admin";
import type { Enrollment, Project } from "@center/proto-gen/learning/v1/learning";
import {
  createProjectInputSchema,
  createTrainerInputSchema,
  setStudentStatusInputSchema,
  updateEnrollmentInputSchema,
  updateTrainerInputSchema,
} from "@center/shared";
import { z } from "zod";
import { actorId, callerLocale } from "../../common/caller";
import { audit } from "../../common/audit";
import type { EmailProvider } from "../../common/email";
import { certificateTypeMap, enrollmentStatusMap, projectStatusMap, userStatusMap } from "../../common/enums";
import { alreadyExists, failedPrecondition, notFound } from "../../common/errors";
import { formatTnd, normalizePage, pageInfo } from "../../common/format";
import { Prisma, type PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import {
  CertificateType,
  CourseStatus,
  EnrollmentStatus,
  NotificationType,
  PaymentStatus,
  ProjectStatus,
  RegistrationStatus,
  Role,
  SessionStatus,
  UserStatus,
  type Locale,
} from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";
import { ACTIVATION_TTL_MS, createOneTimeToken } from "../auth/auth.service";
import { sendActivationLink } from "../auth/activation-mail";
import { localesToLoad, pickByLocale } from "../course/course.mapper";

const uuidSchema = z.object({ id: z.uuid("invalid_value") });

const toStudent = (row: {
  id: string; userId: string; phone: string | null;
  user: { firstName: string; lastName: string; email: string; status: UserStatus };
  _count: { enrollments: number };
}): StudentSummary => ({
  id: row.id, userId: row.userId, firstName: row.user.firstName, lastName: row.user.lastName, email: row.user.email,
  phone: row.phone ?? undefined, status: userStatusMap.toProto(row.user.status), enrollmentsCount: row._count.enrollments,
});

const toTrainer = (row: {
  id: string; userId: string; bio: string | null; specialties: string[];
  user: { firstName: string; lastName: string; email: string };
}): TrainerSummary => ({
  id: row.id, userId: row.userId, firstName: row.user.firstName, lastName: row.user.lastName, email: row.user.email,
  bio: row.bio ?? undefined, specialties: row.specialties,
});

const toProject = (p: {
  id: string; enrollmentId: string; title: string; description: string | null; repoUrl: string | null;
  status: ProjectStatus; feedback: string | null; grade: { toFixed(d: number): string } | null;
  submittedAt: Date | null; reviewedAt: Date | null;
}): Project => ({
  id: p.id, enrollmentId: p.enrollmentId, title: p.title, description: p.description ?? undefined, repoUrl: p.repoUrl ?? undefined,
  status: projectStatusMap.toProto(p.status), feedback: p.feedback ?? undefined, grade: p.grade ? p.grade.toFixed(2) : undefined,
  submittedAt: p.submittedAt ?? undefined, reviewedAt: p.reviewedAt ?? undefined,
});

/** Code de vérification lisible : préfixe + 10 caractères aléatoires sans ambiguïté (pas de 0/O/1/I). */
function certificateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return `CERT-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export function buildAdminService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  email: EmailProvider;
  siteUrl: string;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;
  const S = AdminServiceService;

  async function enrollmentView(id: string, locale: Locale): Promise<Enrollment> {
    const row = await prisma.enrollment.findUniqueOrThrow({
      where: { id },
      include: { session: { select: { label: true, course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } } } },
    });
    return {
      id: row.id, studentId: row.studentId, sessionId: row.sessionId, courseSlug: row.session.course.slug,
      courseTitle: pickByLocale(row.session.course.translations, locale)?.title ?? row.session.course.slug,
      sessionLabel: row.session.label ?? undefined, status: enrollmentStatusMap.toProto(row.status), progressPct: row.progressPct,
    };
  }

  const studentWith = (userId: string) =>
    prisma.student.findUniqueOrThrow({ where: { userId }, include: { user: true, _count: { select: { enrollments: true } } } });

  return {
    getStats: unary(S.getStats, async (req, ctx) => {
      const locale = await callerLocale(prisma, ctx, req.locale);
      const [students, registrations, pending, courses, revenue, capacity, active, demand] = await Promise.all([
        prisma.student.count({ where: { user: { deletedAt: null } } }),
        prisma.registration.count(),
        prisma.registration.count({ where: { status: RegistrationStatus.PENDING } }),
        prisma.course.count({ where: { status: CourseStatus.PUBLISHED, deletedAt: null } }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { status: PaymentStatus.PAID } }),
        prisma.courseSession.aggregate({ _sum: { capacity: true }, where: { status: { in: [SessionStatus.OPEN, SessionStatus.FULL, SessionStatus.ONGOING] }, capacity: { not: null } } }),
        prisma.enrollment.count({ where: { status: EnrollmentStatus.ACTIVE, session: { status: { in: [SessionStatus.OPEN, SessionStatus.FULL, SessionStatus.ONGOING] }, capacity: { not: null } } } }),
        prisma.registration.groupBy({ by: ["courseId"], _count: { _all: true }, orderBy: { _count: { courseId: "desc" } }, take: 5 }),
      ]);
      const cap = capacity._sum.capacity ?? 0;
      const titles = await prisma.course.findMany({
        where: { id: { in: demand.map((d) => d.courseId) } },
        select: { id: true, slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } },
      });
      return {
        studentsCount: students,
        registrationsCount: registrations,
        pendingRegistrationsCount: pending,
        activeCoursesCount: courses,
        revenueTnd: formatTnd(revenue._sum.amount ?? new Prisma.Decimal(0)),
        fillRatePct: cap > 0 ? Math.min(100, Math.round((active / cap) * 100)) : 0,
        mostRequestedCourses: demand.flatMap((d) => {
          const course = titles.find((t) => t.id === d.courseId);
          return course ? [{ courseSlug: course.slug, courseTitle: pickByLocale(course.translations, locale)?.title ?? course.slug, registrationsCount: d._count._all }] : [];
        }),
      };
    }),

    listStudents: unary(S.listStudents, async (req) => {
      const params = normalizePage(req.page, 20, 100);
      const status = userStatusMap.toDb(req.status);
      const query = req.query?.trim().slice(0, 100);
      const where: Prisma.StudentWhereInput = {
        user: {
          deletedAt: null,
          ...(status && { status }),
          ...(query && { OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }),
        },
      };
      const [rows, total] = await Promise.all([
        prisma.student.findMany({ where, include: { user: true, _count: { select: { enrollments: true } } }, orderBy: { user: { createdAt: "desc" } }, skip: params.skip, take: params.pageSize }),
        prisma.student.count({ where }),
      ]);
      return { students: rows.map(toStudent), pageInfo: pageInfo(params, total) };
    }),

    setStudentStatus: unary(S.setStudentStatus, async (req, ctx) => {
      const input = parseInput(setStudentStatusInputSchema, { userId: req.userId, status: userStatusMap.toDb(req.status) });
      // Cible limitée aux étudiants : un administrateur ne peut pas se suspendre ni suspendre un autre membre du personnel.
      const target = await prisma.user.findFirst({ where: { id: input.userId, role: Role.STUDENT, deletedAt: null }, select: { id: true, status: true } });
      if (!target) throw notFound();
      if (target.status === UserStatus.PENDING_ACTIVATION) throw failedPrecondition("account_not_activated");
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
        // Suspendre = fermer toutes les sessions ouvertes immédiatement.
        if (input.status === "SUSPENDED") await tx.refreshToken.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: now() } });
        await audit(tx, actorId(ctx), "student.status", "User", target.id, { status: input.status });
      });
      return { student: toStudent(await studentWith(target.id)) };
    }),

    listTrainers: unary(S.listTrainers, async () => {
      const rows = await prisma.trainer.findMany({ where: { user: { deletedAt: null } }, include: { user: true }, orderBy: { user: { lastName: "asc" } }, take: 200 });
      return { trainers: rows.map(toTrainer) };
    }),

    createTrainer: unary(S.createTrainer, async (req, ctx) => {
      const input = parseInput(createTrainerInputSchema, { email: req.email, firstName: req.firstName, lastName: req.lastName, bio: req.bio, specialties: req.specialties });
      const at = now();
      const outcome: { token?: string; locale?: Locale } = {};
      try {
        const trainer = await prisma.$transaction(async (tx) => {
          if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw alreadyExists("email_already_used");
          const user = await tx.user.create({
            data: {
              email: input.email, firstName: input.firstName, lastName: input.lastName, role: Role.TRAINER, status: UserStatus.PENDING_ACTIVATION,
              trainer: { create: { bio: input.bio ?? null, specialties: input.specialties } },
            },
            include: { trainer: true },
          });
          outcome.token = await createOneTimeToken(tx, user.id, ACTIVATION_TTL_MS, at);
          outcome.locale = user.locale;
          await audit(tx, actorId(ctx), "trainer.create", "User", user.id);
          return { ...user.trainer!, user };
        });
        sendActivationLink(deps, { email: input.email, locale: outcome.locale! }, outcome.token!, ctx.log as Logger);
        return { trainer: toTrainer(trainer) };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw alreadyExists("email_already_used");
        throw err;
      }
    }),

    updateTrainer: unary(S.updateTrainer, async (req, ctx) => {
      const input = parseInput(updateTrainerInputSchema, { id: req.id, firstName: req.firstName, lastName: req.lastName, bio: req.bio, specialties: req.specialties });
      const existing = await prisma.trainer.findUnique({ where: { id: input.id }, select: { id: true, userId: true } });
      if (!existing) throw notFound();
      const row = await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: existing.userId }, data: { firstName: input.firstName, lastName: input.lastName } });
        const trainer = await tx.trainer.update({ where: { id: input.id }, data: { bio: input.bio ?? null, specialties: input.specialties }, include: { user: true } });
        await audit(tx, actorId(ctx), "trainer.update", "Trainer", input.id);
        return trainer;
      });
      return { trainer: toTrainer(row) };
    }),

    listEnrollments: unary(S.listEnrollments, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.sessionId });
      const locale = await callerLocale(prisma, ctx, req.locale);
      const session = await prisma.courseSession.findUnique({
        where: { id },
        select: { label: true, course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } },
      });
      if (!session) throw notFound();
      const title = pickByLocale(session.course.translations, locale)?.title ?? session.course.slug;
      const rows = await prisma.enrollment.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: "asc" },
        take: 500,
        include: { student: { select: { user: { select: { firstName: true, lastName: true, email: true } } } }, _count: { select: { projects: true } }, certificates: { select: { code: true }, orderBy: { issuedAt: "desc" }, take: 1 } },
      });
      return {
        enrollments: rows.map((row) => ({
          enrollment: {
            id: row.id, studentId: row.studentId, sessionId: row.sessionId, courseSlug: session.course.slug, courseTitle: title,
            sessionLabel: session.label ?? undefined, status: enrollmentStatusMap.toProto(row.status), progressPct: row.progressPct,
          },
          firstName: row.student.user.firstName, lastName: row.student.user.lastName, email: row.student.user.email,
          projectsCount: row._count.projects, certificateCode: row.certificates[0]?.code,
        })),
      };
    }),

    updateEnrollment: unary(S.updateEnrollment, async (req, ctx) => {
      const input = parseInput(updateEnrollmentInputSchema, { id: req.id, status: enrollmentStatusMap.toDb(req.status), progressPct: req.progressPct });
      const locale = await callerLocale(prisma, ctx);
      const existing = await prisma.enrollment.findUnique({ where: { id: input.id }, select: { id: true, sessionId: true, status: true } });
      if (!existing) throw notFound();
      await prisma.$transaction(async (tx) => {
        await tx.enrollment.update({
          where: { id: input.id },
          data: { ...(input.status && { status: input.status }), ...(input.progressPct !== undefined && { progressPct: input.progressPct }) },
        });
        // Une place libérée (abandon) ré-ouvre la session si elle était complète.
        if (input.status && input.status !== "ACTIVE" && existing.status === EnrollmentStatus.ACTIVE) {
          await tx.courseSession.updateMany({ where: { id: existing.sessionId, status: SessionStatus.FULL }, data: { status: SessionStatus.OPEN } });
        }
        await audit(tx, actorId(ctx), "enrollment.update", "Enrollment", input.id, { status: input.status ?? null, progressPct: input.progressPct ?? null });
      });
      return { enrollment: await enrollmentView(input.id, locale) };
    }),

    createProject: unary(S.createProject, async (req, ctx) => {
      const input = parseInput(createProjectInputSchema, { enrollmentId: req.enrollmentId, title: req.title, description: req.description });
      if (!(await prisma.enrollment.findUnique({ where: { id: input.enrollmentId }, select: { id: true } }))) throw notFound();
      const project = await prisma.$transaction(async (tx) => {
        const row = await tx.project.create({ data: { enrollmentId: input.enrollmentId, title: input.title, description: input.description ?? null, status: ProjectStatus.NOT_STARTED } });
        await audit(tx, actorId(ctx), "project.create", "Project", row.id, { enrollmentId: input.enrollmentId });
        return row;
      });
      return { project: toProject(project) };
    }),

    issueCertificate: unary(S.issueCertificate, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.enrollmentId });
      const locale = await callerLocale(prisma, ctx);
      const enrollment = await prisma.enrollment.findUnique({
        where: { id },
        select: { id: true, student: { select: { userId: true } }, session: { select: { course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } } } },
      });
      if (!enrollment) throw notFound();
      const courseTitle = pickByLocale(enrollment.session.course.translations, locale)?.title ?? enrollment.session.course.slug;
      const cert = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cert|${id}`}))`;
        // Une seule attestation par inscription.
        if (await tx.certificate.findFirst({ where: { enrollmentId: id }, select: { id: true } })) throw alreadyExists("certificate_already_issued");
        const row = await tx.certificate.create({ data: { enrollmentId: id, type: CertificateType.ATTESTATION, code: certificateCode() } });
        await tx.notification.create({ data: { userId: enrollment.student.userId, type: NotificationType.CERTIFICATE_ISSUED, payload: { certificateId: row.id } } });
        await audit(tx, actorId(ctx), "certificate.issue", "Certificate", row.id, { enrollmentId: id });
        return row;
      });
      return { certificate: { id: cert.id, enrollmentId: cert.enrollmentId, courseTitle, type: certificateTypeMap.toProto(cert.type), code: cert.code, issuedAt: cert.issuedAt } };
    }),
  };
}
