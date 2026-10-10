/**
 * Règle projet : aucune donnée métier inventée.
 * Toute valeur non décidée vaut TODO_VALUE et s'affiche "À définir" dans l'UI.
 * Les vraies valeurs seront stockées en base (table SiteSetting, Phase 3) et éditables depuis l'admin.
 */
export const TODO_VALUE = "TODO" as const;

export const isTodo = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value.trim() === "" || value === TODO_VALUE;

/** Valeurs par défaut du site tant que rien n'est confirmé. */
export const SITE_DEFAULTS = {
  PROJECT_NAME: TODO_VALUE,
  PHONE: TODO_VALUE,
  EMAIL: TODO_VALUE,
  ADDRESS: TODO_VALUE,
  OPENING_HOURS: TODO_VALUE,
  CITY: "Monastir",
  COUNTRY: "Tunisie",
} as const;

export type SiteSettingKey = keyof typeof SITE_DEFAULTS;
