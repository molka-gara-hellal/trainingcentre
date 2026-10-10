import { createHash } from "node:crypto";
import { RefreshTokenRequest, type TokenPair } from "@center/proto-gen/auth/v1/auth";
import { clients, rpc, type CallContext } from "../grpc/client";
import type { TokenSet } from "./cookies";

/**
 * Renouvellement des jetons AVEC dédoublonnage.
 *
 * Le refresh token est à usage unique côté API. Or une même page peut déclencher plusieurs requêtes en
 * parallèle (navigation + préchargements) avec le même cookie périmé. Sans précaution, la 2e présenterait
 * un jeton déjà consommé et l'API prendrait cela pour un vol (révocation de TOUTE la session).
 * Ici : un seul appel en vol par jeton, et son résultat est réutilisé quelques secondes.
 * (L'API tolère aussi une fenêtre de 10 s : double protection.)
 */
const REUSE_WINDOW_MS = 8_000;

type Entry = { promise: Promise<TokenSet>; settledAt?: number };
const entries = new Map<string, Entry>();

const keyOf = (refreshToken: string) => createHash("sha256").update(refreshToken).digest("hex");

export function toTokenSet(pair: TokenPair | undefined): TokenSet {
  if (!pair?.accessToken || !pair.refreshToken || !pair.accessExpiresAt || !pair.refreshExpiresAt) {
    throw new Error("Réponse d'authentification incomplète");
  }
  return {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: pair.accessExpiresAt,
    refreshExpiresAt: pair.refreshExpiresAt,
  };
}

export function refreshTokens(refreshToken: string, ctx: CallContext): Promise<TokenSet> {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (entry.settledAt !== undefined && now - entry.settledAt > REUSE_WINDOW_MS) entries.delete(key);
  }

  const key = keyOf(refreshToken);
  const existing = entries.get(key);
  if (existing) return existing.promise;

  const entry: Entry = {
    promise: rpc<{ tokens?: TokenPair }>({ ...ctx, accessToken: undefined }, (md, opts, cb) =>
      clients().auth.refreshToken(RefreshTokenRequest.fromPartial({ refreshToken }), md, opts, cb),
    ).then((res) => toTokenSet(res.tokens)),
  };
  entry.promise.then(
    () => (entry.settledAt = Date.now()),
    () => entries.delete(key), // un échec ne doit pas être mémorisé
  );
  entries.set(key, entry);
  return entry.promise;
}
