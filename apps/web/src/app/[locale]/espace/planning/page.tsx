import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { EmptyState } from "@/components/space/student-shell";
import { dayKey, formatDay, formatTime } from "@/lib/student-format";
import { loadSchedule } from "@/lib/student";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "schedule", "/espace/planning");
}

export default async function SchedulePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/planning");
  const [t, events] = await Promise.all([getTranslations("Student"), loadSchedule(locale)]);
  const days = new Map<string, typeof events>();
  for (const event of events) {
    if (!event.startsAt) continue;
    const key = dayKey(event.startsAt);
    days.set(key, [...(days.get(key) ?? []), event]);
  }
  return (
    <StudentShell title={t("nav.schedule")} lead={t("schedule.lead")}>
      {days.size === 0 ? (
        <EmptyState>{t("schedule.empty")}</EmptyState>
      ) : (
        <div className="space-y-6">
          {[...days.entries()].map(([key, list]) => (
            <section key={key} aria-labelledby={`day-${key}`}>
              <h2 id={`day-${key}`} className="mb-2 text-base font-semibold">{formatDay(list[0]!.startsAt!, locale)}</h2>
              <ul className="divide-y divide-line border-y border-line">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                    <span className="font-medium">{e.courseTitle}</span>
                    <span className="text-sm text-muted">
                      <span dir="ltr">{formatTime(e.startsAt!, locale)} – {e.endsAt ? formatTime(e.endsAt, locale) : ""}</span>
                      {" · "}
                      {e.roomName ?? t("schedule.roomTbd")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
