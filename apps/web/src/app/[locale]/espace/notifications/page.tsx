import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireUser } from "@/lib/auth/session";
import { spaceMetadata } from "@/lib/student";
import { TrainerShell as TrainerNotificationsShell } from "@/components/space/trainer-shell";
import { Role } from "@center/proto-gen/common/v1/common";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/student";
import { formatDateTime, notificationHref, notificationKind } from "@/lib/student-format";
import { loadNotifications } from "@/lib/student";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "notifications", "/espace/notifications");
}

export default async function NotificationsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale, "/espace/notifications");
  const isTrainer = user.role === Role.ROLE_TRAINER;
  if (!isTrainer && user.role !== Role.ROLE_STUDENT) redirect(`/${locale}/espace`);
  const [t, tt, notifications] = await Promise.all([getTranslations("Student"), getTranslations("Trainer.notifications"), loadNotifications(locale)]);
  const hasUnread = notifications.some((n) => !n.readAt);
  // Le formateur dispose du même écran avec ses propres textes.
  const Shell = isTrainer ? TrainerNotificationsShell : StudentShell;
  const L = isTrainer
    ? { title: tt("title"), lead: tt("lead"), empty: tt("empty"), isNew: tt("new"), markRead: tt("markRead"), markAll: tt("markAll"), open: tt("open") }
    : { title: t("nav.notifications"), lead: t("notifications.lead"), empty: t("notifications.empty"), isNew: t("notifications.new"), markRead: t("notifications.markRead"), markAll: t("notifications.markAll"), open: t("notifications.open") };
  return (
    <Shell title={L.title} lead={L.lead} {...(isTrainer ? { back: { href: "/espace", label: (await getTranslations("Trainer"))("dashboard.mySessions") } } : {})}>
      {hasUnread && (
        <form action={markAllNotificationsReadAction}>
          <Button type="submit" variant="secondary">{L.markAll}</Button>
        </form>
      )}
      {notifications.length === 0 ? (
        <EmptyState>{L.empty}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => {
            const kind = notificationKind(n.type);
            const href = notificationHref(kind, n.payloadJson);
            return (
              <li key={n.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="flex items-center gap-2 font-medium">
                      {!n.readAt && <Badge tone="warn">{L.isNew}</Badge>}
                      {t(`notificationType.${kind}`)}
                    </p>
                    <p className="text-sm text-muted">{n.createdAt ? formatDateTime(n.createdAt, locale) : ""}</p>
                    {href && <Link href={href} className="text-sm font-medium text-primary underline underline-offset-4">{L.open}</Link>}
                  </div>
                  {!n.readAt && (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button type="submit" variant="quiet">{L.markRead}</Button>
                    </form>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
