import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Locale as ProtoLocale } from "@center/proto-gen/common/v1/common";
import type { ListAdminFaqsResponse } from "@center/proto-gen/course/v1/course";
import { deleteFaqAction, saveFaqAction } from "@/actions/admin";
import { AArea, AdminForm, ASelect, AText, FormGrid, Hidden, InlineAction } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { adminLoad, clients, requireAdmin, rpc } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/espace/admin/faq";
const CODE: Record<string, "FR" | "AR" | "EN"> = { [ProtoLocale.LOCALE_FR]: "FR", [ProtoLocale.LOCALE_AR]: "AR", [ProtoLocale.LOCALE_EN]: "EN" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.faq" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

function FaqFields({ t, faq }: { t: Awaited<ReturnType<typeof getTranslations<"Admin.faq">>>; faq?: ListAdminFaqsResponse["faqs"][number] }) {
  return (
    <>
      {faq && <Hidden name="id" value={faq.id} />}
      <FormGrid>
        <ASelect label={t("language")} name="locale" required defaultValue={faq ? CODE[faq.locale] : "FR"}>
          <option value="FR">Français</option><option value="AR">العربية</option><option value="EN">English</option>
        </ASelect>
        <AText label={t("order")} hint={t("orderHint")} name="sortOrder" inputMode="numeric" dir="ltr" defaultValue={String(faq?.sortOrder ?? 0)} />
      </FormGrid>
      <AText label={t("question")} name="question" required maxLength={300} defaultValue={faq?.question} />
      <AArea label={t("answer")} name="answer" required rows={4} maxLength={3000} defaultValue={faq?.answer} />
      <ASelect label={t("visibility")} name="published" required defaultValue={faq?.published ? "yes" : "no"}>
        <option value="yes">{t("published")}</option><option value="no">{t("hidden")}</option>
      </ASelect>
    </>
  );
}

export default async function AdminFaqPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const t = await getTranslations("Admin.faq");
  const res = await adminLoad(locale, PATH, (ctx) => rpc<ListAdminFaqsResponse>(ctx, (md, o, cb) => clients().course.listAdminFaqs({}, md, o, cb)));
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <section aria-labelledby="faq-new" className="space-y-3">
        <h2 id="faq-new" className="text-xl font-semibold">{t("newTitle")}</h2>
        <AdminForm action={saveFaqAction} submit={t("add")} successLabel={t("saved")}>
          <FaqFields t={t} />
        </AdminForm>
      </section>
      <section aria-labelledby="faq-list" className="space-y-3">
        <h2 id="faq-list" className="text-xl font-semibold">{t("listTitle")}</h2>
        {res.faqs.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {res.faqs.map((f) => (
              <li key={f.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold" dir="auto">{f.question}</p>
                    <span className="flex gap-2"><Badge>{CODE[f.locale]}</Badge><Badge tone={f.published ? "good" : "warn"}>{f.published ? t("published") : t("hidden")}</Badge></span>
                  </div>
                  <details className="rounded-control border border-line px-4 py-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t("edit")}</summary>
                    <div className="space-y-4 py-4">
                      <AdminForm action={saveFaqAction} submit={t("save")} successLabel={t("saved")}>
                        <FaqFields t={t} faq={f} />
                      </AdminForm>
                      <InlineAction action={deleteFaqAction} fields={{ id: f.id }} label={t("delete")} confirm={t("confirmDelete")} />
                    </div>
                  </details>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
