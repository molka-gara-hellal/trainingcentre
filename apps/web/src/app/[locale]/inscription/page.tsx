import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegistrationForm } from "@/components/features/registration-form";
import { buttonClasses } from "@/components/ui/button";
import { Container, Notice, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getCourses, getUpcomingSessions } from "@/lib/data";
import { formatDate, isSessionOpenForRequests } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ formation?: string; session?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Registration" });
  return buildMetadata({ locale, path: "/inscription", title: t("title"), description: t("lead") });
}

export default async function RegistrationPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("Registration");
  const c = await getTranslations("Common");

  const [{ data: list, failed }, { data: sessions }] = await Promise.all([getCourses(locale), getUpcomingSessions(locale)]);

  const courses = list.courses.map((course) => ({ slug: course.slug, title: course.title }));
  const sessionOptions = sessions
    .filter((s) => isSessionOpenForRequests(s.status))
    .map((s) => ({
      id: s.id,
      courseSlug: s.courseSlug,
      label: [s.label, formatDate(s.startDate, locale)].filter(Boolean).join(" · ") || c("todo"),
    }));

  const defaultCourse = courses.some((x) => x.slug === query.formation) ? query.formation : undefined;

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Container className="max-w-3xl py-10">
        {courses.length > 0 ? (
          <RegistrationForm courses={courses} sessions={sessionOptions} defaultCourse={defaultCourse} defaultSession={query.session} />
        ) : (
          <div className="space-y-4">
            <Notice tone="warning">{failed ? t("unavailable") : t("noCourses")}</Notice>
            <Link href="/contact" className={buttonClasses("secondary")}>
              {t("contactUs")}
            </Link>
          </div>
        )}
      </Container>
    </>
  );
}
