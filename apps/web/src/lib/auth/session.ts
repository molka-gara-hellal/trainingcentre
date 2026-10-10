import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { GetMeRequest } from "@center/proto-gen/auth/v1/auth";
import { Role } from "@center/proto-gen/common/v1/common";
import type { User } from "@center/proto-gen/user/v1/user";
import { ApiError } from "../grpc/errors";
import { clients, rpc, type CallContext } from "../grpc/client";
import { clientIpFrom } from "../ip";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions, type TokenSet } from "./cookies";
import { refreshTokens } from "./refresh";

/** Contexte d'appel de la requête courante (IP du visiteur + jeton d'accès éventuel). */
export async function callContext(options: { withToken?: boolean } = {}): Promise<CallContext> {
  const h = await headers();
  const ctx: CallContext = { clientIp: clientIpFrom(h) };
  if (options.withToken) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) ctx.accessToken = token;
  }
  return ctx;
}

/** Écrit les cookies de session. Autorisé uniquement dans une Server Action ou un Route Handler. */
export async function writeSessionCookies(tokens: TokenSet): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions(tokens));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions(tokens));
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}

/**
 * Utilisateur connecté (ou null). Lecture seule : pendant le rendu d'une page on ne peut PAS écrire de
 * cookie, donc on ne renouvelle jamais ici (consommer le refresh token sans pouvoir stocker le nouveau
 * ferait perdre la session). Le renouvellement est fait en amont par proxy.ts (pages) ou par
 * `withFreshAccess` (Server Actions).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const ctx = await callContext({ withToken: true });
  if (!ctx.accessToken) return null;
  try {
    const res = await rpc<{ user?: User }>(ctx, (md, opts, cb) =>
      clients().auth.getMe(GetMeRequest.fromPartial({}), md, opts, cb),
    );
    return res.user ?? null;
  } catch (err) {
    if (err instanceof ApiError && (err.isUnauthenticated || err.isUnavailable)) return null;
    throw err;
  }
});

/**
 * Pour les Server Actions : renvoie un contexte avec un jeton d'accès valide, en renouvelant la session
 * (et en réécrivant les cookies) si le jeton d'accès a expiré. null = visiteur non connecté.
 */
export async function withFreshAccess(): Promise<CallContext | null> {
  const ctx = await callContext({ withToken: true });
  if (ctx.accessToken) return ctx;
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return null;
  try {
    const tokens = await refreshTokens(refreshToken, ctx);
    await writeSessionCookies(tokens);
    return { ...ctx, accessToken: tokens.accessToken };
  } catch (err) {
    if (err instanceof ApiError && err.isUnauthenticated) {
      await clearSessionCookies();
      return null;
    }
    throw err;
  }
}

/** Page réservée : redirige vers la connexion (en mémorisant la page demandée). */
export async function requireUser(locale: string, nextPath: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/connexion?next=${encodeURIComponent(nextPath)}`);
  return user;
}

export const roleName = (role: Role): "STUDENT" | "TRAINER" | "ADMIN" | "UNKNOWN" =>
  role === Role.ROLE_ADMIN ? "ADMIN" : role === Role.ROLE_TRAINER ? "TRAINER" : role === Role.ROLE_STUDENT ? "STUDENT" : "UNKNOWN";
