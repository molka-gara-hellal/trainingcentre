import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListTrainersResponse } from "@center/proto-gen/admin/v1/admin";
import type { ListAdminCoursesResponse } from "@center/proto-gen/course/v1/course";
import { AdminShell } from "@/components/admin/admin-shell";
import { SessionForm } from "@/components/admin/session-form";
import { adminLoad, clients, requireAdmin, rpc } from "@/lib/admin";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/espace/admin/sessions/nouvelle";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.session" });
  return buildMetadata({ locale, path: PATH, title: t("newTitle"), description: t("newTitle"), noindex: true });
}

export default async function NewSessionPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const t = await getTranslations("Admin.session");
  const [courses, trainers] = await adminLoad(locale, PATH, (ctx) =>
    Promise.all([
      rpc<ListAdminCoursesResponse>(ctx, (md, o, cb) => clients().course.listAdminCourses({ page: { page: 1, pageSize: 50 } }, md, o, cb)),
      rpc<ListTrainersResponse>(ctx, (md, o, cb) => clients().admin.listTrainers({}, md, o, cb)),
    ]),
  );
  return (
    <AdminShell title={t("newTitle")} lead={t("newLead")} back={{ href: "/espace/admin/sessions", label: t("back") }}>
      <SessionForm courses={courses.courses} trainers={trainers.trainers} locale={locale} />
    </AdminShell>
  );
}
