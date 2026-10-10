import { getTranslations } from "next-intl/server";
import { Card, EmptyState } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { AdminShell } from "@/components/admin/admin-shell";
import { Link } from "@/i18n/navigation";
import { adminLoad, clients, loc, rpc } from "@/lib/admin";
import { formatTnd } from "@/lib/student-format";
import type { GetStatsResponse } from "@center/proto-gen/admin/v1/admin";

export async function AdminDashboard({ locale, name }: { locale: string; name: string }) {
  const [t, stats] = await Promise.all([
    getTranslations("Admin"),
    adminLoad(locale, "/espace", (ctx) => rpc<GetStatsResponse>(ctx, (md, o, cb) => clients().admin.getStats({ locale: loc(locale) }, md, o, cb))),
  ]);
  const tiles: Array<{ key: string; value: string; href?: string }> = [
    { key: "students", value: String(stats.studentsCount), href: "/espace/admin/etudiants" },
    { key: "registrations", value: String(stats.registrationsCount), href: "/espace/admin/demandes" },
    { key: "pending", value: String(stats.pendingRegistrationsCount), href: "/espace/admin/demandes?status=PENDING" },
    { key: "courses", value: String(stats.activeCoursesCount), href: "/espace/admin/formations" },
    { key: "revenue", value: formatTnd(stats.revenueTnd, locale), href: "/espace/admin/paiements" },
    { key: "fillRate", value: `${stats.fillRatePct}%`, href: "/espace/admin/sessions" },
  ];
  return (
    <AdminShell title={t("dashboard.welcome", { name })} lead={t("dashboard.lead")}>
      {stats.pendingRegistrationsCount > 0 && (
        <Notice tone="warning">
          {t("dashboard.pendingNotice", { count: stats.pendingRegistrationsCount })}{" "}
          <Link href="/espace/admin/demandes?status=PENDING" className="font-medium text-primary underline underline-offset-4">{t("dashboard.seeRequests")}</Link>
        </Notice>
      )}
      <section aria-labelledby="adm-stats" className="space-y-3">
        <h2 id="adm-stats" className="text-xl font-semibold">{t("dashboard.statsTitle")}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <li key={tile.key}>
              <Card className="space-y-1">
                <p className="text-sm text-muted">{t(`dashboard.stat.${tile.key}`)}</p>
                <p className="text-2xl font-semibold" dir="ltr">{tile.value}</p>
                {tile.href && <Link href={tile.href} className="text-sm font-medium text-primary underline underline-offset-4">{t("dashboard.open")}</Link>}
              </Card>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted">{t("dashboard.statsNote")}</p>
      </section>
      <section aria-labelledby="adm-demand" className="space-y-3">
        <h2 id="adm-demand" className="text-xl font-semibold">{t("dashboard.demandTitle")}</h2>
        {stats.mostRequestedCourses.length === 0 ? (
          <EmptyState>{t("dashboard.demandEmpty")}</EmptyState>
        ) : (
          <ol className="divide-y divide-line border-y border-line">
            {stats.mostRequestedCourses.map((c) => (
              <li key={c.courseSlug} className="flex items-baseline justify-between gap-4 py-3">
                <span className="font-medium">{c.courseTitle}</span>
                <span className="text-sm text-muted">{t("dashboard.demandCount", { count: c.registrationsCount })}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AdminShell>
  );
}
