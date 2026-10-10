import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { GetAdminCourseResponse } from "@center/proto-gen/course/v1/course";
import { courseStatusAction, deleteCourseAction } from "@/actions/admin";
import { InlineAction } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { CourseForm } from "@/components/admin/course-form";
import { Badge } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { adminLoad, clients, loc, requireAdmin, rpc } from "@/lib/admin";
import { courseStatusKey, courseStatusTone } from "@/lib/admin-ui";
import { getCategories } from "@/lib/data";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.course" });
  return buildMetadata({ locale, title: t("editTitle"), description: t("editTitle"), noindex: true });
}

export default async function EditCoursePage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const path = `/espace/admin/formations/${id}`;
  await requireAdmin(locale, path);
  const [t, categories, res] = await Promise.all([
    getTranslations("Admin.course"),
    getCategories(locale),
    adminLoad(locale, path, (ctx) => rpc<GetAdminCourseResponse>(ctx, (md, o, cb) => clients().course.getAdminCourse({ id }, md, o, cb))),
  ]);
  const course = res.course!;
  const key = courseStatusKey(course.status);
  const title = (course.translations.find((x) => x.locale === loc(locale)) ?? course.translations[0])?.title ?? course.slug;
  return (
    <AdminShell title={title} lead={t("editLead")} back={{ href: "/espace/admin/formations", label: t("back") }}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={courseStatusTone(key)}>{t(`status.${key}`)}</Badge>
        {key !== "PUBLISHED" ? (
          <InlineAction action={courseStatusAction} fields={{ id, status: "PUBLISHED" }} label={t("publish")} variant="primary" />
        ) : (
          <InlineAction action={courseStatusAction} fields={{ id, status: "DISABLED" }} label={t("unpublish")} confirm={t("confirmUnpublish")} />
        )}
        {key === "PUBLISHED" && <InlineAction action={courseStatusAction} fields={{ id, status: "DRAFT" }} label={t("toDraft")} />}
      </div>
      {key === "DRAFT" && <Notice>{t("draftNotice")}</Notice>}
      <CourseForm course={course} categories={categories} />
      <section aria-labelledby="del" className="space-y-3 border-t border-line pt-6">
        <h2 id="del" className="text-lg font-semibold">{t("dangerTitle")}</h2>
        <p className="text-sm text-muted">{t("deleteHint")}</p>
        <InlineAction action={deleteCourseAction} fields={{ id }} label={t("delete")} confirm={t("confirmDelete")} />
      </section>
    </AdminShell>
  );
}
