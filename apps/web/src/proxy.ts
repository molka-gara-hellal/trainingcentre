import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, cookieOptions, refreshCookieOptions } from "./lib/auth/cookies";
import { buildCsp, generateNonce } from "./lib/csp";
import { refreshTokens } from "./lib/auth/refresh";
import { ApiError } from "./lib/grpc/errors";
import { clientIpFrom } from "./lib/ip";

const intl = createMiddleware(routing);

/**
 * 1) Renouvelle la session AVANT le rendu : si le cookie d'accès a expiré mais que le cookie de
 *    renouvellement existe, on obtient un nouveau couple de jetons, on le place dans la requête en cours
 *    (la page le voit tout de suite) ET dans la réponse (le navigateur le mémorise).
 * 2) Délègue ensuite à next-intl (préfixe de langue /fr /ar /en).
 *
 * Seulement pour les navigations GET : les Server Actions (POST) se renouvellent elles-mêmes.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  let renewed: Awaited<ReturnType<typeof refreshTokens>> | undefined;
  let cleared = false;

  const isNavigation = request.method === "GET" || request.method === "HEAD";
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (isNavigation && refreshToken && !request.cookies.get(ACCESS_COOKIE)?.value) {
    try {
      renewed = await refreshTokens(refreshToken, { clientIp: clientIpFrom(request.headers) });
      request.cookies.set(ACCESS_COOKIE, renewed.accessToken);
      request.cookies.set(REFRESH_COOKIE, renewed.refreshToken);
    } catch (err) {
      if (err instanceof ApiError && err.isUnauthenticated) {
        request.cookies.delete(REFRESH_COOKIE); // session terminée : on nettoie
        cleared = true;
      }
      // API indisponible : on laisse passer, le visiteur est simplement vu comme déconnecté pour l'instant.
    }
  }

  // CSP avec nonce : transmise à la page via les en-têtes de la requête (Next applique le nonce à ses scripts)
  // ET renvoyée au navigateur.
  const nonce = generateNonce();
  const csp = buildCsp(nonce, { isDev: process.env.NODE_ENV !== "production", upgradeInsecure: (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") });
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("content-security-policy", csp);
  const response = intl(new NextRequest(request, { headers: forwarded })) as NextResponse;
  response.headers.set("Content-Security-Policy", csp);

  if (renewed) {
    response.cookies.set(ACCESS_COOKIE, renewed.accessToken, accessCookieOptions(renewed));
    response.cookies.set(REFRESH_COOKIE, renewed.refreshToken, refreshCookieOptions(renewed));
  } else if (cleared) {
    response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
  }
  return response;
}

export const config = {
  // Ignore les routes API, _next, _vercel et les fichiers statiques (avec extension)
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
