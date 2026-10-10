import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { RegistrationServiceService } from "@center/proto-gen/registration/v1/registration";
import {
  contactMessageInputSchema,
  pfeRequestInputSchema,
  registrationInputSchema,
} from "@center/shared";
import { levelMap, localeMap, registrationStatusMap } from "../../common/enums";
import { alreadyExists, failedPrecondition, notFound, validationError } from "../../common/errors";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import {
  CourseStatus,
  EnrollmentStatus,
  NotificationType,
  RegistrationStatus,
  Role,
  SessionStatus,
} from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";

/** Une demande encore "vivante" bloque une nouvelle demande identique (anti-doublon / anti-spam). */
const ACTIVE_REGISTRATION_STATUSES = [
  RegistrationStatus.PENDING,
  RegistrationStatus.ACCEPTED,
  RegistrationStatus.WAITLIST,
];
/** On peut demander une place sur une session planifiée, ouverte ou complète (liste d'attente). */
const REGISTERABLE_SESSION_STATUSES: SessionStatus[] = [
  SessionStatus.PLANNED,
  SessionStatus.OPEN,
  SessionStatus.FULL,
];

export function buildRegistrationService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;

  return {
    submitRegistration: unary(RegistrationServiceService.submitRegistration, async (req, ctx) => {
      const input = parseInput(registrationInputSchema, {
        firstName: req.firstName,
        lastName: req.lastName,
        email: req.email,
        phone: req.phone,
        age: req.age,
        educationLevel: req.educationLevel,
        institution: req.institution,
        courseSlug: req.courseSlug,
        sessionId: req.sessionId,
        level: levelMap.toDb(req.level),
        hasOwnLaptop: req.hasOwnLaptop,
        message: req.message,
        consentGiven: req.consentGiven,
        locale: localeMap.toDb(req.locale),
      });

      const registration = await prisma.$transaction(async (tx) => {
        // Seules les formations publiées acceptent des inscriptions.
        const course = await tx.course.findFirst({
          where: { slug: input.courseSlug, status: CourseStatus.PUBLISHED, deletedAt: null },
          select: { id: true, slug: true },
        });
        if (!course) throw notFound("course_not_found");

        // Verrou applicatif par (e-mail, formation) : deux envois simultanés ne créent pas de doublon.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.email}|${course.id}`}))`;

        const duplicate = await tx.registration.findFirst({
          where: {
            email: input.email,
            courseId: course.id,
            status: { in: ACTIVE_REGISTRATION_STATUSES },
          },
          select: { id: true },
        });
        if (duplicate) throw alreadyExists("registration_already_exists");

        let status: RegistrationStatus = RegistrationStatus.PENDING;
        if (input.sessionId) {
          const session = await tx.courseSession.findUnique({
            where: { id: input.sessionId },
            select: {
              courseId: true,
              status: true,
              capacity: true,
              _count: { select: { enrollments: { where: { status: EnrollmentStatus.ACTIVE } } } },
            },
          });
          if (!session || session.courseId !== course.id) {
            throw validationError([{ field: "sessionId", code: "invalid_value" }]);
          }
          if (!REGISTERABLE_SESSION_STATUSES.includes(session.status)) {
            throw failedPrecondition("session_closed");
          }
          const isFull =
            session.status === SessionStatus.FULL ||
            (session.capacity !== null && session._count.enrollments >= session.capacity);
          if (isFull) status = RegistrationStatus.WAITLIST;
        }

        const created = await tx.registration.create({
          data: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            age: input.age,
            educationLevel: input.educationLevel,
            institution: input.institution,
            courseId: course.id,
            sessionId: input.sessionId,
            level: input.level,
            hasOwnLaptop: input.hasOwnLaptop,
            message: input.message,
            locale: input.locale,
            // Date de consentement fixée par le serveur : on ne fait pas confiance à l'horloge du client.
            consentAt: now(),
            status,
          },
        });

        // Notification pour tous les administrateurs. Pas de donnée personnelle dans le payload.
        await tx.notification.create({
          data: {
            audience: Role.ADMIN,
            type: NotificationType.NEW_REGISTRATION,
            payload: { registrationId: created.id, courseSlug: course.slug, status },
          },
        });
        return created;
      });

      // TODO (Phase 12) : e-mail à l'administration et e-mail de confirmation au candidat.
      ctx.log.info({ registrationId: registration.id, status: registration.status }, "registration submitted");
      return {
        registrationId: registration.id,
        status: registrationStatusMap.toProto(registration.status),
        receivedAt: registration.createdAt,
      };
    }),

    requestPfeSupport: unary(RegistrationServiceService.requestPfeSupport, async (req, ctx) => {
      const input = parseInput(pfeRequestInputSchema, {
        name: req.name,
        email: req.email,
        phone: req.phone,
        topic: req.topic,
        message: req.message,
        consentGiven: req.consentGiven,
      });
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.pfeRequest.create({
          data: {
            name: input.name,
            email: input.email,
            phone: input.phone,
            topic: input.topic,
            message: input.message,
            consentAt: now(),
          },
        });
        await tx.notification.create({
          data: {
            audience: Role.ADMIN,
            type: NotificationType.NEW_PFE_REQUEST,
            payload: { pfeRequestId: row.id },
          },
        });
        return row;
      });
      ctx.log.info({ pfeRequestId: created.id }, "pfe request submitted");
      return { requestId: created.id, receivedAt: created.createdAt };
    }),

    submitContactMessage: unary(RegistrationServiceService.submitContactMessage, async (req, ctx) => {
      const input = parseInput(contactMessageInputSchema, {
        name: req.name,
        email: req.email,
        subject: req.subject,
        message: req.message,
        consentGiven: req.consentGiven,
      });
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.contactMessage.create({
          data: {
            name: input.name,
            email: input.email,
            subject: input.subject,
            message: input.message,
            consentAt: now(),
          },
        });
        await tx.notification.create({
          data: {
            audience: Role.ADMIN,
            type: NotificationType.NEW_CONTACT_MESSAGE,
            payload: { contactMessageId: row.id },
          },
        });
        return row;
      });
      ctx.log.info({ contactMessageId: created.id }, "contact message submitted");
      return { messageId: created.id, receivedAt: created.createdAt };
    }),
  };
}
