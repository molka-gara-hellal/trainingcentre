import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaymentStatus, type ListPaymentsResponse } from "@center/proto-gen/payment/v1/payment";
import { updatePaymentAction } from "@/actions/admin";
import { AdminForm, ASelect, AText, FormGrid, Hidden } from "@/components/admin/admin-form";
import { AdminShell, DataTable, Pager, Td } from "@/components/admin/admin-shell";
import { Badge, EmptyState } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/page";
import { adminLoad, clients, loc, pageParam, requireAdmin, rpc } from "@/lib/admin";
import { queryParam } from "@/lib/admin-ui";
import { buildMetadata } from "@/lib/seo";
import { formatShortDate, formatTnd, paymentStatusKey } from "@/lib/student-format";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = "/espace/admin/paiements";
const STATUSES = ["UNPAID", "PARTIAL", "PAID", "REFUNDED"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.payments" });
  return buildMetadata({ locale, path: PATH, title: t("title"), description: t("title"), noindex: true });
}

export default async function AdminPaymentsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin(locale, PATH);
  const sp = await searchParams;
  const page = pageParam(sp["page"]);
  const status = queryParam(sp["status"]);
  const [t, ts, tp, tpm] = await Promise.all([getTranslations("Admin.payments"), getTranslations("Admin"), getTranslations("Student.paymentStatus"), getTranslations("Student.paymentMethod")]);
  const res = await adminLoad(locale, PATH, (ctx) =>
    rpc<ListPaymentsResponse>(ctx, (md, o, cb) =>
      clients().payment.listPayments(
        { status: (STATUSES as readonly string[]).includes(status) ? (`PAYMENT_STATUS_${status}` as PaymentStatus) : undefined, page: { page, pageSize: 20 }, locale: loc(locale) },
        md, o, cb,
      ),
    ),
  );
  return (
    <AdminShell title={t("title")} lead={t("lead")}>
      <Notice>{t("howTo")}</Notice>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <label className="space-y-1 text-sm font-medium">{ts("filters.status")}
          <select name="status" defaultValue={status} className="block min-h-11 rounded-control border border-ink/30 bg-surface px-3 py-2 text-base">
            <option value="">{ts("filters.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{tp(s)}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{ts("filters.apply")}</button>
      </form>
      {res.payments.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <DataTable caption={t("title")} head={[t("col.student"), t("col.course"), t("col.amount"), t("col.status"), t("col.date"), t("col.actions")]}>
          {res.payments.map((row) => {
            const p = row.payment!;
            const key = paymentStatusKey(p.status);
            return (
              <tr key={p.id}>
                <Td><span className="font-medium">{row.firstName} {row.lastName}</span><span className="block text-muted" dir="ltr">{row.email}</span></Td>
                <Td>{row.courseTitle}</Td>
                <Td><span dir="ltr">{formatTnd(p.amount, locale)}</span>{p.reference && <span className="block text-muted" dir="ltr">{p.reference}</span>}</Td>
                <Td>{key && <Badge tone={key === "PAID" ? "good" : key === "REFUNDED" ? "neutral" : "warn"}>{tp(key)}</Badge>}</Td>
                <Td>{formatShortDate(p.paidAt ?? p.createdAt!, locale)}</Td>
                <Td>
                  <details>
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary">{t("edit")}</summary>
                    <AdminForm action={updatePaymentAction} submit={t("save")} successLabel={t("saved")} className="mt-2 min-w-64 space-y-3">
                      <Hidden name="id" value={p.id} />
                      <FormGrid>
                        <ASelect label={t("col.status")} name="status" required defaultValue={key}>
                          {STATUSES.map((s) => <option key={s} value={s}>{tp(s)}</option>)}
                        </ASelect>
                        <ASelect label={t("method")} name="method" defaultValue="">
                          <option value="">—</option>
                          {(["CASH", "BANK_TRANSFER", "OTHER"] as const).map((m) => <option key={m} value={m}>{tpm(m)}</option>)}
                        </ASelect>
                      </FormGrid>
                      <AText label={t("note")} name="note" maxLength={500} />
                    </AdminForm>
                  </details>
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
      <Pager page={res.pageInfo?.page ?? 1} totalPages={res.pageInfo?.totalPages ?? 1} path={PATH} params={{ status }} />
    </AdminShell>
  );
}
