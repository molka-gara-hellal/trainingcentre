import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CourseStatus, type ListAdminCoursesResponse } from "@center/proto-gen/course/v1/course";
import { courseStatusAction } from "@/actions/admin";
import { InlineAction } from "@/components/admin/admin-form";
import { AdminShell, DataTable, Pager, Td } from "@/components/admin/admin-shell";
import { Badge, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { adminLoad, clients, loc, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { courseStatusKey, courseStatusTone, queryParam } from "@/lib/admin-ui";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/formations";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.course" });
  return buildMetadata({ locale, path: PATH, title: t("listTitle"), description: t("listTitle"), noindex: true });
}

export default async function AdminCoursesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const page = pageParam(sp["page"]);
  const query = queryParam(sp["q"]);
  const status = queryParam(sp["status"]);
  const [t, ts] = await Promise.all([getTranslations("Admin.course"), getTranslations("Admin")]);
  const res = await adminLoad(locale, PATH, (ctx) =>
    rpc<ListAdminCoursesResponse>(ctx, (md, o, cb) =>
      clients().course.listAdminCourses(
        {
          status: (["DRAFT", "PUBLISHED", "DISABLED"].includes(status) ? (`COURSE_STATUS_${status}` as CourseStatus) : undefined),
          query: query || undefined,
          page: { page, pageSize: 20 },
        },
        md, o, cb,
      ),
    ),
  );
  const titleOf = (c: ListAdminCoursesResponse["courses"][number]) =>
    (c.translations.find((x) => x.locale === loc(locale)) ?? c.translations[0])?.title ?? c.slug;
  return (
    <AdminShell title={t("listTitle")} lead={t("listLead")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-3" role="search">
          <label className="space-y-1 text-sm font-medium">{ts("filters.search")}
            <input name="q" defaultValue={query} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base" />
          </label>
          <label className="space-y-1 text-sm font-medium">{ts("filters.status")}
            <select name="status" defaultValue={status} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base">
              <option value="">{ts("filters.all")}</option>
              {(["DRAFT", "PUBLISHED", "DISABLED"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
        </form>
        <Link href={`${PATH}/nouvelle`} className={buttonClasses("primary", "min-h-11 px-4 py-2 text-sm")}>{t("new")}</Link>
      </div>
      {res.courses.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTable caption={t("listTitle")} head={[t("col.title"), t("col.slug"), t("col.status"), t("col.actions")]}>
          {res.courses.map((c) => {
            const key = courseStatusKey(c.status);
            return (
              <tr key={c.id}>
                <Td className="font-medium">{titleOf(c)}</Td>
                <Td><span dir="ltr">{c.slug}</span></Td>
                <Td><Badge tone={courseStatusTone(key)}>{t(`status.${key}`)}</Badge></Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    <Link href={`${PATH}/${c.id}`} className={buttonClasses("secondary", "min-h-11 px-3 py-1.5 text-sm")}>{t("edit")}</Link>
                    {key !== "PUBLISHED" && <InlineAction action={courseStatusAction} fields={{ id: c.id, status: "PUBLISHED" }} label={t("publish")} variant="primary" />}
                    {key === "PUBLISHED" && <InlineAction action={courseStatusAction} fields={{ id: c.id, status: "DISABLED" }} label={t("unpublish")} confirm={t("confirmUnpublish")} />}
                  </div>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <Pager page={res.pageInfo?.page ?? 1} totalPages={res.pageInfo?.totalPages ?? 1} path={PATH} params={{ q: query, status }} />
    </AdminShell>
  );
}
