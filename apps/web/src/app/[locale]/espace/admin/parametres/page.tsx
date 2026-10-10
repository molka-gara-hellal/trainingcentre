import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SETTING_KEYS } from "@center/shared";
import { SettingStatus, type GetPublicSettingsResponse } from "@center/proto-gen/site/v1/site";
import { saveSettingAction } from "@/actions/admin";
import { AdminForm, AText, Hidden } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { adminLoad, clients, requireAdmin, rpc } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/espace/admin/parametres";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.settings" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const t = await getTranslations("Admin.settings");
  // Lecture directe (sans le cache de 60 s du site public) : on édite la valeur réelle.
  const res = await adminLoad(locale, PATH, (ctx) => rpc<GetPublicSettingsResponse>(ctx, (md, o, cb) => clients().site.getPublicSettings({}, md, o, cb)));
  const current = new Map(res.settings.map((s) => [s.key, s]));
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <Notice>{t("notice")}</Notice>
      <ul className="grid gap-4 lg:grid-cols-2">
        {SETTING_KEYS.map((key) => {
          const s = current.get(key);
          const isSet = s?.status === SettingStatus.SETTING_STATUS_SET;
          return (
            <li key={key}>
              <Card>
                <AdminForm action={saveSettingAction} submit={t("save")} successLabel={t("saved")}>
                  <Hidden name="key" value={key} />
                  <AText label={t(`key.${key}`)} hint={isSet ? undefined : t("currentTodo")} name="value" maxLength={500} defaultValue={isSet ? s?.value : ""} />
                </AdminForm>
              </Card>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">{t("emptyMeansTodo")}</p>
    </AdminShell>
  );
}
