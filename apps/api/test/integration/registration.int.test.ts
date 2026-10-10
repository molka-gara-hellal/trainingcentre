import { status, type ServiceError } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CourseLevel, Locale } from "@center/proto-gen/common/v1/common";
import {
  RegistrationStatus,
  RequestPfeSupportRequest,
  SubmitContactMessageRequest,
  SubmitRegistrationRequest,
  type RequestPfeSupportResponse,
  type SubmitContactMessageResponse,
  type SubmitRegistrationResponse,
} from "@center/proto-gen/registration/v1/registration";
import { VALIDATION_ERRORS_METADATA_KEY } from "../../src/common/errors";
import { enroll, NOW, seedCatalog } from "../fixtures";
import { call, resetDatabase, startTestApp, type TestApp } from "../helpers";

let app: TestApp;
let fixtures: Awaited<ReturnType<typeof seedCatalog>>;

beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app.prisma);
  fixtures = await seedCatalog(app.prisma);
});

const validRegistration = (overrides: Partial<SubmitRegistrationRequest> = {}) =>
  SubmitRegistrationRequest.fromPartial({
    firstName: "Amina",
    lastName: "Test",
    email: "Amina.Test@Example.com",
    phone: "+216 12 345 678",
    age: 20,
    educationLevel: "Licence 3",
    institution: "Établissement test",
    courseSlug: "python-test",
    level: CourseLevel.COURSE_LEVEL_BEGINNER,
    hasOwnLaptop: true,
    message: "",
    consentGiven: true,
    locale: Locale.LOCALE_FR,
    ...overrides,
  });

const submit = (req: SubmitRegistrationRequest) =>
  call<SubmitRegistrationResponse>((cb) => app.clients.registration.submitRegistration(req, cb));

const validationFields = (error: ServiceError): Record<string, string> => {
  const raw = error.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0];
  const list = JSON.parse(String(raw)) as Array<{ field: string; code: string }>;
  return Object.fromEntries(list.map((e) => [e.field, e.code]));
};

