import { defineRouting } from "next-intl/routing";
import { LOCALES, DEFAULT_LOCALE } from "@center/shared";

export const routing = defineRouting({
  locales: [...LOCALES],
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always", // /fr/..., /ar/..., /en/... (bon pour le SEO multilingue)
});
