import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Notice, PageHeader, Todo } from "@/components/ui/page";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return buildMetadata({ locale, path: "/confidentialite", title: t("title"), description: t("lead") });
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, c] = await Promise.all([getTranslations("Privacy"), getTranslations("Common")]);
  const sections = t.raw("sections") as { title: string; text: string; todo?: boolean }[];
  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Container className="max-w-3xl space-y-10 py-12">
        <Notice tone="warning">{t("draftNotice")}</Notice>
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="display text-2xl">{section.title}</h2>
            <p className="whitespace-pre-line text-muted">{section.text}</p>
            {section.todo && <p><Todo label={c("todo")} /></p>}
          </section>
        ))}
      </Container>
    </>
  );
}