describe("RegistrationService.submitRegistration", () => {
  it("enregistre la demande (PENDING), normalise l'e-mail et fixe le consentement côté serveur", async () => {
    const res = await submit(validRegistration());
    expect(res.status).toBe(RegistrationStatus.REGISTRATION_STATUS_PENDING);

    const row = await app.prisma.registration.findUniqueOrThrow({ where: { id: res.registrationId } });
    expect(row).toMatchObject({
      email: "amina.test@example.com",
      firstName: "Amina",
      status: "PENDING",
      level: "BEGINNER",
      hasOwnLaptop: true,
      sessionId: null,
      institution: "Établissement test",
      message: null, // chaîne vide → absent
    });
    expect(row.consentAt.toISOString()).toBe(NOW.toISOString());
  });

  it("notifie les administrateurs sans donnée personnelle dans la notification", async () => {
    const res = await submit(validRegistration());
    const notifications = await app.prisma.notification.findMany();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ audience: "ADMIN", userId: null, type: "NEW_REGISTRATION", readAt: null });
    expect(notifications[0]!.payload).toMatchObject({ registrationId: res.registrationId, courseSlug: "python-test" });
    expect(JSON.stringify(notifications[0]!.payload)).not.toMatch(/amina|example\.com|216/i);
  });

  it("rejette les données invalides avec la liste {champ, code} et n'écrit RIEN en base", async () => {
    const error = await submit(validRegistration({ age: 5, email: "pas-un-email", consentGiven: false, phone: "abc" })).catch(
      (e: ServiceError) => e,
    );
    expect(error).toMatchObject({ code: status.INVALID_ARGUMENT, details: "validation_failed" });
    expect(validationFields(error as ServiceError)).toEqual({
      age: "out_of_range",
      email: "invalid_email",
      phone: "invalid_phone",
      consentGiven: "consent_required",
    });
    expect(await app.prisma.registration.count()).toBe(0);
    expect(await app.prisma.notification.count()).toBe(0);
  });

  it("exige le niveau informatique (valeur non précisée refusée)", async () => {
    const error = await submit(validRegistration({ level: CourseLevel.COURSE_LEVEL_UNSPECIFIED })).catch((e: ServiceError) => e);
    expect(error).toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(validationFields(error as ServiceError)).toMatchObject({ level: "required" });
  });

  it.each(["brouillon-test", "supprimee-test", "inexistant-test"])(
    "refuse une formation non publiée ou inconnue (%s) : NOT_FOUND",
    async (courseSlug) => {
      await expect(submit(validRegistration({ courseSlug }))).rejects.toMatchObject({
        code: status.NOT_FOUND,
        details: "course_not_found",
      });
      expect(await app.prisma.registration.count()).toBe(0);
    },
  );

  it("refuse un doublon actif (même e-mail + même formation), même avec une casse différente", async () => {
    await submit(validRegistration());
    await expect(submit(validRegistration({ email: "AMINA.TEST@example.COM" }))).rejects.toMatchObject({
      code: status.ALREADY_EXISTS,
      details: "registration_already_exists",
    });
    expect(await app.prisma.registration.count()).toBe(1);
  });

  it("autorise une nouvelle demande après un refus, et pour une autre formation", async () => {
    const first = await submit(validRegistration());
    await expect(submit(validRegistration({ courseSlug: "web-test" }))).resolves.toBeDefined();
    await app.prisma.registration.update({ where: { id: first.registrationId }, data: { status: "REJECTED" } });
    await expect(submit(validRegistration())).resolves.toBeDefined();
  });

  it("n'accepte qu'UNE demande quand 5 identiques arrivent en même temps (pas de doublon par concurrence)", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => submit(validRegistration())));
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(rejected.every((r) => (r.reason as ServiceError).code === status.ALREADY_EXISTS)).toBe(true);
    expect(await app.prisma.registration.count()).toBe(1);
  });

  describe("avec une session", () => {
    it("rattache la demande à une session ouverte avec des places (PENDING)", async () => {
      const session = await app.prisma.courseSession.create({
        data: { courseId: fixtures.courseA.id, status: "OPEN", startDate: new Date("2026-11-01"), capacity: 5 },
      });
      const res = await submit(validRegistration({ sessionId: session.id }));
      expect(res.status).toBe(RegistrationStatus.REGISTRATION_STATUS_PENDING);
      expect((await app.prisma.registration.findUniqueOrThrow({ where: { id: res.registrationId } })).sessionId).toBe(session.id);
    });

    it("place automatiquement en LISTE D'ATTENTE quand la session est complète", async () => {
      const session = await app.prisma.courseSession.create({
        data: { courseId: fixtures.courseA.id, status: "OPEN", startDate: new Date("2026-11-01"), capacity: 2 },
      });
      await enroll(app.prisma, session.id, 2);
      const res = await submit(validRegistration({ sessionId: session.id }));
      expect(res.status).toBe(RegistrationStatus.REGISTRATION_STATUS_WAITLIST);
    });

    it("place en liste d'attente une session marquée FULL, même sans capacité renseignée", async () => {
      const session = await app.prisma.courseSession.create({ data: { courseId: fixtures.courseA.id, status: "FULL" } });
      const res = await submit(validRegistration({ sessionId: session.id }));
      expect(res.status).toBe(RegistrationStatus.REGISTRATION_STATUS_WAITLIST);
    });

    it("refuse une session terminée ou annulée (FAILED_PRECONDITION)", async () => {
      for (const sessionStatus of ["COMPLETED", "CANCELLED", "ONGOING"] as const) {
        const session = await app.prisma.courseSession.create({ data: { courseId: fixtures.courseA.id, status: sessionStatus } });
        await expect(submit(validRegistration({ sessionId: session.id }))).rejects.toMatchObject({
          code: status.FAILED_PRECONDITION,
          details: "session_closed",
        });
      }
    });

    it("refuse la session d'une AUTRE formation et un identifiant mal formé", async () => {
      const other = await app.prisma.courseSession.create({ data: { courseId: fixtures.courseD.id, status: "OPEN" } });
      const wrongCourse = await submit(validRegistration({ sessionId: other.id })).catch((e: ServiceError) => e);
      expect(wrongCourse).toMatchObject({ code: status.INVALID_ARGUMENT });
      expect(validationFields(wrongCourse as ServiceError)).toEqual({ sessionId: "invalid_value" });
      const malformed = await submit(validRegistration({ sessionId: "pas-un-uuid" })).catch((e: ServiceError) => e);
      expect(validationFields(malformed as ServiceError)).toEqual({ sessionId: "invalid_id" });
    });
  });
});

