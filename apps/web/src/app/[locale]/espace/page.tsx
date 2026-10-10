import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Role } from "@center/proto-gen/common/v1/common";
import { EnrollmentStatus } from "@center/proto-gen/learning/v1/learning";
import { logoutAction } from "@/actions/auth";
import { Badge, Card, EmptyState, ProgressBar, StudentShell } from "@/components/space/student-shell";
import { buttonClasses } from "@/components/ui/button";
import { Container, Notice, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { requireUser, roleName } from "@/lib/auth/session";
import { buildMetadata } from "@/lib/seo";
import { formatDay, formatTime } from "@/lib/student-format";
import { loadDashboard, loadUnreadCount } from "@/lib/student";
import { loadMySessions } from "@/lib/trainer";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { TrainerShell } from "@/components/space/trainer-shell";
import { sessionStatusKey } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Space" });
  return buildMetadata({ locale, path: "/espace", title: t("title"), description: t("title"), noindex: true });
}

/** Point d'arrivée après connexion : tableau de bord étudiant ; formateur et administrateur viennent aux phases 8 et 9. */
export default async function SpacePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/espace");
  if (user.role === Role.ROLE_STUDENT) return <StudentDashboard locale={locale} />;
  if (user.role === Role.ROLE_TRAINER) return <TrainerDashboard locale={locale} name={user.firstName} />;
  if (user.role === Role.ROLE_ADMIN) return <AdminDashboard locale={locale} name={user.firstName} />;

  const [t, roles] = await Promise.all([getTranslations("Space"), getTranslations("Roles")]);
  const role = roleName(user.role);
  return (
    <>
      <PageHeader title={t("welcome", { name: user.firstName })} lead={t("title")} />
      <Container className="max-w-2xl space-y-8 py-10">
        <dl className="divide-y divide-line border-y border-line text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">{t("email")}</dt>
            <dd className="font-medium" dir="ltr">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted">{t("role")}</dt>
            <dd className="font-medium">{role === "UNKNOWN" ? "—" : roles(role)}</dd>
          </div>
        </dl>
        <Notice>{t("comingSoon")}</Notice>
        <form action={logoutAction}>
          <button type="submit" className={buttonClasses("secondary")}>{t("logout")}</button>
        </form>
      </Container>
    </>
  );
}

async function StudentDashboard({ locale }: { locale: string }) {
  const [t, dash] = await Promise.all([getTranslations("Student"), loadDashboard(locale)]);
  return (
    <StudentShell title={t("dashboard.welcome", { name: dash.user?.firstName ?? "" })} lead={t("dashboard.lead")}>
      {dash.unreadNotifications > 0 && (
        <Notice>
          {t("dashboard.unread", { count: dash.unreadNotifications })}{" "}
          <Link href="/espace/notifications" className="font-medium text-primary underline underline-offset-4">{t("dashboard.seeNotifications")}</Link>
        </Notice>
      )}
      <section aria-labelledby="dash-courses" className="space-y-3">
        <h2 id="dash-courses" className="text-xl font-semibold">{t("dashboard.myCourses")}</h2>
        {dash.enrollments.length === 0 ? (
          <EmptyState>
            {t("courses.empty")}{" "}
            <Link href="/formations" className="font-medium text-primary underline underline-offset-4">{t("courses.browse")}</Link>
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {dash.enrollments.map((e) => (
              <li key={e.id}>
                <Card className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{e.courseTitle}</h3>
                    {e.status === EnrollmentStatus.ENROLLMENT_STATUS_COMPLETED && <Badge tone="good">{t("enrollmentStatus.COMPLETED")}</Badge>}
                  </div>
                  <ProgressBar value={e.progressPct} label={`${e.courseTitle} — ${t("courses.progress")}`} />
                  <p className="text-sm text-muted"><span dir="ltr">{e.progressPct}%</span></p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="dash-next" className="space-y-3">
        <h2 id="dash-next" className="text-xl font-semibold">{t("dashboard.nextEvents")}</h2>
        {dash.nextEvents.length === 0 ? (
          <EmptyState>{t("schedule.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {dash.nextEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
                <span>
                  <span className="font-medium">{e.courseTitle}</span>
                  <span className="block text-sm text-muted">{e.startsAt ? formatDay(e.startsAt, locale) : ""}</span>
                </span>
                <span className="text-sm text-muted">
                  <span dir="ltr">{e.startsAt ? formatTime(e.startsAt, locale) : ""}</span> · {e.roomName ?? t("schedule.roomTbd")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/espace/planning" className="text-sm font-medium text-primary underline underline-offset-4">{t("dashboard.fullSchedule")}</Link>
      </section>
    </StudentShell>
  );
}

async function TrainerDashboard({ locale, name }: { locale: string; name: string }) {
  const [t, ts, tn, sessions, unread] = await Promise.all([getTranslations("Trainer"), getTranslations("SessionStatus"), getTranslations("Trainer.notifications"), loadMySessions(locale), loadUnreadCount()]);
  return (
    <TrainerShell title={t("dashboard.welcome", { name })} lead={t("dashboard.lead")}>
      {unread > 0 && (
        <Notice tone="warning">
          {tn("unread", { count: unread })}{" "}
          <Link href="/espace/notifications" className="font-medium text-primary underline underline-offset-4">{tn("see")}</Link>
        </Notice>
      )}
      <section aria-labelledby="my-sessions" className="space-y-3">
        <h2 id="my-sessions" className="text-xl font-semibold">{t("dashboard.mySessions")}</h2>
        {sessions.length === 0 ? (
          <EmptyState>{t("dashboard.empty")}</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {sessions.map((s) => {
              const status = sessionStatusKey(s.status);
              return (
                <li key={s.id}>
                  <Card className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{s.courseTitle}</h3>
                      {status && <Badge>{ts(status)}</Badge>}
                    </div>
                    {s.label && <p className="text-sm text-muted">{s.label}</p>}
                    <p className="text-sm text-muted">{t("dashboard.students", { count: s.seatsTaken })}</p>
                    <Link href={`/espace/sessions/${s.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">{t("dashboard.open")}</Link>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TrainerShell>
  );
}
