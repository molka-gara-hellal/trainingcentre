"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

type NavLink = { href: string; label: string };

/** Menu des petits écrans : bouton + panneau, fermé par Échap ou au changement de page. */
export function MobileNav({ links, children }: { links: NavLink[]; children?: ReactNode }) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="xl:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-ink/25 px-3.5 text-sm font-medium hover:bg-chalk"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? <path d="M3 3l12 12M15 3L3 15" /> : <path d="M2 5h14M2 9h14M2 13h14" />}
        </svg>
        {open ? t("close") : t("menu")}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full z-40 border-b border-line bg-surface px-4 py-4 shadow-[0_12px_24px_-12px_rgba(10,37,64,0.25)]"
      >
        <nav aria-label={t("mobile")}>
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="flex min-h-11 items-center rounded-control px-2 text-lg font-medium hover:bg-chalk">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {children && <div className="mt-4 space-y-3 border-t border-line pt-4">{children}</div>}
      </div>
    </div>
  );
}
