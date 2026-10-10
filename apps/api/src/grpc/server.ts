import { Server, ServerCredentials, status, type UntypedServiceImplementation } from "@grpc/grpc-js";
import type { Logger } from "pino";
import { AdminServiceService } from "@center/proto-gen/admin/v1/admin";
import { AuthServiceService } from "@center/proto-gen/auth/v1/auth";
import { CourseServiceService } from "@center/proto-gen/course/v1/course";
import { NotificationServiceService } from "@center/proto-gen/notification/v1/notification";
import { PaymentServiceService } from "@center/proto-gen/payment/v1/payment";
import { RegistrationServiceService } from "@center/proto-gen/registration/v1/registration";
import { SiteServiceService } from "@center/proto-gen/site/v1/site";
import { StudentServiceService } from "@center/proto-gen/student/v1/student";
import { TrainerServiceService } from "@center/proto-gen/trainer/v1/trainer";
import { UserServiceService } from "@center/proto-gen/user/v1/user";
import { createJwtAuthenticator, type Authenticator } from "../common/auth";
import type { EmailProvider } from "../common/email";
import type { PrismaClient } from "../common/prisma";
import { createRateLimiter, type RateLimiter } from "../common/rate-limit";
import type { JwtService } from "../common/tokens";
import { buildAdminService } from "../modules/admin/admin.service";
import { buildPaymentService } from "../modules/payment/payment.service";
import { buildAuthService } from "../modules/auth/auth.service";
import type { SessionConfig } from "../modules/auth/session";
import { buildCourseAdminHandlers } from "../modules/course/course-admin.service";
import { buildCourseService } from "../modules/course/course.service";
import { buildRegistrationAdminHandlers } from "../modules/registration/registration-admin.service";
import { buildRegistrationService } from "../modules/registration/registration.service";
import { buildNotificationService } from "../modules/notification/notification.service";
import { buildStudentService } from "../modules/student/student.service";
import { buildTrainerService } from "../modules/trainer/trainer.service";
import { buildUserService } from "../modules/user/user.service";
import { buildSiteAdminHandlers } from "../modules/site/site-admin";
import { buildSiteService } from "../modules/site/site.service";
import { AppError } from "../common/errors";
import { createUnary, type UnaryDefinition, type UnaryFactory } from "./handler";

export type GrpcServerOptions = {
  prisma: PrismaClient;
  logger: Logger;
  /** Authentification : JWT d'accès, durées de session, envoi d'e-mails et URL publique du site. */
  auth: { jwt: JwtService; session: SessionConfig; email: EmailProvider; siteUrl: string };
  /** Remplace la vérification JWT (tests uniquement). */
  authenticator?: Authenticator;
  rateLimiter?: RateLimiter;
  /** Horloge injectable (tests). */
  now?: () => Date;
};

/**
 * Complète une implémentation partielle : chaque méthode du contrat sans handler reçoit un handler qui répond
 * UNIMPLEMENTED, mais seulement APRÈS la chaîne de contrôle (limitation de débit, authentification, RBAC).
 * Sans cela, grpc-js répondrait UNIMPLEMENTED avant tout contrôle d'accès, y compris à un visiteur anonyme.
 */
function withUnimplementedStubs(
  unary: UnaryFactory,
  definition: Record<string, UnaryDefinition>,
  implementation: UntypedServiceImplementation = {},
): UntypedServiceImplementation {
  const complete: UntypedServiceImplementation = { ...implementation };
  for (const [name, method] of Object.entries(definition)) {
    complete[name] ??= unary(method, async () => {
      throw new AppError(status.UNIMPLEMENTED, "not_implemented");
    });
  }
  return complete;
}

/**
 * Assemble le serveur gRPC. TOUS les services du contrat sont enregistrés : les méthodes pas encore
 * implémentées (admin, étudiant, formateur...) répondent UNIMPLEMENTED jusqu'à leur phase, après les contrôles d'accès.
 */
export function createGrpcServer(options: GrpcServerOptions): Server {
  const { prisma, logger, now } = options;
  const unary = createUnary({
    logger,
    authenticator: options.authenticator ?? createJwtAuthenticator({ jwt: options.auth.jwt, prisma }),
    rateLimiter: options.rateLimiter ?? createRateLimiter(),
  });

  // Messages limités à 1 Mo : aucun formulaire du site n'a besoin de plus.
  const server = new Server({ "grpc.max_receive_message_length": 1024 * 1024 });
  const register = (
    definition: Record<string, UnaryDefinition>,
    implementation?: UntypedServiceImplementation,
  ) => server.addService(definition as never, withUnimplementedStubs(unary, definition, implementation));

  register(AuthServiceService, buildAuthService({ prisma, unary, now, ...options.auth }));
  register(CourseServiceService, { ...buildCourseService({ prisma, unary, now }), ...buildCourseAdminHandlers({ prisma, unary }) });
  register(RegistrationServiceService, {
    ...buildRegistrationService({ prisma, unary, now }),
    ...buildRegistrationAdminHandlers({ prisma, unary, now, email: options.auth.email, siteUrl: options.auth.siteUrl }),
  });
  register(SiteServiceService, { ...buildSiteService({ prisma, unary }), ...buildSiteAdminHandlers({ prisma, unary }) });
  register(UserServiceService, buildUserService({ prisma, unary }));
  register(StudentServiceService, buildStudentService({ prisma, unary, now }));
  register(NotificationServiceService, buildNotificationService({ prisma, unary, now }));
  register(TrainerServiceService, buildTrainerService({ prisma, unary, now }));
  register(PaymentServiceService, buildPaymentService({ prisma, unary, now }));
  register(AdminServiceService, buildAdminService({ prisma, unary, now, email: options.auth.email, siteUrl: options.auth.siteUrl }));
  return server;
}

/** Démarre l'écoute et renvoie le port réellement utilisé (utile avec le port 0 en test). */
export function listen(server: Server, address: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // TLS/mTLS en production (Phase 11/12). Insecure uniquement sur réseau interne de dev.
    server.bindAsync(address, ServerCredentials.createInsecure(), (error, port) => {
      if (error) reject(error);
      else resolve(port);
    });
  });
}
