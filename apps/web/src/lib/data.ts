import "server-only";
import { Locale as ProtoLocale } from "@center/proto-gen/common/v1/common";
import {
  GetCourseRequest,
  ListCategoriesRequest,
  ListCoursesRequest,
  ListFaqsRequest,
  ListUpcomingSessionsRequest,
  type Course,
  type CourseCategory,
  type CourseSession,
  type Faq,
  type GetCourseResponse,
  type ListCategoriesResponse,
  type ListCoursesResponse,
  type ListFaqsResponse,
  type ListUpcomingSessionsResponse,
} from "@center/proto-gen/course/v1/course";
import { GetPublicSettingsRequest, SettingStatus, type GetPublicSettingsResponse } from "@center/proto-gen/site/v1/site";
import { SITE_DEFAULTS, isTodo, type Locale, type SiteSettingKey } from "@center/shared";
import { ApiError } from "./grpc/errors";
import { clients, rpc } from "./grpc/client";
import { callContext } from "./auth/session";

export const protoLocale = (locale: Locale | string): ProtoLocale =>
  locale === "ar" ? ProtoLocale.LOCALE_AR : locale === "en" ? ProtoLocale.LOCALE_EN : ProtoLocale.LOCALE_FR;

/** Petit cache mémoire (par processus) pour les données quasi statiques lues à chaque page. */
const ttl = new Map<string, { value: unknown; expires: number }>();
async function memo<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = ttl.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  ttl.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/** Exécute un chargement ; si l'API est indisponible, renvoie `fallback` et signale l'échec. */
export async function safely<T>(load: () => Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await load(), failed: false };
  } catch (err) {
    if (err instanceof ApiError) return { data: fallback, failed: true };
    throw err;
  }
}

// --- Paramètres du site ---------------------------------------------------------------------------
export type PublicSettings = Record<SiteSettingKey | string, { value: string; isTodo: boolean }>;

export async function getSettings(): Promise<PublicSettings> {
  const { data } = await safely(
    () =>
      memo("settings", 60_000, async () => {
        const res = await rpc<GetPublicSettingsResponse>(await callContext(), (md, opts, cb) =>
          clients().site.getPublicSettings(GetPublicSettingsRequest.fromPartial({}), md, opts, cb),
        );
        return res.settings;
      }),
    [],
  );
  const result: PublicSettings = {};
  for (const [key, value] of Object.entries(SITE_DEFAULTS)) result[key] = { value, isTodo: isTodo(value) };
  for (const s of data) result[s.key] = { value: s.value, isTodo: s.status !== SettingStatus.SETTING_STATUS_SET || isTodo(s.value) };
  return result;
}

// --- Catalogue ----------------------------------------------------------------------------------
export async function getCategories(locale: string): Promise<CourseCategory[]> {
  const { data } = await safely(
    () =>
      memo(`categories:${locale}`, 60_000, async () => {
        const res = await rpc<ListCategoriesResponse>(await callContext(), (md, opts, cb) =>
          clients().course.listCategories(ListCategoriesRequest.fromPartial({ locale: protoLocale(locale) }), md, opts, cb),
        );
        return res.categories;
      }),
    [],
  );
  return data;
}

export type CourseFilters = { category?: string; query?: string; page?: number };

export async function getCourses(locale: string, filters: CourseFilters = {}, pageSize = 50) {
  return safely(
    async () => {
      const res = await rpc<ListCoursesResponse>(await callContext(), (md, opts, cb) =>
        clients().course.listCourses(
          ListCoursesRequest.fromPartial({
            locale: protoLocale(locale),
            categorySlug: filters.category || undefined,
            query: filters.query || undefined,
            page: { page: filters.page ?? 1, pageSize },
          }),
          md,
          opts,
          cb,
        ),
      );
      return { courses: res.courses, pageInfo: res.pageInfo };
    },
    { courses: [] as Course[], pageInfo: undefined },
  );
}

export async function getCourse(
  locale: string,
  slug: string,
): Promise<{ course: Course; sessions: CourseSession[] } | null> {
  try {
    const res = await rpc<GetCourseResponse>(await callContext(), (md, opts, cb) =>
      clients().course.getCourse(GetCourseRequest.fromPartial({ slug, locale: protoLocale(locale) }), md, opts, cb),
    );
    return res.course ? { course: res.course, sessions: res.upcomingSessions } : null;
  } catch (err) {
    if (err instanceof ApiError && err.code === "course_not_found") return null;
    throw err;
  }
}

export async function getUpcomingSessions(locale: string, limit = 50) {
  return safely(async () => {
    const res = await rpc<ListUpcomingSessionsResponse>(await callContext(), (md, opts, cb) =>
      clients().course.listUpcomingSessions(
        ListUpcomingSessionsRequest.fromPartial({ locale: protoLocale(locale), limit }),
        md,
        opts,
        cb,
      ),
    );
    return res.sessions;
  }, [] as CourseSession[]);
}

export async function getFaqs(locale: string): Promise<Faq[]> {
  const { data } = await safely(
    () =>
      memo(`faqs:${locale}`, 60_000, async () => {
        const res = await rpc<ListFaqsResponse>(await callContext(), (md, opts, cb) =>
          clients().course.listFaqs(ListFaqsRequest.fromPartial({ locale: protoLocale(locale) }), md, opts, cb),
        );
        return res.faqs;
      }),
    [],
  );
  return data;
}
