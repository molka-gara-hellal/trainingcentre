export const LOCALES = ["fr", "ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const RTL_LOCALES: readonly Locale[] = ["ar"];

export const ROLES = ["STUDENT", "TRAINER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const isRtl = (locale: Locale): boolean => RTL_LOCALES.includes(locale);