describe("RegistrationService.requestPfeSupport", () => {
  const pfe = (overrides: Partial<RequestPfeSupportRequest> = {}) =>
    call<RequestPfeSupportResponse>((cb) =>
      app.clients.registration.requestPfeSupport(
        RequestPfeSupportRequest.fromPartial({
          name: "Sarra Test",
          email: "sarra@example.com",
          topic: "Application mobile (sujet de test)",
          consentGiven: true,
          ...overrides,
        }),
        cb,
      ),
    );

  it("enregistre la demande, notifie l'administration et fixe le consentement côté serveur", async () => {
    const res = await pfe({ phone: "+216 98 765 432", message: "Bonjour" });
    const row = await app.prisma.pfeRequest.findUniqueOrThrow({ where: { id: res.requestId } });
    expect(row).toMatchObject({ status: "NEW", email: "sarra@example.com", phone: "+216 98 765 432" });
    expect(row.consentAt.toISOString()).toBe(NOW.toISOString());
    expect(await app.prisma.notification.count({ where: { type: "NEW_PFE_REQUEST", audience: "ADMIN" } })).toBe(1);
  });

  it("accepte l'absence de téléphone et refuse l'absence de consentement", async () => {
    await expect(pfe()).resolves.toBeDefined();
    await expect(pfe({ consentGiven: false })).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(await app.prisma.pfeRequest.count()).toBe(1);
  });
});

describe("RegistrationService.submitContactMessage", () => {
  const contact = (overrides: Partial<SubmitContactMessageRequest> = {}) =>
    call<SubmitContactMessageResponse>((cb) =>
      app.clients.registration.submitContactMessage(
        SubmitContactMessageRequest.fromPartial({
          name: "Karim Test",
          email: "karim@example.com",
          subject: "Question",
          message: "Bonjour, ceci est un message de test.",
          consentGiven: true,
          ...overrides,
        }),
        cb,
      ),
    );

  it("enregistre le message et notifie l'administration", async () => {
    const res = await contact();
    expect(await app.prisma.contactMessage.findUniqueOrThrow({ where: { id: res.messageId } })).toMatchObject({ status: "NEW" });
    expect(await app.prisma.notification.count({ where: { type: "NEW_CONTACT_MESSAGE" } })).toBe(1);
  });

  it("nettoie les caractères de contrôle et refuse un message vide ou trop long", async () => {
    const res = await contact({ subject: "Sujet\u0000 avec\u0007 contrôle" });
    expect((await app.prisma.contactMessage.findUniqueOrThrow({ where: { id: res.messageId } })).subject).toBe("Sujet avec contrôle");
    await expect(contact({ message: "   " })).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    await expect(contact({ message: "x".repeat(3001) })).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });

  it("traite le HTML comme du simple texte (stocké tel quel, jamais interprété par l'API)", async () => {
    const res = await contact({ message: "<script>alert(1)</script> bonjour" });
    expect((await app.prisma.contactMessage.findUniqueOrThrow({ where: { id: res.messageId } })).message).toContain("<script>");
  });
});
