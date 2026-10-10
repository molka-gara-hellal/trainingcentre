import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PfeForm } from "@/components/features/inbox-forms";
import { Container, Notice, PageHeader, Section, Todo } from "@/components/ui/page";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pfe" });
  return buildMetadata({ locale, path: "/pfe", title: t("title"), description: t("lead") });
}

export default async function PfePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, c] = await Promise.all([getTranslations("Pfe"), getTranslations("Common")]);
  const topics = t.raw("topics") as { title: string; text: string }[];

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Section title={t("helpTitle")}>
        <div className="grid gap-10 md:grid-cols-3">
          {topics.map((topic) => (
            <div key={topic.title} className="space-y-2 border-t-2 border-sun pt-4">
              <h3 className="text-lg font-semibold">{topic.title}</h3>
              <p className="text-muted">{topic.text}</p>
            </div>
          ))}
        </div>
        <dl className="mt-10 max-w-xl divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">{t("terms")}</dt>
            <dd><Todo label={c("todo")} /></dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">{t("pricing")}</dt>
            <dd><Todo label={c("todo")} /></dd>
          </div>
        </dl>
      </Section>
      <Section title={t("formTitle")} tone="chalk">
        <Container className="max-w-2xl px-0 sm:px-0 lg:px-0">
          <p className="mb-6 text-muted">{t("formLead")}</p>
          <PfeForm />
        </Container>
      </Section>
      <Container className="pb-4">
        <Notice>{t("note")}</Notice>
      </Container>
    </>
  );
}
