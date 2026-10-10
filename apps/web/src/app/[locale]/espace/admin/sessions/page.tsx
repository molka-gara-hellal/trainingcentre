import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListAdminSessionsResponse, SessionStatus } from "@center/proto-gen/course/v1/course";
import { AdminShell, DataTable, Pager, Td } from "@/components/admin/admin-shell";
import { Badge, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { adminLoad, clients, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { SESSION_STATUSES, queryParam, sessionTone } from "@/lib/admin-ui";
import { sessionStatusKey } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/sessions";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.session" });
  return buildMetadata({ locale, path: PATH, title: t("listTitle"), description: t("listTitle"), noindex: true });
}

export default async function AdminSessionsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const page = pageParam(sp["page"]);
  const status = queryParam(sp["status"]);
  const [t, ts, tss] = await Promise.all([getTranslations("Admin.session"), getTranslations("Admin"), getTranslations("SessionStatus")]);
  const res = await adminLoad(locale, PATH, (ctx) =>
    rpc<ListAdminSessionsResponse>(ctx, (md, o, cb) =>
      clients().course.listAdminSessions(
        { status: (SESSION_STATUSES as readonly string[]).includes(status) ? (`SESSION_STATUS_${status}` as SessionStatus) : undefined, page: { page, pageSize: 20 } },
        md, o, cb,
      ),
    ),
  );
  return (
    <AdminShell title={t("listTitle")} lead={t("listLead")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <form method="get" className="flex flex-wrap items-end gap-3" role="search">
          <label className="space-y-1 text-sm font-medium">{ts("filters.status")}
            <select name="status" defaultValue={status} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base">
              <option value="">{ts("filters.all")}</option>
              {SESSION_STATUSES.map((s) => <option key={s} value={s}>{tss(s)}</option>)}
            </select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
        </form>
        <Link href={`${PATH}/nouvelle`} className={buttonClasses("primary", "min-h-11 px-4 py-2 text-sm")}>{t("new")}</Link>
      </div>
      {res.sessions.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTable caption={t("listTitle")} head={[t("col.course"), t("col.dates"), t("col.seats"), t("col.status"), t("col.actions")]}>
          {res.sessions.map((s) => {
            const key = sessionStatusKey(s.status);
            return (
              <tr key={s.id}>
                <Td><span className="font-medium">{s.courseTitle}</span>{s.label && <span className="block text-muted">{s.label}</span>}</Td>
                <Td><span dir="ltr">{s.startDate ?? "—"} → {s.endDate ?? "—"}</span></Td>
                <Td><span dir="ltr">{s.seatsTaken}/{s.capacity ?? "—"}</span></Td>
                <Td>{key && <Badge tone={sessionTone(s.status)}>{tss(key)}</Badge>}</Td>
                <Td><Link href={`${PATH}/${s.id}`} className={buttonClasses("secondary", "min-h-11 px-3 py-1.5 text-sm")}>{t("manage")}</Link></Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <Pager page={res.pageInfo?.page ?? 1} totalPages={res.pageInfo?.totalPages ?? 1} path={PATH} params={{ status }} />
    </AdminShell>
  );
}
