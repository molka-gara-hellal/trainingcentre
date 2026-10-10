import { getEnv } from "../env";

export const ACCESS_COOKIE = "center_at";
export const REFRESH_COOKIE = "center_rt";

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
};

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
};

/**
 * Les jetons vivent UNIQUEMENT dans des cookies httpOnly : JavaScript côté navigateur n'y a pas accès
 * (un XSS ne peut pas les voler). SameSite=Lax + contrôle d'origine des Server Actions limitent le CSRF.
 * Le cookie d'accès expire en même temps que le jeton : son absence déclenche le renouvellement (proxy.ts).
 */
export function cookieOptions(expires: Date): CookieOptions {
  return { httpOnly: true, secure: getEnv().cookieSecure, sameSite: "lax", path: "/", expires };
}

export const accessCookieOptions = (tokens: TokenSet) => cookieOptions(tokens.accessExpiresAt);
export const refreshCookieOptions = (tokens: TokenSet) => cookieOptions(tokens.refreshExpiresAt);
