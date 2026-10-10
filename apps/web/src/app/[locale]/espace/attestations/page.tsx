import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Card, EmptyState } from "@/components/space/student-shell";
import { formatShortDate } from "@/lib/student-format";
import { loadCertificates } from "@/lib/student";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "certificates", "/espace/attestations");
}

export default async function CertificatesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/attestations");
  const [t, certificates] = await Promise.all([getTranslations("Student"), loadCertificates(locale)]);
  return (
    <StudentShell title={t("nav.certificates")} lead={t("certificates.lead")}>
      {certificates.length === 0 ? (
        <EmptyState>{t("certificates.empty")}</EmptyState>
      ) : (
        <ul className="space-y-4">
          {certificates.map((c) => (
            <li key={c.id}>
              <Card className="space-y-1">
                <h2 className="text-lg font-semibold">{c.courseTitle}</h2>
                <p className="text-sm text-muted">{t("certificates.type")}</p>
                <p className="text-sm">{t("certificates.issuedOn", { date: c.issuedAt ? formatShortDate(c.issuedAt, locale) : "—" })}</p>
                <p className="text-sm">{t("certificates.code")} : <span dir="ltr" className="font-mono font-semibold">{c.code}</span></p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </StudentShell>
  );
}
