import { z } from "zod";
import type { Course, CourseSession } from "@center/proto-gen/course/v1/course";
import { courseStatusMap, levelMap, localeMap, sessionStatusMap } from "../../common/enums";
import { formatTnd, toIsoDate } from "../../common/format";
import type { Prisma } from "../../common/prisma";
import { EnrollmentStatus, type Locale } from "../../generated/prisma/enums";

/** Langue demandée + repli français. */
export const localesToLoad = (wanted: Locale): Locale[] => (wanted === "FR" ? ["FR"] : [wanted, "FR"]);

export function pickByLocale<T extends { locale: Locale }>(items: readonly T[], wanted: Locale): T | undefined {
  return items.find((item) => item.locale === wanted) ?? items.find((item) => item.locale === "FR");
}

export const courseInclude = (locales: Locale[]) =>
  ({
    category: { include: { translations: { where: { locale: { in: locales } } } } },
    translations: { where: { locale: { in: locales } } },
  }) satisfies Prisma.CourseInclude;

export type CourseRow = Prisma.CourseGetPayload<{ include: ReturnType<typeof courseInclude> }>;

export const sessionInclude = (locales: Locale[]) =>
  ({
    course: {
      select: {
        id: true,
        slug: true,
        translations: { where: { locale: { in: locales } }, select: { locale: true, title: true } },
      },
    },
    trainer: { select: { user: { select: { firstName: true, lastName: true } } } },
    room: { select: { name: true } },
    _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
  }) satisfies Prisma.CourseSessionInclude;

export type SessionRow = Prisma.CourseSessionGetPayload<{ include: ReturnType<typeof sessionInclude> }>;

const programSchema = z.array(
  z.object({ title: z.string(), topics: z.array(z.string()).default([]) }),
);

/** Le programme est stocké en JSON libre : on le relit défensivement (donnée invalide → programme vide). */
export function parseProgram(json: unknown) {
  const parsed = programSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

/** Renvoie null si la formation n'a aucune traduction exploitable (donnée incomplète : on ne l'affiche pas). */
export function mapCourse(row: CourseRow, wanted: Locale): Course | null {
  const translation = pickByLocale(row.translations, wanted);
  if (!translation) return null;
  const categoryTranslation = pickByLocale(row.category.translations, wanted);
  return {
    id: row.id,
    slug: row.slug,
    category: {
      id: row.category.id,
      slug: row.category.slug,
      name: categoryTranslation?.name ?? row.category.slug,
    },
    title: translation.title,
    summary: translation.summary ?? undefined,
    description: translation.description ?? undefined,
    level: row.level ? levelMap.toProto(row.level) : undefined,
    durationHours: row.durationHours ?? undefined,
    sessionsCount: row.sessionsCount ?? undefined,
    priceTnd: row.priceTnd ? formatTnd(row.priceTnd) : undefined,
    status: courseStatusMap.toProto(row.status),
    objectives: translation.objectives,
    prerequisites: translation.prerequisites,
    skills: translation.skills,
    finalProject: translation.finalProject ?? undefined,
    program: parseProgram(translation.program),
    locale: localeMap.toProto(translation.locale),
    updatedAt: row.updatedAt,
  };
}

export function mapSession(row: SessionRow, wanted: Locale): CourseSession {
  const courseTitle = pickByLocale(row.course.translations, wanted)?.title ?? row.course.slug;
  const seatsTaken = row._count.enrollments;
  const trainerUser = row.trainer?.user;
  return {
    id: row.id,
    courseId: row.course.id,
    courseSlug: row.course.slug,
    courseTitle,
    label: row.label ?? undefined,
    startDate: row.startDate ? toIsoDate(row.startDate) : undefined,
    endDate: row.endDate ? toIsoDate(row.endDate) : undefined,
    scheduleNote: row.scheduleNote ?? undefined,
    capacity: row.capacity ?? undefined,
    seatsTaken,
    seatsLeft: row.capacity === null ? undefined : Math.max(0, row.capacity - seatsTaken),
    status: sessionStatusMap.toProto(row.status),
    trainerName: trainerUser ? `${trainerUser.firstName} ${trainerUser.lastName}` : undefined,
    roomName: row.room?.name ?? undefined,
  };
}
