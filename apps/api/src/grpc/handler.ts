import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Metadata, status, type handleUnaryCall } from "@grpc/grpc-js";
import type { Logger } from "pino";
import type { Authenticator, AuthContext } from "../common/auth";
import {
  AppError,
  permissionDenied,
  REQUEST_ID_METADATA_KEY,
  toServiceError,
  unauthenticated,
} from "../common/errors";
import type { RateLimiter } from "../common/rate-limit";
import { policyFor, type Access } from "./policies";

export type RequestContext = {
  requestId: string;
  auth: AuthContext | null;
  clientIp: string;
  log: Logger;
};

export type HandlerDeps = {
  logger: Logger;
  authenticator: Authenticator;
  rateLimiter: RateLimiter;
};

// Les définitions générées par ts-proto ont toutes cette forme pour les appels unaires.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type UnaryDefinition = {
  path: string;
  requestStream: false;
  responseStream: false;
  requestDeserialize: (value: Buffer) => any;
  responseSerialize: (value: any) => Buffer;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
type ReqOf<D extends UnaryDefinition> = ReturnType<D["requestDeserialize"]>;
type ResOf<D extends UnaryDefinition> = Parameters<D["responseSerialize"]>[0];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function requestIdFrom(metadata: Metadata): string {
  const incoming = metadata.get(REQUEST_ID_METADATA_KEY)[0];
  return typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

/**
 * Adresse IP du visiteur final. Le serveur Next.js (BFF) la transmet dans `x-client-ip`, car c'est lui,
 * et non le navigateur, qui appelle l'API. Cet en-tête n'est digne de confiance que parce que le port gRPC
 * n'est joignable que depuis le réseau interne (jamais exposé publiquement).
 */
export function clientIpFrom(metadata: Metadata, peer: string): string {
  const forwarded = metadata.get("x-client-ip")[0];
  if (typeof forwarded === "string" && isIP(forwarded.trim()) !== 0) return forwarded.trim();
  const match = /^ipv[46]:(?:\[([^\]]+)\]|([^:]+)):\d+$/.exec(peer);
  return match?.[1] ?? match?.[2] ?? peer;
}

export function authorize(access: Access, auth: AuthContext | null): void {
  if (access === "public") return;
  if (!auth) throw unauthenticated();
  if (access === "authenticated") return;
  if (!access.includes(auth.role)) throw permissionDenied();
}

/**
 * Fabrique de handlers unaires. Chaque appel traverse, dans cet ordre :
 *   identifiant de requête → limitation de débit → authentification → autorisation (RBAC) → handler → erreurs.
 * Les erreurs inattendues ne fuient jamais : le client reçoit INTERNAL "internal_error" + l'identifiant de requête.
 */
export function createUnary(deps: HandlerDeps) {
  return function unary<D extends UnaryDefinition>(
    definition: D,
    handler: (request: ReqOf<D>, ctx: RequestContext) => Promise<ResOf<D>>,
  ): handleUnaryCall<ReqOf<D>, ResOf<D>> {
    // Échoue au démarrage (et non au premier appel) si une méthode n'a pas de politique d'accès.
    const policy = policyFor(definition.path);

    return (call, callback) => {
      const startedAt = performance.now();
      const requestId = requestIdFrom(call.metadata);
      const clientIp = clientIpFrom(call.metadata, call.getPeer());
      const baseLog = deps.logger.child({ requestId, method: definition.path });

      void (async () => {
        let auth: AuthContext | null = null;
        try {
          await deps.rateLimiter.consume(policy.limit, `${clientIp}|${definition.path}`);
          try {
            auth = await deps.authenticator(call.metadata);
          } catch (err) {
            // Méthode publique + jeton expiré/invalide : on traite l'appelant comme anonyme au lieu d'échouer
            // (sinon une page publique casserait dès que le jeton d'un visiteur connecté expire).
            const anonymousOk =
              policy.access === "public" && err instanceof AppError && err.code === status.UNAUTHENTICATED;
            if (!anonymousOk) throw err;
          }
          authorize(policy.access, auth);

          const log = baseLog.child({ userId: auth?.userId });
          const response = await handler(call.request, { requestId, auth, clientIp, log });

          const trailer = new Metadata();
          trailer.set(REQUEST_ID_METADATA_KEY, requestId);
          callback(null, response, trailer);
          baseLog.info(
            { code: status[status.OK], durationMs: Math.round(performance.now() - startedAt) },
            "grpc",
          );
        } catch (err) {
          const { error, internal } = toServiceError(err, requestId);
          callback(error, null);
          const fields = {
            code: status[error.code ?? status.UNKNOWN],
            durationMs: Math.round(performance.now() - startedAt),
            userId: auth?.userId,
          };
          if (internal) baseLog.error({ ...fields, err }, "grpc");
          else baseLog.info(fields, "grpc");
        }
      })();
    };
  };
}

export type UnaryFactory = ReturnType<typeof createUnary>;
