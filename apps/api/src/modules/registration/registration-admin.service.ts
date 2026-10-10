import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import type { Logger } from "pino";
import {
  RegistrationDecision,
  RegistrationServiceService,
  type ContactMessage,
  type PfeRequest,
  type Registration,
} from "@center/proto-gen/registration/v1/registration";
import { decideRegistrationInputSchema } from "@center/shared";
import { z } from "zod";
import { actorId, callerLocale } from "../../common/caller";
import { audit } from "../../common/audit";
import type { EmailProvider } from "../../common/email";
import { inboxStatusMap, levelMap, localeMap, registrationStatusMap } from "../../common/enums";
import { alreadyExists, failedPrecondition, notFound, validationError } from "../../common/errors";
import { normalizePage, pageInfo } from "../../common/format";
import type { Prisma, PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import {
  EnrollmentStatus,
  NotificationType,
  RegistrationStatus,
  Role,
  SessionStatus,
  UserStatus,
  type Locale,
} from "../../generated/prisma/enums";
import type { UnaryFactory } from "../../grpc/handler";
import { ACTIVATION_TTL_MS, createOneTimeToken } from "../auth/auth.service";
import { sendActivationLink } from "../auth/activation-mail";
import { localesToLoad, pickByLocale } from "../course/course.mapper";

const uuidSchema = z.object({ id: z.uuid("invalid_value") });
const DECISIONS = {
  [RegistrationDecision.REGISTRATION_DECISION_ACCEPT]: "ACCEPT",
  [RegistrationDecision.REGISTRATION_DECISION_REJECT]: "REJECT",
  [RegistrationDecision.REGISTRATION_DECISION_WAITLIST]: "WAITLIST",
} as const;
/** Seules les demandes en attente (ou en liste d'attente) peuvent encore être décidées. */
const DECIDABLE: RegistrationStatus[] = [RegistrationStatus.PENDING, RegistrationStatus.WAITLIST];

const registrationInclude = (locales: Locale[]) =>
  ({
    course: { select: { slug: true, translations: { where: { locale: { in: locales } }, select: { locale: true, title: true } } } },
  }) satisfies Prisma.RegistrationInclude;
type RegistrationRow = Prisma.RegistrationGetPayload<{ include: ReturnType<typeof registrationInclude> }>;

function toProtoRegistration(row: RegistrationRow, locale: Locale): Registration {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    age: row.age,
    educationLevel: row.educationLevel,
    institution: row.institution ?? undefined,
    courseId: row.courseId,
    courseTitle: pickByLocale(row.course.translations, locale)?.title ?? row.course.slug,
    sessionId: row.sessionId ?? undefined,
    level: levelMap.toProto(row.level),
    hasOwnLaptop: row.hasOwnLaptop,
    message: row.message ?? undefined,
    locale: localeMap.toProto(row.locale),
    status: registrationStatusMap.toProto(row.status),
    adminNote: row.adminNote ?? undefined,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt ?? undefined,
  };
}

