import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { AdminCourse, AdminFaq, CourseTranslationInput } from "@center/proto-gen/course/v1/course";
import { CourseServiceService } from "@center/proto-gen/course/v1/course";
import {
  courseInputSchema,
  faqInputSchema,
  scheduleEventInputSchema,
  sessionInputSchema,
} from "@center/shared";
import { z } from "zod";
import { actorId, callerLocale } from "../../common/caller";
import { audit } from "../../common/audit";
import { courseStatusMap, levelMap, localeMap, sessionStatusMap } from "../../common/enums";
import { alreadyExists, failedPrecondition, notFound, validationError } from "../../common/errors";
import { formatTnd, normalizePage, pageInfo } from "../../common/format";
import { Prisma, type PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import { CourseStatus, EnrollmentStatus, SessionStatus, type Locale } from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";
import { localesToLoad, mapSession, parseProgram, pickByLocale, sessionInclude } from "./course.mapper";

const uuidSchema = z.object({ id: z.uuid("invalid_value") });
const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

type CourseWithTranslations = Prisma.CourseGetPayload<{ include: { translations: true } }>;

function toAdminCourse(row: CourseWithTranslations): AdminCourse {
  return {
    id: row.id,
    slug: row.slug,
    categoryId: row.categoryId,
    level: row.level ? levelMap.toProto(row.level) : undefined,
    durationHours: row.durationHours ?? undefined,
    sessionsCount: row.sessionsCount ?? undefined,
    priceTnd: row.priceTnd ? formatTnd(row.priceTnd) : undefined,
    status: courseStatusMap.toProto(row.status),
    translations: row.translations.map(
      (t): CourseTranslationInput => ({
        locale: localeMap.toProto(t.locale),
        title: t.title,
        summary: t.summary ?? undefined,
        description: t.description ?? undefined,
        objectives: t.objectives,
        prerequisites: t.prerequisites,
        skills: t.skills,
        finalProject: t.finalProject ?? undefined,
        program: parseProgram(t.program),
      }),
    ),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Les champs optionnels vides ("" venant d'un formulaire) sont traités comme absents ("À définir"). */
const blank = (value: string | undefined): string | undefined => (value && value.trim() !== "" ? value : undefined);

function courseInputFromRequest(req: {
  slug: string;
  categoryId: string;
  level?: Parameters<typeof levelMap.toDb>[0];
  durationHours?: number;
  sessionsCount?: number;
  priceTnd?: string;
  translations: CourseTranslationInput[];
}) {
  return {
    slug: req.slug,
    categoryId: req.categoryId,
    level: levelMap.toDb(req.level),
    durationHours: req.durationHours,
    sessionsCount: req.sessionsCount,
    priceTnd: blank(req.priceTnd),
    translations: req.translations.map((t) => ({
      locale: localeMap.toDb(t.locale),
      title: t.title,
      summary: t.summary,
      description: t.description,
      objectives: t.objectives,
      prerequisites: t.prerequisites,
      skills: t.skills,
      finalProject: t.finalProject,
      program: t.program.map((m) => ({ title: m.title, topics: m.topics })),
    })),
  };
}


export function buildCourseAdminHandlers(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
}): UntypedServiceImplementation {
  const { prisma, unary } = deps;
  const S = CourseServiceService;

  const slugTaken = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

  async function loadCourse(id: string) {
    const course = await prisma.course.findFirst({ where: { id, deletedAt: null }, include: { translations: true } });
    if (!course) throw notFound("course_not_found");
    return course;
  }

  const adminSession = async (id: string, locale: Locale) => {
    const row = await prisma.courseSession.findUniqueOrThrow({ where: { id }, include: sessionInclude(localesToLoad(locale)) });
    return { ...mapSession(row, locale), trainerId: row.trainerId ?? undefined, roomId: row.roomId ?? undefined };
  };

  async function checkSessionRefs(input: { courseId: string; trainerId?: string; roomId?: string }) {
    const course = await prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null }, select: { id: true } });
    if (!course) throw validationError([{ field: "courseId", code: "invalid_value" }]);
    if (input.trainerId && !(await prisma.trainer.findUnique({ where: { id: input.trainerId }, select: { id: true } }))) {
      throw validationError([{ field: "trainerId", code: "invalid_value" }]);
    }
    if (input.roomId && !(await prisma.room.findUnique({ where: { id: input.roomId }, select: { id: true } }))) {
      throw validationError([{ field: "roomId", code: "invalid_value" }]);
    }
  }

  const sessionInputFrom = (s: {
    courseId: string; trainerId?: string; roomId?: string; label?: string; startDate?: string; endDate?: string;
    scheduleNote?: string; capacity?: number;
  } | undefined) => ({
    courseId: s?.courseId ?? "",
    trainerId: blank(s?.trainerId),
    roomId: blank(s?.roomId),
    label: s?.label,
    startDate: blank(s?.startDate),
    endDate: blank(s?.endDate),
    scheduleNote: s?.scheduleNote,
    capacity: s?.capacity,
  });

  const asDate = (iso: string | undefined) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

  return {
    listAdminCourses: unary(S.listAdminCourses, async (req) => {
      const params = normalizePage(req.page, DEFAULT_PAGE, MAX_PAGE);
      const status = courseStatusMap.toDb(req.status);
      const query = blank(req.query)?.slice(0, 100);
      const where: Prisma.CourseWhereInput = {
        deletedAt: null,
        ...(status && { status }),
        ...(query && {
          OR: [
            { slug: { contains: query, mode: "insensitive" } },
            { translations: { some: { title: { contains: query, mode: "insensitive" } } } },
          ],
        }),
      };
      const [rows, total] = await Promise.all([
        prisma.course.findMany({ where, include: { translations: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], skip: params.skip, take: params.pageSize }),
        prisma.course.count({ where }),
      ]);
      return { courses: rows.map(toAdminCourse), pageInfo: pageInfo(params, total) };
    }),

    getAdminCourse: unary(S.getAdminCourse, async (req) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      return { course: toAdminCourse(await loadCourse(id)) };
    }),

    createCourse: unary(S.createCourse, async (req, ctx) => {
      const input = parseInput(courseInputSchema, courseInputFromRequest(req));
      if (!(await prisma.courseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
        throw validationError([{ field: "categoryId", code: "invalid_value" }]);
      }
      try {
        const created = await prisma.$transaction(async (tx) => {
          const course = await tx.course.create({
            data: {
              slug: input.slug,
              categoryId: input.categoryId,
              level: input.level ?? null,
              durationHours: input.durationHours ?? null,
              sessionsCount: input.sessionsCount ?? null,
              priceTnd: input.priceTnd ?? null,
              status: CourseStatus.DRAFT,
              translations: {
                create: input.translations.map((t) => ({
                  locale: t.locale,
                  title: t.title,
                  summary: t.summary ?? null,
                  description: t.description ?? null,
                  objectives: t.objectives,
                  prerequisites: t.prerequisites,
                  skills: t.skills,
                  finalProject: t.finalProject ?? null,
                  program: t.program,
                })),
              },
            },
            include: { translations: true },
          });
          await audit(tx, actorId(ctx), "course.create", "Course", course.id, { slug: course.slug });
          return course;
        });
        return { course: toAdminCourse(created) };
      } catch (err) {
        if (slugTaken(err)) throw alreadyExists("slug_already_used");
        throw err;
      }
    }),

    // Remplacement complet : les traductions absentes de la requête sont supprimées (le français reste obligatoire).
    updateCourse: unary(S.updateCourse, async (req, ctx) => {
      const input = parseInput(courseInputSchema, courseInputFromRequest(req));
      const { id } = parseInput(uuidSchema, { id: req.id });
      await loadCourse(id);
      if (!(await prisma.courseCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) {
        throw validationError([{ field: "categoryId", code: "invalid_value" }]);
      }
      try {
        const updated = await prisma.$transaction(async (tx) => {
          await tx.course.update({
            where: { id },
            data: {
              slug: input.slug,
              categoryId: input.categoryId,
              level: input.level ?? null,
              durationHours: input.durationHours ?? null,
              sessionsCount: input.sessionsCount ?? null,
              priceTnd: input.priceTnd ?? null,
            },
          });
          await tx.courseTranslation.deleteMany({ where: { courseId: id, locale: { notIn: input.translations.map((t) => t.locale) } } });
          for (const t of input.translations) {
            const data = {
              title: t.title,
              summary: t.summary ?? null,
              description: t.description ?? null,
              objectives: t.objectives,
              prerequisites: t.prerequisites,
              skills: t.skills,
              finalProject: t.finalProject ?? null,
              program: t.program,
            };
            await tx.courseTranslation.upsert({
              where: { courseId_locale: { courseId: id, locale: t.locale } },
              create: { courseId: id, locale: t.locale, ...data },
              update: data,
            });
          }
          await audit(tx, actorId(ctx), "course.update", "Course", id, { slug: input.slug });
          return tx.course.findUniqueOrThrow({ where: { id }, include: { translations: true } });
        });
        return { course: toAdminCourse(updated) };
      } catch (err) {
        if (slugTaken(err)) throw alreadyExists("slug_already_used");
        throw err;
      }
    }),

    deleteCourse: unary(S.deleteCourse, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      await loadCourse(id);
      const active = await prisma.enrollment.count({
        where: { status: EnrollmentStatus.ACTIVE, session: { courseId: id, status: { not: SessionStatus.CANCELLED } } },
      });
      if (active > 0) throw failedPrecondition("course_has_enrollments");
      await prisma.$transaction(async (tx) => {
        await tx.course.update({ where: { id }, data: { deletedAt: new Date(), status: CourseStatus.DISABLED } });
        await audit(tx, actorId(ctx), "course.delete", "Course", id);
      });
      return {};
    }),

    setCourseStatus: unary(S.setCourseStatus, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const status = courseStatusMap.toDb(req.status);
      if (!status) throw validationError([{ field: "status", code: "invalid_value" }]);
      const course = await loadCourse(id);
      // On ne publie pas une formation sans contenu français : la page publique serait vide.
      if (status === CourseStatus.PUBLISHED && !course.translations.some((t) => t.locale === "FR")) {
        throw failedPrecondition("french_required");
      }
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.course.update({ where: { id }, data: { status }, include: { translations: true } });
        await audit(tx, actorId(ctx), "course.status", "Course", id, { status });
        return row;
      });
      return { course: toAdminCourse(updated) };
    }),

    listAdminSessions: unary(S.listAdminSessions, async (req, ctx) => {
      const locale = await callerLocale(prisma, ctx);
      const params = normalizePage(req.page, DEFAULT_PAGE, MAX_PAGE);
      const status = sessionStatusMap.toDb(req.status);
      const courseId = blank(req.courseId);
      if (courseId && !z.uuid().safeParse(courseId).success) throw validationError([{ field: "courseId", code: "invalid_value" }]);
      const where: Prisma.CourseSessionWhereInput = { ...(status && { status }), ...(courseId && { courseId }), course: { deletedAt: null } };
      const [rows, total] = await Promise.all([
        prisma.courseSession.findMany({
          where,
          include: sessionInclude(localesToLoad(locale)),
          orderBy: [{ startDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
          skip: params.skip,
          take: params.pageSize,
        }),
        prisma.courseSession.count({ where }),
      ]);
      return {
        sessions: rows.map((row) => ({ ...mapSession(row, locale), trainerId: row.trainerId ?? undefined, roomId: row.roomId ?? undefined })),
        pageInfo: pageInfo(params, total),
      };
    }),

    getAdminSession: unary(S.getAdminSession, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const locale = await callerLocale(prisma, ctx);
      if (!(await prisma.courseSession.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      return { session: await adminSession(id, locale) };
    }),

    createSession: unary(S.createSession, async (req, ctx) => {
      const input = parseInput(sessionInputSchema, sessionInputFrom(req.session));
      await checkSessionRefs(input);
      const locale = await callerLocale(prisma, ctx);
      const id = await prisma.$transaction(async (tx) => {
        const row = await tx.courseSession.create({
          data: {
            courseId: input.courseId,
            trainerId: input.trainerId ?? null,
            roomId: input.roomId ?? null,
            label: input.label ?? null,
            startDate: asDate(input.startDate),
            endDate: asDate(input.endDate),
            scheduleNote: input.scheduleNote ?? null,
            capacity: input.capacity ?? null,
            status: SessionStatus.PLANNED,
          },
        });
        await audit(tx, actorId(ctx), "session.create", "CourseSession", row.id, { courseId: input.courseId });
        return row.id;
      });
      return { session: await adminSession(id, locale) };
    }),

    updateSession: unary(S.updateSession, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const input = parseInput(sessionInputSchema, sessionInputFrom(req.session));
      const existing = await prisma.courseSession.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw notFound();
      await checkSessionRefs(input);
      if (input.capacity !== undefined) {
        const active = await prisma.enrollment.count({ where: { sessionId: id, status: EnrollmentStatus.ACTIVE } });
        if (input.capacity < active) throw failedPrecondition("capacity_below_enrollments");
      }
      const locale = await callerLocale(prisma, ctx);
      await prisma.$transaction(async (tx) => {
        await tx.courseSession.update({
          where: { id },
          data: {
            courseId: input.courseId,
            trainerId: input.trainerId ?? null,
            roomId: input.roomId ?? null,
            label: input.label ?? null,
            startDate: asDate(input.startDate),
            endDate: asDate(input.endDate),
            scheduleNote: input.scheduleNote ?? null,
            capacity: input.capacity ?? null,
          },
        });
        await audit(tx, actorId(ctx), "session.update", "CourseSession", id);
      });
      return { session: await adminSession(id, locale) };
    }),

    setSessionStatus: unary(S.setSessionStatus, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const status = sessionStatusMap.toDb(req.status);
      if (!status) throw validationError([{ field: "status", code: "invalid_value" }]);
      if (!(await prisma.courseSession.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      const locale = await callerLocale(prisma, ctx);
      await prisma.$transaction(async (tx) => {
        await tx.courseSession.update({ where: { id }, data: { status } });
        await audit(tx, actorId(ctx), "session.status", "CourseSession", id, { status });
      });
      return { session: await adminSession(id, locale) };
    }),

    listSessionEvents: unary(S.listSessionEvents, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.sessionId });
      const locale = await callerLocale(prisma, ctx, req.locale);
      const session = await prisma.courseSession.findUnique({
        where: { id },
        include: { course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } },
      });
      if (!session) throw notFound();
      const title = pickByLocale(session.course.translations, locale)?.title ?? session.course.slug;
      const rows = await prisma.scheduleEvent.findMany({ where: { sessionId: id }, orderBy: { startsAt: "asc" }, take: 500, include: { room: { select: { name: true } } } });
      return {
        events: rows.map((row) => ({
          id: row.id, sessionId: row.sessionId, courseTitle: title, startsAt: row.startsAt, endsAt: row.endsAt, roomName: row.room?.name ?? undefined,
        })),
      };
    }),

    addScheduleEvent: unary(S.addScheduleEvent, async (req, ctx) => {
      const input = parseInput(scheduleEventInputSchema, { sessionId: req.sessionId, startsAt: req.startsAt, endsAt: req.endsAt });
      const locale = await callerLocale(prisma, ctx);
      const session = await prisma.courseSession.findUnique({
        where: { id: input.sessionId },
        include: { course: { select: { slug: true, translations: { where: { locale: { in: localesToLoad(locale) } }, select: { locale: true, title: true } } } } },
      });
      if (!session) throw notFound();
      if (session.status === SessionStatus.CANCELLED) throw failedPrecondition("session_closed");
      const overlap = await prisma.scheduleEvent.count({
        where: { sessionId: input.sessionId, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
      });
      if (overlap > 0) throw failedPrecondition("event_overlap");
      const event = await prisma.$transaction(async (tx) => {
        const row = await tx.scheduleEvent.create({
          data: { sessionId: input.sessionId, roomId: session.roomId, startsAt: input.startsAt, endsAt: input.endsAt },
          include: { room: { select: { name: true } } },
        });
        await audit(tx, actorId(ctx), "event.add", "ScheduleEvent", row.id, { sessionId: input.sessionId });
        return row;
      });
      return {
        event: {
          id: event.id, sessionId: event.sessionId,
          courseTitle: pickByLocale(session.course.translations, locale)?.title ?? session.course.slug,
          startsAt: event.startsAt, endsAt: event.endsAt, roomName: event.room?.name ?? undefined,
        },
      };
    }),

    deleteScheduleEvent: unary(S.deleteScheduleEvent, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      if (!(await prisma.scheduleEvent.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      // Un cours dont l'appel a été fait ne peut plus être supprimé : l'historique de présence serait perdu.
      if ((await prisma.attendance.count({ where: { scheduleEventId: id } })) > 0) throw failedPrecondition("event_has_attendance");
      await prisma.$transaction(async (tx) => {
        await tx.scheduleEvent.delete({ where: { id } });
        await audit(tx, actorId(ctx), "event.delete", "ScheduleEvent", id);
      });
      return {};
    }),

    listAdminFaqs: unary(S.listAdminFaqs, async () => {
      const rows = await prisma.faq.findMany({ orderBy: [{ locale: "asc" }, { sortOrder: "asc" }] });
      return { faqs: rows.map((row): AdminFaq => ({ id: row.id, locale: localeMap.toProto(row.locale), question: row.question, answer: row.answer, sortOrder: row.sortOrder, published: row.published })) };
    }),

    upsertFaq: unary(S.upsertFaq, async (req, ctx) => {
      const input = parseInput(faqInputSchema, {
        id: blank(req.id), locale: localeMap.toDb(req.locale), question: req.question, answer: req.answer, sortOrder: req.sortOrder, published: req.published,
      });
      const data = { locale: input.locale, question: input.question, answer: input.answer, sortOrder: input.sortOrder, published: input.published };
      const faq = await prisma.$transaction(async (tx) => {
        let row;
        if (input.id) {
          if (!(await tx.faq.findUnique({ where: { id: input.id }, select: { id: true } }))) throw notFound();
          row = await tx.faq.update({ where: { id: input.id }, data });
        } else {
          row = await tx.faq.create({ data });
        }
        await audit(tx, actorId(ctx), input.id ? "faq.update" : "faq.create", "Faq", row.id);
        return row;
      });
      return { faq: { id: faq.id, question: faq.question, answer: faq.answer } };
    }),

    deleteFaq: unary(S.deleteFaq, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      if (!(await prisma.faq.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      await prisma.$transaction(async (tx) => {
        await tx.faq.delete({ where: { id } });
        await audit(tx, actorId(ctx), "faq.delete", "Faq", id);
      });
      return {};
    }),
  };
}
