import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListStudentsResponse } from "@center/proto-gen/admin/v1/admin";
import { UserStatus } from "@center/proto-gen/user/v1/user";
import { studentStatusAction } from "@/actions/admin";
import { InlineAction } from "@/components/admin/admin-form";
import { AdminShell, DataTable, Pager, Td } from "@/components/admin/admin-shell";
import { Badge, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { adminLoad, clients, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { queryParam, userStatusKey, userTone } from "@/lib/admin-ui";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/etudiants";
const STATUSES = ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.students" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminStudentsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const page = pageParam(sp["page"]);
  const query = queryParam(sp["q"]);
  const status = queryParam(sp["status"]);
  const [t, ts] = await Promise.all([getTranslations("Admin.students"), getTranslations("Admin")]);
  const res = await adminLoad(locale, PATH, (ctx) =>
    rpc<ListStudentsResponse>(ctx, (md, o, cb) =>
      clients().admin.listStudents(
        { query: query || undefined, status: (STATUSES as readonly string[]).includes(status) ? (`USER_STATUS_${status}` as UserStatus) : undefined, page: { page, pageSize: 20 } },
        md, o, cb,
      ),
    ),
  );
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="space-y-1 text-sm font-medium">{ts("filters.search")}
          <input name="q" defaultValue={query} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base" />
        </label>
        <label className="space-y-1 text-sm font-medium">{ts("filters.status")}
          <select name="status" defaultValue={status} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base">
            <option value="">{ts("filters.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
      </form>
      {res.students.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTable caption={t("title")} head={[t("col.name"), t("col.email"), t("col.enrollments"), t("col.status"), t("col.actions")]}>
          {res.students.map((s) => {
            const key = userStatusKey(s.status);
            return (
              <tr key={s.id}>
                <Td className="font-medium">{s.firstName} {s.lastName}</Td>
                <Td><span dir="ltr">{s.email}</span></Td>
                <Td><span dir="ltr">{s.enrollmentsCount}</span></Td>
                <Td><Badge tone={userTone(key)}>{t(`status.${key}`)}</Badge></Td>
                <Td>
                  {key === "ACTIVE" && <InlineAction action={studentStatusAction} fields={{ userId: s.userId, status: "SUSPENDED" }} label={t("suspend")} confirm={t("confirmSuspend")} />}
                  {key === "SUSPENDED" && <InlineAction action={studentStatusAction} fields={{ userId: s.userId, status: "ACTIVE" }} label={t("reactivate")} variant="primary" />}
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
