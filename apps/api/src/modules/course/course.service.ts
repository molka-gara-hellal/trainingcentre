import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { z } from "zod";
import { CourseServiceService } from "@center/proto-gen/course/v1/course";
import { optionalText, slugField } from "@center/shared";
import { localeMap } from "../../common/enums";
import { notFound } from "../../common/errors";
import { normalizePage, pageInfo, todayInTunis } from "../../common/format";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import { CourseStatus, SessionStatus, type Locale } from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";
import {
  courseInclude,
  localesToLoad,
  mapCourse,
  mapSession,
  pickByLocale,
  sessionInclude,
} from "./course.mapper";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 50;

/** Une session est "à venir" si elle est planifiée/ouverte/complète (pas en cours, terminée ou annulée). */
const UPCOMING_STATUSES = [SessionStatus.PLANNED, SessionStatus.OPEN, SessionStatus.FULL];

const listCoursesSchema = z.object({
  categorySlug: slugField.optional(),
  query: optionalText(100),
});
const getCourseSchema = z.object({ slug: slugField });
const upcomingSchema = z.object({ courseSlug: slugField.optional() });

export function buildCourseService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;

  /** Sessions à venir, dates "À définir" (null) incluses, triées par date de début (null en dernier). */
  async function findUpcomingSessions(locale: Locale, courseSlug: string | undefined, limit: number) {
    const rows = await prisma.courseSession.findMany({
      where: {
        status: { in: UPCOMING_STATUSES },
        course: { status: CourseStatus.PUBLISHED, deletedAt: null, ...(courseSlug && { slug: courseSlug }) },
        OR: [{ startDate: null }, { startDate: { gte: todayInTunis(now()) } }],
      },
      include: sessionInclude(localesToLoad(locale)),
      orderBy: [{ startDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: limit,
    });
    return rows.map((row) => mapSession(row, locale));
  }

  return {
    listCategories: unary(CourseServiceService.listCategories, async (req) => {
      const locale = localeMap.toDb(req.locale) ?? "FR";
      const rows = await prisma.courseCategory.findMany({
        orderBy: { sortOrder: "asc" },
        include: { translations: { where: { locale: { in: localesToLoad(locale) } } } },
      });
      return {
        categories: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: pickByLocale(row.translations, locale)?.name ?? row.slug,
        })),
      };
    }),

    listCourses: unary(CourseServiceService.listCourses, async (req) => {
      const locale = localeMap.toDb(req.locale) ?? "FR";
      const filters = parseInput(listCoursesSchema, {
        categorySlug: req.categorySlug,
        query: req.query,
      });
      const paging = normalizePage(req.page, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

      const where = {
        status: CourseStatus.PUBLISHED,
        deletedAt: null,
        AND: [
          { translations: { some: {} } },
          ...(filters.categorySlug ? [{ category: { slug: filters.categorySlug } }] : []),
          ...(filters.query
            ? [{ translations: { some: { title: { contains: filters.query, mode: "insensitive" as const } } } }]
            : []),
        ],
      };

      const [total, rows] = await prisma.$transaction([
        prisma.course.count({ where }),
        prisma.course.findMany({
          where,
          include: courseInclude(localesToLoad(locale)),
          orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
          skip: paging.skip,
          take: paging.pageSize,
        }),
      ]);

      return {
        courses: rows.flatMap((row) => mapCourse(row, locale) ?? []),
        pageInfo: pageInfo(paging, total),
      };
    }),

    getCourse: unary(CourseServiceService.getCourse, async (req) => {
      const locale = localeMap.toDb(req.locale) ?? "FR";
      const { slug } = parseInput(getCourseSchema, { slug: req.slug });

      const row = await prisma.course.findFirst({
        where: { slug, status: CourseStatus.PUBLISHED, deletedAt: null },
        include: courseInclude(localesToLoad(locale)),
      });
      const course = row ? mapCourse(row, locale) : null;
      if (!course) throw notFound("course_not_found");

      return { course, upcomingSessions: await findUpcomingSessions(locale, slug, MAX_SESSION_LIMIT) };
    }),

    listUpcomingSessions: unary(CourseServiceService.listUpcomingSessions, async (req) => {
      const locale = localeMap.toDb(req.locale) ?? "FR";
      const { courseSlug } = parseInput(upcomingSchema, { courseSlug: req.courseSlug });
      const limit = Math.min(req.limit > 0 ? req.limit : DEFAULT_SESSION_LIMIT, MAX_SESSION_LIMIT);
      return { sessions: await findUpcomingSessions(locale, courseSlug, limit) };
    }),

    listFaqs: unary(CourseServiceService.listFaqs, async (req) => {
      const locale = localeMap.toDb(req.locale) ?? "FR";
      const load = (wanted: Locale) =>
        prisma.faq.findMany({
          where: { locale: wanted, published: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });
      // Repli sur le français tant que la langue demandée n'a aucune question publiée.
      let rows = await load(locale);
      if (rows.length === 0 && locale !== "FR") rows = await load("FR");
      return { faqs: rows.map((row) => ({ id: row.id, question: row.question, answer: row.answer })) };
    }),
  };
}
