import { credentials, Metadata, type CallOptions, type ClientUnaryCall, type ServiceError } from "@grpc/grpc-js";
import { randomUUID } from "node:crypto";
import { AdminServiceClient } from "@center/proto-gen/admin/v1/admin";
import { PaymentServiceClient } from "@center/proto-gen/payment/v1/payment";
import { AuthServiceClient } from "@center/proto-gen/auth/v1/auth";
import { CourseServiceClient } from "@center/proto-gen/course/v1/course";
import { NotificationServiceClient } from "@center/proto-gen/notification/v1/notification";
import { StudentServiceClient } from "@center/proto-gen/student/v1/student";
import { TrainerServiceClient } from "@center/proto-gen/trainer/v1/trainer";
import { UserServiceClient } from "@center/proto-gen/user/v1/user";
import { RegistrationServiceClient } from "@center/proto-gen/registration/v1/registration";
import { SiteServiceClient } from "@center/proto-gen/site/v1/site";
import { getEnv } from "../env";
import { toApiError } from "./errors";

/**
 * Clients gRPC (une seule connexion HTTP/2 réutilisée par service).
 * Ils ne s'exécutent QUE côté serveur : le navigateur ne parle jamais gRPC.
 * TODO Phase 12 : TLS entre le site et l'API si les deux ne sont pas sur le même réseau privé.
 */
type Clients = {
  auth: AuthServiceClient;
  course: CourseServiceClient;
  registration: RegistrationServiceClient;
  site: SiteServiceClient;
  student: StudentServiceClient;
  user: UserServiceClient;
  trainer: TrainerServiceClient;
  notification: NotificationServiceClient;
  admin: AdminServiceClient;
  payment: PaymentServiceClient;
};

const globalForGrpc = globalThis as unknown as { __centerGrpc?: Clients };

export function clients(): Clients {
  if (!globalForGrpc.__centerGrpc) {
    const target = getEnv().GRPC_API_URL;
    const creds = credentials.createInsecure();
    const options = {
      "grpc.keepalive_time_ms": 30_000,
      "grpc.keepalive_permit_without_calls": 1,
      // Après un redémarrage de l'API, se reconnecter en quelques secondes (défaut gRPC : jusqu'à 2 minutes).
      "grpc.initial_reconnect_backoff_ms": 250,
      "grpc.min_reconnect_backoff_ms": 250,
      "grpc.max_reconnect_backoff_ms": 3_000,
    };
    globalForGrpc.__centerGrpc = {
      auth: new AuthServiceClient(target, creds, options),
      course: new CourseServiceClient(target, creds, options),
      registration: new RegistrationServiceClient(target, creds, options),
      site: new SiteServiceClient(target, creds, options),
      student: new StudentServiceClient(target, creds, options),
      user: new UserServiceClient(target, creds, options),
      trainer: new TrainerServiceClient(target, creds, options),
      notification: new NotificationServiceClient(target, creds, options),
      admin: new AdminServiceClient(target, creds, options),
      payment: new PaymentServiceClient(target, creds, options),
    };
  }
  return globalForGrpc.__centerGrpc;
}

export type CallContext = {
  /** IP du visiteur (pour la limitation de débit côté API). */
  clientIp?: string;
  /** Jeton d'accès à transmettre (Authorization: Bearer). */
  accessToken?: string;
  requestId?: string;
};

export function buildMetadata(ctx: CallContext = {}): Metadata {
  const md = new Metadata();
  // Si la connexion est en cours de rétablissement, attendre (dans la limite du délai) plutôt qu'échouer tout de suite.
  md.setOptions({ waitForReady: true });
  md.set("x-request-id", ctx.requestId ?? randomUUID());
  if (ctx.clientIp) md.set("x-client-ip", ctx.clientIp);
  if (ctx.accessToken) md.set("authorization", `Bearer ${ctx.accessToken}`);
  return md;
}

/**
 * Appel unaire promisifié, avec délai maximum. Utilisation :
 *   await rpc(ctx, (md, opts, cb) => clients().course.listCourses(req, md, opts, cb))
 */
export function rpc<Res>(
  ctx: CallContext,
  invoke: (
    metadata: Metadata,
    options: Partial<CallOptions>,
    callback: (err: ServiceError | null, response: Res) => void,
  ) => ClientUnaryCall,
): Promise<Res> {
  const options: Partial<CallOptions> = { deadline: Date.now() + getEnv().GRPC_TIMEOUT_MS };
  return new Promise<Res>((resolve, reject) => {
    invoke(buildMetadata(ctx), options, (err, response) => {
      if (err) reject(toApiError(err));
      else resolve(response);
    });
  });
}
