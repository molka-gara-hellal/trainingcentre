import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/features/inbox-forms";
import { Container, PageHeader, Todo } from "@/components/ui/page";
import { getSettings } from "@/lib/data";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return buildMetadata({ locale, path: "/contact", title: t("title"), description: t("lead") });
}

const SAFE_URL = /^https?:\/\//i;

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, f, c, settings] = await Promise.all([
    getTranslations("Contact"),
    getTranslations("Footer"),
    getTranslations("Common"),
    getSettings(),
  ]);
  const known = (key: string) => {
    const s = settings[key];
    return s && !s.isTodo ? s.value : undefined;
  };
  const rows: [string, string | undefined, "text" | "tel" | "mail" | "link"][] = [
    [f("address"), known("ADDRESS"), "text"],
    [f("hours"), known("OPENING_HOURS"), "text"],
    [f("phone"), known("PHONE"), "tel"],
    [f("email"), known("EMAIL"), "mail"],
    [t("map"), known("GOOGLE_MAPS_URL"), "link"],
  ];

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} />
      <Container className="grid gap-12 py-12 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="write" className="space-y-6">
          <h2 id="write" className="display text-2xl">{t("formTitle")}</h2>
          <ContactForm />
        </section>
        <aside aria-labelledby="info" className="space-y-4">
          <h2 id="info" className="display text-2xl">{t("infoTitle")}</h2>
          <p className="text-muted">{f("location")}</p>
          <dl className="divide-y divide-line border-y border-line text-sm">
            {rows.map(([label, value, kind]) => (
              <div key={label} className="flex justify-between gap-4 py-3">
                <dt className="text-muted">{label}</dt>
                <dd className="text-end font-medium" dir={kind === "tel" ? "ltr" : undefined}>
                  {!value ? (
                    <Todo label={c("todo")} />
                  ) : kind === "tel" ? (
                    <a href={`tel:${value.replace(/[^+\d]/g, "")}`} className="underline underline-offset-4">{value}</a>
                  ) : kind === "mail" ? (
                    <a href={`mailto:${value}`} className="underline underline-offset-4">{value}</a>
                  ) : kind === "link" && SAFE_URL.test(value) ? (
                    <a href={value} rel="noopener noreferrer" target="_blank" className="underline underline-offset-4">{t("openMap")}</a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </Container>
    </>
  );
}
