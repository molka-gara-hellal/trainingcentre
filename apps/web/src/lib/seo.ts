import type { Metadata } from "next";
import { LOCALES, type Locale } from "@center/shared";
import { siteUrl } from "./env";

const OG_LOCALE: Record<Locale, string> = { fr: "fr_TN", ar: "ar_TN", en: "en_US" };

/** URL absolue d'une page : /fr/formations, /ar, ... */
export const absoluteUrl = (locale: string, path = ""): string => `${siteUrl()}/${locale}${path === "/" ? "" : path}`;

type PageMeta = { locale: string; path?: string; title: string; description: string; noindex?: boolean };

/** Métadonnées d'une page : titre, description, canonique, alternates hreflang, Open Graph. */
export function buildMetadata({ locale, path = "", title, description, noindex }: PageMeta): Metadata {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(l, path)]));
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(locale, path), languages: { ...languages, "x-default": absoluteUrl("fr", path) } },
    openGraph: {
      title,
      description,
      url: absoluteUrl(locale, path),
      type: "website",
      locale: OG_LOCALE[locale as Locale] ?? "fr_TN",
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}

/** Sérialisation sûre d'un JSON-LD (évite de fermer la balise <script> avec "</"). */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, "\\u003c");
