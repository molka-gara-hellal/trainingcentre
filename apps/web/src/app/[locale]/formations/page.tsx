import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseRow } from "@/components/features/course-row";
import { buttonClasses } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getCategories, getCourses } from "@/lib/data";
import { buildMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ categorie?: string; q?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Courses" });
  return buildMetadata({ locale, path: "/formations", title: t("title"), description: t("lead") });
}

export default async function CoursesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const category = typeof query.categorie === "string" ? query.categorie.slice(0, 100) : undefined;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : undefined;

  const t = await getTranslations("Courses");
  const [categories, { data, failed }] = await Promise.all([
    getCategories(locale),
    getCourses(locale, { category, query: q }),
  ]);
  const filtered = Boolean(category || q);

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Container className="py-10">
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <nav aria-label={t("categories")}>
            <ul className="flex flex-wrap gap-2">
              {[{ slug: undefined, name: t("all") }, ...categories.map((c) => ({ slug: c.slug, name: c.name }))].map((c) => {
                const active = c.slug === category || (!c.slug && !category);
                return (
                  <li key={c.slug ?? "all"}>
                    <Link
                      href={{ pathname: "/formations", query: { ...(c.slug ? { categorie: c.slug } : {}), ...(q ? { q } : {}) } }}
                      aria-current={active ? "true" : undefined}
                      className={`inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-medium ${
                        active ? "border-ink bg-ink text-white" : "border-ink/25 hover:bg-chalk"
                      }`}
                    >
                      {c.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <form action="" method="get" role="search" className="flex gap-2">
            {category && <input type="hidden" name="categorie" value={category} />}
            <label className="sr-only" htmlFor="course-search">
              {t("search")}
            </label>
            <input
              id="course-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder={t("search")}
              className="min-h-11 w-full min-w-52 rounded-control border border-ink/30 px-3.5"
            />
            <button type="submit" className={buttonClasses("secondary")}>
              {t("searchButton")}
            </button>
          </form>
        </div>

        {data.courses.length > 0 ? (
          <ul className="border-t border-line">
            {data.courses.map((course) => (
              <CourseRow key={course.id} course={course} locale={locale} />
            ))}
          </ul>
        ) : (
          <div className="max-w-xl space-y-4 py-8">
            <p className="text-lg" role="status">
              {failed ? t("unavailable") : filtered ? t("noResults") : t("empty")}
            </p>
            <div className="flex flex-wrap gap-3">
              {filtered && (
                <Link href="/formations" className={buttonClasses("secondary")}>
                  {t("resetFilters")}
                </Link>
              )}
              <Link href="/contact" className={buttonClasses("secondary")}>
                {t("askUs")}
              </Link>
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
