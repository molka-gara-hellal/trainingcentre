"use client";

import { useLocale, useTranslations } from "next-intl";
import { LOCALES } from "@center/shared";
import { Link, usePathname } from "@/i18n/navigation";

const NAMES: Record<string, string> = { fr: "Français", ar: "العربية", en: "English" };

/** Change de langue en restant sur la même page. Chaque lien déclare sa propre langue (lecteurs d'écran). */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Nav");
  return (
    <nav aria-label={t("language")} className={className}>
      <ul className="flex items-center gap-1">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              hrefLang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control px-2.5 text-sm font-medium ${
                locale === current ? "bg-ink text-white" : "text-ink hover:bg-chalk"
              }`}
            >
              <span className="sr-only">{NAMES[locale]}</span>
              <span aria-hidden="true">{locale.toUpperCase()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
