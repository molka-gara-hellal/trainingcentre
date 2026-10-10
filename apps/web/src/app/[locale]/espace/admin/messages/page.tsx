import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { InboxStatus, ListContactMessagesResponse, ListPfeRequestsResponse } from "@center/proto-gen/registration/v1/registration";
import { inboxStatusAction } from "@/actions/admin";
import { InlineAction } from "@/components/admin/admin-form";
import { AdminShell, Pager } from "@/components/admin/admin-shell";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { adminLoad, clients, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { inboxKey, inboxTone, queryParam } from "@/lib/admin-ui";
import { buildMetadata } from "@/lib/seo";
import { formatDateTime } from "@/lib/student-format";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/messages";
const STATUSES = ["NEW", "IN_REVIEW", "CLOSED"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.inbox" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminInboxPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const kind = queryParam(sp["kind"]) === "pfe" ? "pfe" : "contact";
  const page = pageParam(sp["page"]);
  const status = queryParam(sp["status"]);
  const [t, ts] = await Promise.all([getTranslations("Admin.inbox"), getTranslations("Admin")]);
  const filter = (STATUSES as readonly string[]).includes(status) ? (`INBOX_STATUS_${status}` as InboxStatus) : undefined;
  const pageReq = { page, pageSize: 20 };
  const items = await adminLoad(locale, PATH, async (ctx) => {
    if (kind === "pfe") {
      const res = await rpc<ListPfeRequestsResponse>(ctx, (md, o, cb) => clients().registration.listPfeRequests({ status: filter, page: pageReq }, md, o, cb));
      return { pageInfo: res.pageInfo, rows: res.requests.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, title: r.topic, body: r.message, status: r.status, createdAt: r.createdAt })) };
    }
    const res = await rpc<ListContactMessagesResponse>(ctx, (md, o, cb) => clients().registration.listContactMessages({ status: filter, page: pageReq }, md, o, cb));
    return { pageInfo: res.pageInfo, rows: res.messages.map((m) => ({ id: m.id, name: m.name, email: m.email, phone: undefined as string | undefined, title: m.subject, body: m.message, status: m.status, createdAt: m.createdAt })) };
  });
  const tab = (k: "contact" | "pfe") => (
    <a href={`?kind=${k}`} aria-current={kind === k ? "page" : undefined} className={buttonClasses(kind === k ? "primary" : "secondary", "min-h-11 px-4 py-2 text-sm")}>{t(`tab.${k}`)}</a>
  );
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav aria-label={t("tabs")} className="flex gap-2">{tab("contact")}{tab("pfe")}</nav>
        <form method="get" className="flex items-end gap-3" role="search">
          <input type="hidden" name="kind" value={kind} />
          <label className="space-y-1 text-sm font-medium">{ts("filters.status")}
            <select name="status" defaultValue={status} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base">
              <option value="">{ts("filters.all")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
        </form>
      </div>
      {items.rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <ul className="space-y-4">
          {items.rows.map((m) => {
            const k = inboxKey(m.status);
            return (
              <li key={m.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold" dir="auto">{m.title}</h2>
                      <p className="text-sm text-muted"><span dir="auto">{m.name}</span> · <a href={`mailto:${m.email}`} dir="ltr" className="underline underline-offset-4">{m.email}</a>{m.phone ? <> · <span dir="ltr">{m.phone}</span></> : null}</p>
                      <p className="text-sm text-muted">{m.createdAt ? formatDateTime(m.createdAt, locale) : ""}</p>
                    </div>
                    <Badge tone={inboxTone(k)}>{t(`status.${k}`)}</Badge>
                  </div>
                  {m.body && <p className="whitespace-pre-line text-sm" dir="auto">{m.body}</p>}
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.filter((x) => x !== k).map((x) => (
                      <InlineAction key={x} action={inboxStatusAction} fields={{ id: m.id, kind, status: x }} label={t(`mark.${x}`)} />
                    ))}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={items.pageInfo?.page ?? 1} totalPages={items.pageInfo?.totalPages ?? 1} path={PATH} params={{ kind, status }} />
    </AdminShell>
  );
}
