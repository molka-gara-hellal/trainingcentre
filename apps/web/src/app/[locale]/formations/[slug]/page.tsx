import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SessionStatus } from "@center/proto-gen/course/v1/course";
import { slugField } from "@center/shared";
import { buttonClasses } from "@/components/ui/button";
import { Container, Notice, Todo } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getCourse, getSettings } from "@/lib/data";
import { formatDate, formatPrice, isSessionOpenForRequests, levelKey, sessionStatusKey } from "@/lib/format";
import { absoluteUrl, buildMetadata, jsonLd } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function load(locale: string, rawSlug: string) {
  const slug = slugField.safeParse(rawSlug);
  if (!slug.success) return null;
  return getCourse(locale, slug.data);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = await load(locale, slug);
  if (!found) return { title: "404", robots: { index: false } };
  const { course } = found;
  return buildMetadata({
    locale,
    path: `/formations/${course.slug}`,
    title: course.title,
    description: course.summary ?? course.description?.slice(0, 160) ?? course.title,
  });
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 ps-5 marker:text-primary">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default async function CourseDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = await load(locale, slug);
  if (!found) notFound();
  const { course, sessions } = found;

  const [t, lv, c, sessionT, settings] = await Promise.all([
    getTranslations("CourseDetail"),
    getTranslations("Levels"),
    getTranslations("Common"),
    getTranslations("SessionStatus"),
    getSettings(),
  ]);
  const todo = <Todo label={c("todo")} />;
  const level = levelKey(course.level);
  const price = formatPrice(course.priceTnd, locale);
  const projectName = settings["PROJECT_NAME"];

  const jsonCourse = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    ...(course.summary ? { description: course.summary } : {}),
    url: absoluteUrl(locale, `/formations/${course.slug}`),
    inLanguage: locale,
    // Le prestataire n'est déclaré que si le nom du centre est confirmé ; aucun prix ni durée inventés.
    ...(projectName && !projectName.isTodo ? { provider: { "@type": "Organization", name: projectName.value } } : {}),
  };

  const facts: [string, React.ReactNode][] = [
    [t("category"), course.category?.name ?? todo],
    [t("level"), level ? lv(level) : todo],
    [t("duration"), course.durationHours ? t("hours", { count: course.durationHours }) : todo],
    [t("sessionsCount"), course.sessionsCount ? String(course.sessionsCount) : todo],
    [t("price"), price ? <span dir="ltr">{price}</span> : todo],
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(jsonCourse) }} />
      <header className="border-b border-line bg-chalk">
        <Container className="py-12 sm:py-16">
          <nav aria-label={t("breadcrumb")} className="mb-5 text-sm">
            <Link href="/formations" className="text-primary underline underline-offset-4">
              {t("backToCourses")}
            </Link>
          </nav>
          <h1 className="display max-w-3xl text-4xl sm:text-5xl">{course.title}</h1>
          {course.summary && <p className="mt-4 max-w-2xl text-lg text-muted">{course.summary}</p>}
        </Container>
      </header>

      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-10">
          <section aria-labelledby="desc" className="space-y-3">
            <h2 id="desc" className="display text-2xl">{t("about")}</h2>
            {course.description ? <p className="max-w-prose whitespace-pre-line">{course.description}</p> : <p>{todo}</p>}
          </section>

          <section aria-labelledby="objectives" className="space-y-3">
            <h2 id="objectives" className="display text-2xl">{t("objectives")}</h2>
            {course.objectives.length > 0 ? <List items={course.objectives} /> : <p>{todo}</p>}
          </section>

          <section aria-labelledby="prereq" className="space-y-3">
            <h2 id="prereq" className="display text-2xl">{t("prerequisites")}</h2>
            {course.prerequisites.length > 0 ? <List items={course.prerequisites} /> : <p>{todo}</p>}
          </section>

          <section aria-labelledby="program" className="space-y-4">
            <h2 id="program" className="display text-2xl">{t("program")}</h2>
            {course.program.length > 0 ? (
              <ol className="space-y-5">
                {course.program.map((module, index) => (
                  <li key={module.title} className="border-s-2 border-primary ps-5">
                    <h3 className="font-semibold">
                      {index + 1}. {module.title}
                    </h3>
                    {module.topics.length > 0 && <List items={module.topics} />}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{todo}</p>
            )}
          </section>

          {course.skills.length > 0 && (
            <section aria-labelledby="skills" className="space-y-3">
              <h2 id="skills" className="display text-2xl">{t("skills")}</h2>
              <List items={course.skills} />
            </section>
          )}

          <section aria-labelledby="final" className="space-y-3">
            <h2 id="final" className="display text-2xl">{t("finalProject")}</h2>
            <p>{course.finalProject ?? todo}</p>
          </section>
        </div>

        <aside aria-label={t("practical")} className="space-y-8 lg:sticky lg:top-6 lg:self-start">
          <dl className="divide-y divide-line border-y border-line text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="sessions" className="space-y-4">
            <h2 id="sessions" className="text-lg font-semibold">{t("upcomingSessions")}</h2>
            {sessions.length > 0 ? (
              <ul className="space-y-4">
                {sessions.map((session) => {
                  const status = sessionStatusKey(session.status);
                  const open = isSessionOpenForRequests(session.status);
                  const start = formatDate(session.startDate, locale);
                  return (
                    <li key={session.id} className="space-y-1 border-s-2 border-sun ps-4 text-sm">
                      <p className="font-medium">{session.label ?? (start ?? c("todo"))}</p>
                      {start && session.label && <p className="text-muted">{start}</p>}
                      {session.scheduleNote && <p className="text-muted">{session.scheduleNote}</p>}
                      <p>
                        {status ? sessionT(status) : null}
                        {session.seatsLeft !== undefined && session.status !== SessionStatus.SESSION_STATUS_FULL
                          ? ` · ${t("seatsLeft", { count: session.seatsLeft })}`
                          : null}
                      </p>
                      {open && (
                        <Link
                          href={{ pathname: "/inscription", query: { formation: course.slug, session: session.id } }}
                          className="inline-block font-medium text-primary underline underline-offset-4"
                        >
                          {t("requestSession")}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Notice>{t("noSessions")}</Notice>
            )}
          </section>

          <Link
            href={{ pathname: "/inscription", query: { formation: course.slug } }}
            className={buttonClasses("primary", "w-full")}
          >
            {t("register")}
          </Link>
        </aside>
      </Container>
    </>
  );
}
