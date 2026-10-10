import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListTrainersResponse } from "@center/proto-gen/admin/v1/admin";
import { createTrainerAction, updateTrainerAction } from "@/actions/admin";
import { AArea, AdminForm, AText, FormGrid, Hidden } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card, EmptyState } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { adminLoad, clients, requireAdmin, rpc } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/espace/admin/formateurs";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.trainers" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminTrainersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const t = await getTranslations("Admin.trainers");
  const res = await adminLoad(locale, PATH, (ctx) => rpc<ListTrainersResponse>(ctx, (md, o, cb) => clients().admin.listTrainers({}, md, o, cb)));
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <section aria-labelledby="tr-new" className="space-y-3">
        <h2 id="tr-new" className="text-xl font-semibold">{t("newTitle")}</h2>
        <Notice>{t("activationNotice")}</Notice>
        <AdminForm action={createTrainerAction} submit={t("create")} successLabel={t("created")}>
          <FormGrid>
            <AText label={t("firstName")} name="firstName" required maxLength={80} />
            <AText label={t("lastName")} name="lastName" required maxLength={80} />
            <AText label={t("email")} name="email" type="email" required dir="ltr" maxLength={254} />
            <AText label={t("specialties")} hint={t("specialtiesHint")} name="specialties" />
          </FormGrid>
          <AArea label={t("bio")} hint={t("bioHint")} name="bio" rows={3} maxLength={2000} />
        </AdminForm>
      </section>
      <section aria-labelledby="tr-list" className="space-y-3">
        <h2 id="tr-list" className="text-xl font-semibold">{t("listTitle")}</h2>
        {res.trainers.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <ul className="space-y-4">
            {res.trainers.map((x) => (
              <li key={x.id}>
                <Card className="space-y-3">
                  <div>
                    <p className="font-semibold">{x.firstName} {x.lastName}</p>
                    <p className="text-sm text-muted" dir="ltr">{x.email}</p>
                    {x.specialties.length > 0 && <p className="text-sm">{x.specialties.join(", ")}</p>}
                  </div>
                  <details className="rounded-control border border-line px-4 py-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t("edit")}</summary>
                    <AdminForm action={updateTrainerAction} submit={t("save")} successLabel={t("saved")} className="space-y-4 py-4">
                      <Hidden name="id" value={x.id} />
                      <FormGrid>
                        <AText label={t("firstName")} name="firstName" required maxLength={80} defaultValue={x.firstName} />
                        <AText label={t("lastName")} name="lastName" required maxLength={80} defaultValue={x.lastName} />
                      </FormGrid>
                      <AText label={t("specialties")} hint={t("specialtiesHint")} name="specialties" defaultValue={x.specialties.join(", ")} />
                      <AArea label={t("bio")} hint={t("bioHint")} name="bio" rows={3} maxLength={2000} defaultValue={x.bio} />
                    </AdminForm>
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