export function buildRegistrationAdminHandlers(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  email: EmailProvider;
  siteUrl: string;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;
  const S = RegistrationServiceService;

  async function load(id: string, locale: Locale) {
    const row = await prisma.registration.findUnique({ where: { id }, include: registrationInclude(localesToLoad(locale)) });
    if (!row) throw notFound();
    return row;
  }

  const toPfe = (r: { id: string; name: string; email: string; phone: string | null; topic: string; message: string | null; status: Parameters<typeof inboxStatusMap.toProto>[0]; createdAt: Date }): PfeRequest => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone ?? undefined, topic: r.topic, message: r.message ?? undefined,
    status: inboxStatusMap.toProto(r.status), createdAt: r.createdAt,
  });
  const toContact = (r: { id: string; name: string; email: string; subject: string; message: string; status: Parameters<typeof inboxStatusMap.toProto>[0]; createdAt: Date }): ContactMessage => ({
    id: r.id, name: r.name, email: r.email, subject: r.subject, message: r.message, status: inboxStatusMap.toProto(r.status), createdAt: r.createdAt,
  });

  return {
    listRegistrations: unary(S.listRegistrations, async (req, ctx) => {
      const locale = await callerLocale(prisma, ctx, req.locale);
      const params = normalizePage(req.page, 20, 100);
      const status = registrationStatusMap.toDb(req.status);
      const query = req.query?.trim().slice(0, 100);
      const courseId = req.courseId?.trim();
      const sessionId = req.sessionId?.trim();
      for (const [field, value] of [["courseId", courseId], ["sessionId", sessionId]] as const) {
        if (value && !z.uuid().safeParse(value).success) throw validationError([{ field, code: "invalid_value" }]);
      }
      const where: Prisma.RegistrationWhereInput = {
        ...(status && { status }),
        ...(courseId && { courseId }),
        ...(sessionId && { sessionId }),
        ...(query && {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }),
      };
      const [rows, total] = await Promise.all([
        prisma.registration.findMany({ where, include: registrationInclude(localesToLoad(locale)), orderBy: { createdAt: "desc" }, skip: params.skip, take: params.pageSize }),
        prisma.registration.count({ where }),
      ]);
      return { registrations: rows.map((r) => toProtoRegistration(r, locale)), pageInfo: pageInfo(params, total) };
    }),

    getRegistration: unary(S.getRegistration, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const locale = await callerLocale(prisma, ctx, req.locale);
      return { registration: toProtoRegistration(await load(id, locale), locale) };
    }),

    decideRegistration: unary(S.decideRegistration, async (req, ctx) => {
      const decision = DECISIONS[req.decision as keyof typeof DECISIONS];
      const input = parseInput(decideRegistrationInputSchema, {
        id: req.id,
        decision,
        sessionId: req.sessionId?.trim() || undefined,
        adminNote: req.adminNote,
      });
      const locale = await callerLocale(prisma, ctx, req.locale);
      const at = now();
      const outcome: { activation?: { email: string; locale: Locale; token: string } } = {};

      await prisma.$transaction(async (tx) => {
        // Verrou : deux décisions simultanées sur la même demande ne peuvent pas toutes deux réussir.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`decide|${input.id}`}))`;
        const reg = await tx.registration.findUnique({ where: { id: input.id } });
        if (!reg) throw notFound();
        if (!DECIDABLE.includes(reg.status)) throw failedPrecondition("registration_already_decided");

        let studentUserId: string | undefined;
        let studentId: string | undefined;
        let sessionId = reg.sessionId;
        let status: RegistrationStatus;

        if (input.decision === "ACCEPT") {
          sessionId = input.sessionId ?? reg.sessionId;
          if (!sessionId) throw validationError([{ field: "sessionId", code: "required" }]);
          const session = await tx.courseSession.findUnique({
            where: { id: sessionId },
            select: { id: true, courseId: true, status: true, capacity: true },
          });
          if (!session || session.courseId !== reg.courseId) throw validationError([{ field: "sessionId", code: "invalid_value" }]);
          if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.CANCELLED) throw failedPrecondition("session_closed");
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seats|${session.id}`}))`;
          const taken = await tx.enrollment.count({ where: { sessionId: session.id, status: EnrollmentStatus.ACTIVE } });
          if (session.capacity !== null && taken >= session.capacity) throw failedPrecondition("session_full");

          // Compte étudiant : existant (même e-mail) ou créé à l'instant avec un lien d'activation.
          let user = await tx.user.findUnique({ where: { email: reg.email }, include: { student: { select: { id: true } } } });
          if (user) {
            if (user.role !== Role.STUDENT || !user.student) throw failedPrecondition("email_belongs_to_staff");
            if (user.deletedAt || user.status === UserStatus.SUSPENDED) throw failedPrecondition("account_unavailable");
          } else {
            user = await tx.user.create({
              data: {
                email: reg.email, firstName: reg.firstName, lastName: reg.lastName, locale: reg.locale,
                role: Role.STUDENT, status: UserStatus.PENDING_ACTIVATION,
                student: { create: { phone: reg.phone, age: reg.age, educationLevel: reg.educationLevel, institution: reg.institution, hasOwnLaptop: reg.hasOwnLaptop } },
              },
              include: { student: { select: { id: true } } },
            });
            outcome.activation = { email: user.email, locale: user.locale, token: await createOneTimeToken(tx, user.id, ACTIVATION_TTL_MS, at) };
          }
          studentUserId = user.id;
          studentId = user.student!.id;

          if (await tx.enrollment.findUnique({ where: { studentId_sessionId: { studentId, sessionId: session.id } }, select: { id: true } })) {
            throw alreadyExists("already_enrolled");
          }
          await tx.enrollment.create({ data: { studentId, sessionId: session.id, registrationId: reg.id, status: EnrollmentStatus.ACTIVE } });
          if (session.capacity !== null && taken + 1 >= session.capacity && session.status === SessionStatus.OPEN) {
            await tx.courseSession.update({ where: { id: session.id }, data: { status: SessionStatus.FULL } });
          }
          status = RegistrationStatus.ACCEPTED;
        } else {
          status = input.decision === "REJECT" ? RegistrationStatus.REJECTED : RegistrationStatus.WAITLIST;
          const known = await tx.user.findUnique({ where: { email: reg.email }, select: { id: true, role: true } });
          if (known?.role === Role.STUDENT) studentUserId = known.id;
        }

        await tx.registration.update({
          where: { id: reg.id },
          data: {
            status, sessionId, adminNote: input.adminNote ?? reg.adminNote,
            decidedAt: status === RegistrationStatus.WAITLIST ? null : at,
            ...(studentId && { studentId }),
          },
        });
        if (studentUserId) {
          await tx.notification.create({
            data: { userId: studentUserId, type: NotificationType.REGISTRATION_DECISION, payload: { registrationId: reg.id, decision: input.decision } },
          });
        }
        await audit(tx, actorId(ctx), "registration.decide", "Registration", reg.id, { decision: input.decision, sessionId: sessionId ?? null });
      });

      if (outcome.activation) sendActivationLink(deps, outcome.activation, outcome.activation.token, ctx.log as Logger);
      return { registration: toProtoRegistration(await load(input.id, locale), locale) };
    }),

    listPfeRequests: unary(S.listPfeRequests, async (req) => {
      const params = normalizePage(req.page, 20, 100);
      const status = inboxStatusMap.toDb(req.status);
      const where = status ? { status } : {};
      const [rows, total] = await Promise.all([
        prisma.pfeRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: params.skip, take: params.pageSize }),
        prisma.pfeRequest.count({ where }),
      ]);
      return { requests: rows.map(toPfe), pageInfo: pageInfo(params, total) };
    }),

    setPfeRequestStatus: unary(S.setPfeRequestStatus, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const status = inboxStatusMap.toDb(req.status);
      if (!status) throw validationError([{ field: "status", code: "invalid_value" }]);
      if (!(await prisma.pfeRequest.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.pfeRequest.update({ where: { id }, data: { status } });
        await audit(tx, actorId(ctx), "pfe.status", "PfeRequest", id, { status });
        return updated;
      });
      return { request: toPfe(row) };
    }),

    listContactMessages: unary(S.listContactMessages, async (req) => {
      const params = normalizePage(req.page, 20, 100);
      const status = inboxStatusMap.toDb(req.status);
      const where = status ? { status } : {};
      const [rows, total] = await Promise.all([
        prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip: params.skip, take: params.pageSize }),
        prisma.contactMessage.count({ where }),
      ]);
      return { messages: rows.map(toContact), pageInfo: pageInfo(params, total) };
    }),

    setContactMessageStatus: unary(S.setContactMessageStatus, async (req, ctx) => {
      const { id } = parseInput(uuidSchema, { id: req.id });
      const status = inboxStatusMap.toDb(req.status);
      if (!status) throw validationError([{ field: "status", code: "invalid_value" }]);
      if (!(await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } }))) throw notFound();
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.contactMessage.update({ where: { id }, data: { status } });
        await audit(tx, actorId(ctx), "contact.status", "ContactMessage", id, { status });
        return updated;
      });
      return { message: toContact(row) };
    }),
  };
}
