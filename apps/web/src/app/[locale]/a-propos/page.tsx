import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, Section, Todo } from "@/components/ui/page";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return buildMetadata({ locale, path: "/a-propos", title: t("title"), description: t("lead") });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, c] = await Promise.all([getTranslations("About"), getTranslations("Common")]);
  const principles = t.raw("principles") as { title: string; text: string }[];

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Section title={t("approachTitle")}>
        <div className="grid gap-10 md:grid-cols-2">
          {principles.map((p) => (
            <div key={p.title} className="space-y-2 border-s-2 border-primary ps-5">
              <h3 className="text-lg font-semibold">{p.title}</h3>
              <p className="max-w-prose text-muted">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t("teamTitle")} tone="chalk">
        <p className="mb-6 max-w-2xl text-muted">{t("teamLead")}</p>
        <ul className="grid gap-6 sm:grid-cols-2">
          <li className="border-t-2 border-sun pt-3">
            <p className="text-lg font-semibold">Molka Gara-Hellal</p>
            <p className="text-sm text-muted">{t("founder")}</p>
          </li>
          <li className="border-t-2 border-sun pt-3">
            <p className="text-lg font-semibold">Nawress Rjeb</p>
            <p className="text-sm text-muted">{t("founder")}</p>
          </li>
        </ul>
        <dl className="mt-8 max-w-xl divide-y divide-line border-y border-line text-sm">
          {(["trainers", "certifications", "partners"] as const).map((key) => (
            <div key={key} className="flex justify-between gap-4 py-3">
              <dt className="text-muted">{t(key)}</dt>
              <dd><Todo label={c("todo")} /></dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-lg font-medium">{t("cta")}</p>
          <Link href="/formations" className={buttonClasses("primary")}>
            {t("ctaCourses")}
          </Link>
        </div>
      </Section>
    </>
  );
}
