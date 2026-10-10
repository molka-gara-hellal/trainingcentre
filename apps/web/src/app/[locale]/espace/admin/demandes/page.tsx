import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegistrationStatus, type ListRegistrationsResponse } from "@center/proto-gen/registration/v1/registration";
import { AdminShell, DataTable, Pager, Td } from "@/components/admin/admin-shell";
import { Badge, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { adminLoad, clients, loc, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { queryParam } from "@/lib/admin-ui";
import { buildMetadata } from "@/lib/seo";
import { formatShortDate, registrationStatusKey } from "@/lib/student-format";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/demandes";
const STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "WAITLIST"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.requests" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminRequestsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const page = pageParam(sp["page"]);
  const query = queryParam(sp["q"]);
  const status = queryParam(sp["status"]);
  const [t, ts, tr] = await Promise.all([getTranslations("Admin.requests"), getTranslations("Admin"), getTranslations("Student.registrationStatus")]);
  const res = await adminLoad(locale, PATH, (ctx) =>
    rpc<ListRegistrationsResponse>(ctx, (md, o, cb) =>
      clients().registration.listRegistrations(
        {
          status: (STATUSES as readonly string[]).includes(status) ? (`REGISTRATION_STATUS_${status}` as RegistrationStatus) : undefined,
          query: query || undefined,
          page: { page, pageSize: 20 },
          locale: loc(locale),
        },
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
            {STATUSES.map((s) => <option key={s} value={s}>{tr(s)}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
      </form>
      {res.registrations.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTable caption={t("title")} head={[t("col.candidate"), t("col.course"), t("col.date"), t("col.status"), t("col.actions")]}>
          {res.registrations.map((r) => {
            const key = registrationStatusKey(r.status);
            return (
              <tr key={r.id}>
                <Td><span className="font-medium">{r.firstName} {r.lastName}</span><span className="block text-muted" dir="ltr">{r.email}</span></Td>
                <Td>{r.courseTitle}</Td>
                <Td>{r.createdAt ? formatShortDate(r.createdAt, locale) : ""}</Td>
                <Td>{key && <Badge tone={key === "ACCEPTED" ? "good" : key === "REJECTED" ? "bad" : "warn"}>{tr(key)}</Badge>}</Td>
                <Td><Link href={`${PATH}/${r.id}`} className={buttonClasses("secondary", "min-h-11 px-3 py-1.5 text-sm")}>{t("open")}</Link></Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <Pager page={res.pageInfo?.page ?? 1} totalPages={res.pageInfo?.totalPages ?? 1} path={PATH} params={{ q: query, status }} />
    </AdminShell>
  );
}
