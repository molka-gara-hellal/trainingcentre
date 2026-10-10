import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AttendanceStatus } from "@center/proto-gen/learning/v1/learning";
import { AttendanceForm, type AttendanceRow } from "@/components/space/attendance-form";
import { EmptyState } from "@/components/space/student-shell";
import { TrainerShell } from "@/components/space/trainer-shell";
import { buildMetadata } from "@/lib/seo";
import { formatDay, formatTime } from "@/lib/student-format";
import { loadEventAttendance, loadSessionSchedule, loadSessionStudents, requireTrainer } from "@/lib/trainer";

type Props = { params: Promise<{ locale: string; id: string; eventId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id, eventId } = await params;
  const t = await getTranslations({ locale, namespace: "Trainer" });
  return buildMetadata({ locale, path: `/espace/sessions/${id}/presences/${eventId}`, title: t("attendance.title"), description: t("attendance.title"), noindex: true });
}

const KEY: Partial<Record<AttendanceStatus, AttendanceRow["status"]>> = {
  [AttendanceStatus.ATTENDANCE_STATUS_PRESENT]: "PRESENT",
  [AttendanceStatus.ATTENDANCE_STATUS_ABSENT]: "ABSENT",
  [AttendanceStatus.ATTENDANCE_STATUS_LATE]: "LATE",
  [AttendanceStatus.ATTENDANCE_STATUS_EXCUSED]: "EXCUSED",
};

export default async function AttendancePage({ params }: Props) {
  const { locale, id, eventId } = await params;
  setRequestLocale(locale);
  await requireTrainer(locale, `/espace/sessions/${id}/presences/${eventId}`);
  const [t, events, students, records] = await Promise.all([
    getTranslations("Trainer"),
    loadSessionSchedule(locale, id),
    loadSessionStudents(locale, id),
    loadEventAttendance(locale, eventId),
  ]);
  const event = events.find((e) => e.id === eventId);
  if (!event?.startsAt) notFound();
  const byEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
  const rows: AttendanceRow[] = students.flatMap((s) =>
    s.enrollment
      ? [{
          enrollmentId: s.enrollment.id,
          name: `${s.firstName} ${s.lastName}`,
          email: s.email,
          status: KEY[byEnrollment.get(s.enrollment.id)?.status ?? AttendanceStatus.ATTENDANCE_STATUS_UNSPECIFIED],
          note: byEnrollment.get(s.enrollment.id)?.note,
        }]
      : [],
  );
  return (
    <TrainerShell
      title={t("attendance.title")}
      lead={`${formatDay(event.startsAt, locale)} · ${formatTime(event.startsAt, locale)}`}
      back={{ href: `/espace/sessions/${id}`, label: t("backToSession") }}
    >
      {rows.length === 0 ? <EmptyState>{t("session.noStudents")}</EmptyState> : <AttendanceForm eventId={eventId} rows={rows} />}
    </TrainerShell>
  );
}
