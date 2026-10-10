import "server-only";
import { notFound, redirect } from "next/navigation";
import { Locale as ProtoLocale, Role } from "@center/proto-gen/common/v1/common";
import { ApiError } from "./grpc/errors";
import { clients, rpc } from "./grpc/client";
import { callContext, requireUser } from "./auth/session";
import { protoLocale } from "./data";

/** Garde de page : connecté ET administrateur. Les autres rôles retournent sur /espace. */
export async function requireAdmin(locale: string, path: string) {
  const user = await requireUser(locale, path);
  if (user.role !== Role.ROLE_ADMIN) redirect(`/${locale}/espace`);
  return user;
}

/** Lecture seule : session refusée → connexion ; rôle incorrect → /espace ; introuvable → 404. */
export async function adminLoad<T>(locale: string, path: string, load: (ctx: Awaited<ReturnType<typeof callContext>>) => Promise<T>): Promise<T> {
  try {
    return await load(await callContext({ withToken: true }));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isUnauthenticated) redirect(`/${locale}/connexion?next=${encodeURIComponent(path)}`);
      if (err.grpcCode === 7) redirect(`/${locale}/espace`);
      if (err.grpcCode === 5 || err.grpcCode === 3) notFound();
    }
    throw err;
  }
}

export const loc = (locale: string): ProtoLocale => protoLocale(locale);
export { clients, rpc };

/** Page demandée (?page=) : entier ≥ 1, sinon 1. */
export const pageParam = (raw: string | string[] | undefined): number => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
};
