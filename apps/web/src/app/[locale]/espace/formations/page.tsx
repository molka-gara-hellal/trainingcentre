import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Badge, Card, EmptyState, ProgressBar } from "@/components/space/student-shell";
import { enrollmentStatusKey } from "@/lib/student-format";
import { loadEnrollments } from "@/lib/student";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "courses", "/espace/formations");
}

export default async function MyCoursesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/formations");
  const [t, enrollments] = await Promise.all([getTranslations("Student"), loadEnrollments(locale)]);
  return (
    <StudentShell title={t("nav.courses")} lead={t("courses.lead")}>
      {enrollments.length === 0 ? (
        <EmptyState>
          {t("courses.empty")}{" "}
          <Link href="/formations" className="font-medium text-primary underline underline-offset-4">{t("courses.browse")}</Link>
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {enrollments.map((e) => {
            const status = enrollmentStatusKey(e.status);
            return (
              <li key={e.id}>
                <Card className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{e.courseTitle}</h2>
                      {e.sessionLabel && <p className="text-sm text-muted">{e.sessionLabel}</p>}
                    </div>
                    {status && <Badge tone={status === "COMPLETED" ? "good" : "neutral"}>{t(`enrollmentStatus.${status}`)}</Badge>}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span>{t("courses.progress")}</span><span dir="ltr">{e.progressPct}%</span></div>
                    <ProgressBar value={e.progressPct} label={t("courses.progress")} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </StudentShell>
  );
}
