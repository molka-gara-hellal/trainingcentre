import { localeMap } from "./enums";
import { unauthenticated } from "./errors";
import type { PrismaClient } from "./prisma";
import type { RequestContext } from "../grpc/handler";
import type { Locale } from "../generated/prisma/enums";

/** Langue d'affichage : celle demandée, sinon celle du profil de l'appelant. */
export async function callerLocale(
  prisma: PrismaClient,
  ctx: RequestContext,
  requested?: Parameters<typeof localeMap.toDb>[0],
): Promise<Locale> {
  const asked = localeMap.toDb(requested);
  if (asked) return asked;
  if (!ctx.auth) throw unauthenticated();
  const user = await prisma.user.findUnique({ where: { id: ctx.auth.userId }, select: { locale: true } });
  return user?.locale ?? "FR";
}

export function actorId(ctx: RequestContext): string {
  if (!ctx.auth) throw unauthenticated();
  return ctx.auth.userId;
}
