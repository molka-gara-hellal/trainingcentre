import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Notice, PageHeader, Todo } from "@/components/ui/page";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal" });
  return buildMetadata({ locale, path: "/mentions-legales", title: t("title"), description: t("lead") });
}

export default async function LegalNoticePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, c] = await Promise.all([getTranslations("Legal"), getTranslations("Common")]);
  const rows = t.raw("rows") as string[];
  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Container className="max-w-3xl space-y-8 py-12">
        <Notice tone="warning">{t("draftNotice")}</Notice>
        <dl className="divide-y divide-line border-y border-line">
          {rows.map((label) => (
            <div key={label} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
              <dt className="font-medium">{label}</dt>
              <dd><Todo label={c("todo")} /></dd>
            </div>
          ))}
        </dl>
        <section className="space-y-2">
          <h2 className="display text-2xl">{t("ipTitle")}</h2>
          <p className="text-muted">{t("ipText")}</p>
        </section>
      </Container>
    </>
  );
}
