import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { formatShortDate, formatTnd, paymentMethodKey, paymentStatusKey } from "@/lib/student-format";
import { loadEnrollments, loadPayments } from "@/lib/student";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "payments", "/espace/paiements");
}

export default async function PaymentsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/paiements");
  const [t, payments, enrollments] = await Promise.all([getTranslations("Student"), loadPayments(locale), loadEnrollments(locale)]);
  const titles = new Map(enrollments.map((e) => [e.id, e.courseTitle]));
  return (
    <StudentShell title={t("nav.payments")} lead={t("payments.lead")}>
      <Notice>{t("payments.manualNotice")}</Notice>
      {payments.length === 0 ? (
        <EmptyState>{t("payments.empty")}</EmptyState>
      ) : (
        <ul className="space-y-4">
          {payments.map((p) => {
            const status = paymentStatusKey(p.status);
            const method = paymentMethodKey(p.method);
            return (
              <li key={p.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold"><span dir="ltr">{formatTnd(p.amount, locale)}</span></h2>
                    <p className="text-sm text-muted">{titles.get(p.enrollmentId) ?? ""}</p>
                    <p className="text-sm text-muted">
                      {method ? `${t(`paymentMethod.${method}`)} · ` : ""}
                      {p.paidAt ? t("payments.paidOn", { date: formatShortDate(p.paidAt, locale) }) : t("payments.recordedOn", { date: p.createdAt ? formatShortDate(p.createdAt, locale) : "—" })}
                      {p.reference ? <> · <span dir="ltr">{p.reference}</span></> : null}
                    </p>
                  </div>
                  {status && <Badge tone={status === "PAID" ? "good" : status === "UNPAID" ? "warn" : "neutral"}>{t(`paymentStatus.${status}`)}</Badge>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </StudentShell>
  );
}
