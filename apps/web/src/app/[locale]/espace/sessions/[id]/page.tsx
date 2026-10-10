import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { TrainerShell } from "@/components/space/trainer-shell";
import { Link } from "@/i18n/navigation";
import { dayKey, formatDay, formatTime } from "@/lib/student-format";
import { loadMySessions, loadSessionSchedule, loadSessionStudents, requireTrainer } from "@/lib/trainer";
import { enrollmentStatusKey } from "@/lib/student-format";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Trainer" });
  return buildMetadata({ locale, path: `/espace/sessions/${id}`, title: t("session.title"), description: t("session.title"), noindex: true });
}

export default async function TrainerSessionPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireTrainer(locale, `/espace/sessions/${id}`);
  const [t, students, events, sessions] = await Promise.all([
    getTranslations("Trainer"),
    loadSessionStudents(locale, id),
    loadSessionSchedule(locale, id),
    loadMySessions(locale),
  ]);
  const session = sessions.find((s) => s.id === id);
  const title = session ? `${session.courseTitle}${session.label ? ` — ${session.label}` : ""}` : t("session.title");
  const now = Date.now();
  return (
    <TrainerShell title={title} lead={t("session.lead")} back={{ href: "/espace", label: t("backToSessions") }}>
      <div className="flex flex-wrap gap-3">
        <Link href={`/espace/sessions/${id}/projets`} className="text-sm font-medium text-primary underline underline-offset-4">{t("session.projectsLink")}</Link>
      </div>
      <section aria-labelledby="students-title" className="space-y-3">
        <h2 id="students-title" className="text-xl font-semibold">{t("session.students")} ({students.length})</h2>
        {students.length === 0 ? (
          <EmptyState>{t("session.noStudents")}</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {students.map((s) => {
              const status = s.enrollment ? enrollmentStatusKey(s.enrollment.status) : undefined;
              return (
                <li key={s.enrollment?.id ?? s.email}>
                  <Card className="space-y-1">
                    <p className="flex items-center justify-between gap-2 font-medium">
                      {s.firstName} {s.lastName}
                      {status === "COMPLETED" && <Badge tone="good">{t("enrollmentCompleted")}</Badge>}
                    </p>
                    <p className="text-sm text-muted" dir="ltr">{s.email}</p>
                    <p className="text-sm text-muted">{t("session.progress")} : <span dir="ltr">{s.enrollment?.progressPct ?? 0}%</span></p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section aria-labelledby="events-title" className="space-y-3">
        <h2 id="events-title" className="text-xl font-semibold">{t("session.schedule")}</h2>
        {events.length === 0 ? (
          <EmptyState>{t("session.noEvents")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {events.map((e) => {
              const started = e.startsAt ? e.startsAt.getTime() <= now : false;
              return (
                <li key={e.id} data-day={e.startsAt ? dayKey(e.startsAt) : undefined} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
                  <span>
                    <span className="block font-medium">{e.startsAt ? formatDay(e.startsAt, locale) : ""}</span>
                    <span className="text-sm text-muted">
                      <span dir="ltr">{e.startsAt ? formatTime(e.startsAt, locale) : ""} – {e.endsAt ? formatTime(e.endsAt, locale) : ""}</span>
                      {" · "}{e.roomName ?? t("session.roomTbd")}
                    </span>
                  </span>
                  {started ? (
                    <Link href={`/espace/sessions/${id}/presences/${e.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("session.takeAttendance")}</Link>
                  ) : (
                    <Badge>{t("session.upcoming")}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TrainerShell>
  );
}
