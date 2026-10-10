/** Date Prisma (@db.Date, minuit UTC) → "AAAA-MM-JJ". */
export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Montant Prisma Decimal → texte à 3 décimales (dinar tunisien). */
export const formatTnd = (value: { toFixed(digits: number): string }): string => value.toFixed(3);

/** Date du jour en Tunisie (AAAA-MM-JJ), à minuit UTC : sert à filtrer les sessions à venir. */
export function todayInTunis(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

export type PageParams = { page: number; pageSize: number; skip: number };

/** Applique les valeurs par défaut et les bornes (protobuf renvoie 0 quand le champ est absent). */
export function normalizePage(
  request: { page?: number; pageSize?: number } | undefined,
  defaultPageSize: number,
  maxPageSize: number,
): PageParams {
  const page = request?.page && request.page > 0 ? Math.floor(request.page) : 1;
  const asked = request?.pageSize && request.pageSize > 0 ? Math.floor(request.pageSize) : defaultPageSize;
  const pageSize = Math.min(asked, maxPageSize);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function pageInfo(params: PageParams, totalItems: number) {
  return {
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / params.pageSize),
  };
}
