import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { CourseForm } from "@/components/admin/course-form";
import { requireAdmin } from "@/lib/admin";
import { getCategories } from "@/lib/data";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };
const PATH = "/espace/admin/formations/nouvelle";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.course" });
  return buildMetadata({ locale, path: PATH, title: t("newTitle"), description: t("newTitle"), noindex: true });
}

export default async function NewCoursePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const [t, categories] = await Promise.all([getTranslations("Admin.course"), getCategories(locale)]);
  return (
    <AdminShell title={t("newTitle")} lead={t("newLead")} back={{ href: "/espace/admin/formations", label: t("back") }}>
      <CourseForm categories={categories} />
    </AdminShell>
  );
}
