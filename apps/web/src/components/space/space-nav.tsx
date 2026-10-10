"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/espace", key: "dashboard" },
  { href: "/espace/formations", key: "courses" },
  { href: "/espace/planning", key: "schedule" },
  { href: "/espace/projets", key: "projects" },
  { href: "/espace/attestations", key: "certificates" },
  { href: "/espace/inscriptions", key: "registrations" },
  { href: "/espace/paiements", key: "payments" },
  { href: "/espace/notifications", key: "notifications" },
  { href: "/espace/profil", key: "profile" },
] as const;

export function SpaceNav({ unread }: { unread: number }) {
  const t = useTranslations("Student.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
        {ITEMS.map((item) => {
          const active = item.href === "/espace" ? pathname === "/espace" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center justify-between gap-3 rounded-control px-3.5 text-sm font-medium ${
                  active ? "bg-primary text-primary-fg" : "hover:bg-chalk"
                }`}
              >
                <span>{t(item.key)}</span>
                {item.key === "notifications" && unread > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-primary-fg text-primary" : "bg-sun text-ink"}`}
                    aria-label={t("unread", { count: unread })}
                  >
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
