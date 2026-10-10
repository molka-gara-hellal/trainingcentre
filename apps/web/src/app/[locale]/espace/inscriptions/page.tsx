import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { formatShortDate, registrationStatusKey } from "@/lib/student-format";
import { loadRegistrations } from "@/lib/student";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "registrations", "/espace/inscriptions");
}

export default async function RegistrationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/inscriptions");
  const [t, registrations] = await Promise.all([getTranslations("Student"), loadRegistrations(locale)]);
  return (
    <StudentShell title={t("nav.registrations")} lead={t("registrations.lead")}>
      {registrations.length === 0 ? (
        <EmptyState>
          {t("registrations.empty")}{" "}
          <Link href="/inscription" className="font-medium text-primary underline underline-offset-4">{t("registrations.apply")}</Link>
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {registrations.map((r) => {
            const status = registrationStatusKey(r.status);
            return (
              <li key={r.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{r.courseTitle}</h2>
                    <p className="text-sm text-muted">{t("registrations.sentOn", { date: r.createdAt ? formatShortDate(r.createdAt, locale) : "—" })}</p>
                  </div>
                  {status && <Badge tone={status === "ACCEPTED" ? "good" : status === "REJECTED" ? "bad" : "warn"}>{t(`registrationStatus.${status}`)}</Badge>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </StudentShell>
  );
}
