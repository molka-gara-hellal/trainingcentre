import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseRow } from "@/components/features/course-row";
import { buttonClasses } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getCourses, getFaqs, getSettings } from "@/lib/data";
import { absoluteUrl, buildMetadata, jsonLd } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Meta" });
  return buildMetadata({ locale, path: "/", title: t("title"), description: t("description") });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, meta, { data: list, failed }, faqs, settings] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Meta"),
    getCourses(locale, {}, 6),
    getFaqs(locale),
    getSettings(),
  ]);
  const stages = t.raw("stages") as { name: string; text: string }[];
  const certifSteps = t.raw("certifSteps") as { name: string; text: string }[];
  const audiences = t.raw("audiences") as { title: string; text: string }[];
  const projectName = settings["PROJECT_NAME"];

  const organization = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    // Le nom n'est publié que s'il a été confirmé dans l'administration.
    ...(projectName && !projectName.isTodo ? { name: projectName.value } : { name: meta("title") }),
    url: absoluteUrl(locale),
    address: { "@type": "PostalAddress", addressLocality: settings["CITY"]?.value ?? "Monastir", addressCountry: "TN" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(organization) }} />

      <section aria-labelledby="hero-title" className="border-b border-line bg-chalk">
        <Container className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-7">
            <h1 id="hero-title" className="display text-4xl sm:text-6xl">
              {t("title")}
            </h1>
            <p className="max-w-xl text-lg text-muted">{t("lead")}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/formations" className={buttonClasses("primary")}>
                {t("ctaCourses")}
              </Link>
              <Link href="/inscription" className={buttonClasses("secondary")}>
                {t("ctaRegister")}
              </Link>
            </div>
          </div>

          <div>
            <p className="mb-5 text-lg font-semibold">{t("routeTitle")}</p>
            <ol className="route space-y-5" aria-label={t("routeTitle")}>
              {stages.map((stage, index) => (
                <li
                  key={stage.name}
                  style={{ "--i": index, marginInlineStart: `${index * 1.1}rem` } as React.CSSProperties}
                  className="relative ps-11"
                >
                  <span
                    aria-hidden="true"
                    className="absolute start-0 top-0.5 flex size-[1.9rem] items-center justify-center rounded-full border-2 border-primary bg-surface text-sm font-semibold text-primary"
                  >
                    {index + 1}
                  </span>
                  <p className="font-semibold">{stage.name}</p>
                  <p className="text-sm text-muted">{stage.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <Section title={t("coursesTitle")} id="formations">
        {list.courses.length > 0 ? (
          <>
            <ul className="border-t border-line">
              {list.courses.map((course) => (
                <CourseRow key={course.id} course={course} locale={locale} />
              ))}
            </ul>
            <p className="mt-8">
              <Link href="/formations" className={buttonClasses("secondary")}>
                {t("allCourses")}
              </Link>
            </p>
          </>
        ) : (
          <div className="max-w-xl space-y-4">
            <p className="text-lg">{failed ? t("coursesUnavailable") : t("coursesEmpty")}</p>
            <Link href="/contact" className={buttonClasses("secondary")}>
              {t("askUs")}
            </Link>
          </div>
        )}
      </Section>

      <Section title={t("audiencesTitle")} tone="chalk">
        <div className="grid gap-10 md:grid-cols-3">
          {audiences.map((audience) => (
            <div key={audience.title} className="space-y-2 border-t-2 border-sun pt-4">
              <h3 className="text-lg font-semibold">{audience.title}</h3>
              <p className="text-muted">{audience.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10">
          <Link href="/pfe" className="font-medium text-primary underline underline-offset-4">
            {t("pfeLink")}
          </Link>
        </p>
      </Section>

      <Section title={t("certifTitle")} id="certification">
        <p className="-mt-4 mb-10 max-w-2xl text-muted">{t("certifLead")}</p>
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("certifTitle")}>
          {certifSteps.map((step, index) => (
            <li key={step.name} className="space-y-3 border-t-2 border-primary pt-4">
              <span
                aria-hidden="true"
                className="flex size-[1.9rem] items-center justify-center rounded-full border-2 border-primary bg-surface text-sm font-semibold text-primary"
              >
                {index + 1}
              </span>
              <p className="font-semibold">{step.name}</p>
              <p className="text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-muted">{t("certifNote")}</p>
      </Section>

      {faqs.length > 0 && (
        <Section title={t("faqTitle")}>
          <div className="max-w-3xl divide-y divide-line border-y border-line">
            {faqs.map((faq) => (
              <details key={faq.id} className="group py-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {faq.question}
                </summary>
                <p className="mt-3 text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
