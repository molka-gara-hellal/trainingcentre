"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/espace", key: "dashboard" },
  { href: "/espace/admin/formations", key: "courses" },
  { href: "/espace/admin/sessions", key: "sessions" },
  { href: "/espace/admin/demandes", key: "requests" },
  { href: "/espace/admin/messages", key: "messages" },
  { href: "/espace/admin/paiements", key: "payments" },
  { href: "/espace/admin/etudiants", key: "students" },
  { href: "/espace/admin/formateurs", key: "trainers" },
  { href: "/espace/admin/faq", key: "faq" },
  { href: "/espace/admin/parametres", key: "settings" },
] as const;

export function AdminNav() {
  const t = useTranslations("Admin.nav");
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
                className={`flex min-h-11 items-center rounded-control px-3.5 text-sm font-medium ${active ? "bg-primary text-primary-fg" : "hover:bg-chalk"}`}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
