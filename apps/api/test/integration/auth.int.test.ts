import { status, type ServiceError } from "@grpc/grpc-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ActivateAccountRequest,
  type ActivateAccountResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  GetMeRequest,
  LoginRequest,
  LogoutRequest,
  RefreshTokenRequest,
  RegisterRequest,
  ResetPasswordRequest,
  type LoginResponse,
  type TokenPair,
} from "@center/proto-gen/auth/v1/auth";
import { Locale } from "@center/proto-gen/common/v1/common";
import { ListAdminCoursesRequest, ListCategoriesRequest } from "@center/proto-gen/course/v1/course";
import { hashPassword } from "../../src/common/password";
import { hashToken } from "../../src/common/tokens";
import { AdminBootstrapError, createAdminAccount } from "../../src/modules/auth/admin-bootstrap";
import { REFRESH_REUSE_GRACE_MS } from "../../src/modules/auth/session";
import { call, metadata, resetDatabase, startTestApp, type TestApp } from "../helpers";

const PASSWORD = "un mot de passe solide";
let app: TestApp;

// Un serveur NEUF par test : quotas d'e-mails et compteurs d'échecs sont en mémoire et ne doivent pas fuiter d'un test à l'autre.
beforeEach(async () => {
  app = await startTestApp();
  await resetDatabase(app.prisma);
});
afterEach(async () => {
  await app.close();
});

// ---------- aides ----------

const bearer = (accessToken: string) => metadata({ authorization: `Bearer ${accessToken}` });
const expectCode = (code: status, message?: string) =>
  message ? expect.objectContaining({ code, details: message }) : expect.objectContaining({ code });

async function createUser(
  overrides: Partial<{ email: string; role: "STUDENT" | "TRAINER" | "ADMIN"; status: "ACTIVE" | "SUSPENDED" | "PENDING_ACTIVATION"; password: string | null }> = {},
) {
  const password = overrides.password === undefined ? PASSWORD : overrides.password;
  return app.prisma.user.create({
    data: {
      email: overrides.email ?? "student@example.com",
      firstName: "Test",
      lastName: "User",
      role: overrides.role ?? "STUDENT",
      status: overrides.status ?? "ACTIVE",
      passwordHash: password === null ? null : await hashPassword(password),
    },
  });
}

const login = (email: string, password = PASSWORD, ip?: string) =>
  call<LoginResponse>((cb) =>
    app.clients.auth.login(LoginRequest.fromPartial({ email, password }), metadata(ip ? { "x-client-ip": ip } : {}), cb),
  );

async function loggedIn(email = "student@example.com", role: "STUDENT" | "ADMIN" = "STUDENT") {
  await createUser({ email, role });
  const response = await login(email);
  return { tokens: response.tokens as TokenPair, user: response.user! };
}

const refresh = (refreshToken: string) =>
  call((cb) => app.clients.auth.refreshToken(RefreshTokenRequest.fromPartial({ refreshToken }), cb));

const tokenFromLastEmail = () => {
  const link = app.emails.at(-1)?.link ?? "";
  return new URL(link).searchParams.get("token") ?? "";
};

const validationErrors = (error: ServiceError) =>
  JSON.parse(String(error.metadata?.get("x-validation-errors")[0] ?? "[]")) as Array<{ field: string; code: string }>;

const register = (email = "nouveau@example.com") =>
  call<object>((cb) =>
    app.clients.auth.register(
      RegisterRequest.fromPartial({ email, firstName: "Nouveau", lastName: "Compte", locale: Locale.LOCALE_FR }),
      cb,
    ),
  );

const forgot = (email: string) =>
  call<object>((cb) => app.clients.auth.forgotPassword(ForgotPasswordRequest.fromPartial({ email }), cb));

const activate = (token: string, password = PASSWORD) =>
  call<ActivateAccountResponse>((cb) => app.clients.auth.activateAccount(ActivateAccountRequest.fromPartial({ token, password }), cb));

// ---------- ouverture et activation de compte ----------

describe("Register + ActivateAccount", () => {
  it("crée un compte en attente SANS mot de passe et envoie un lien d'activation", async () => {
    await expect(register("nouveau@example.com")).resolves.toEqual({});

    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: "nouveau@example.com" }, include: { student: true } });
    expect(user).toMatchObject({ role: "STUDENT", status: "PENDING_ACTIVATION", passwordHash: null });
    expect(user.student).not.toBeNull();

    expect(app.emails).toHaveLength(1);
    expect(app.emails[0]).toMatchObject({ to: "nouveau@example.com", kind: "account_activation", locale: "fr" });
    expect(app.emails[0]?.link).toMatch(/^http:\/\/localhost:3000\/fr\/activer-compte\?token=[A-Za-z0-9_-]{43}$/);
  });

  it("ne stocke que le HASH du jeton d'activation", async () => {
    await register();
    const token = tokenFromLastEmail();
    const rows = await app.prisma.passwordResetToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("répond de la même façon que l'e-mail soit nouveau, en attente ou déjà actif (pas d'énumération)", async () => {
    await createUser({ email: "actif@example.com" });
    const [fresh, active] = [await register("neuf@example.com"), await register("actif@example.com")];
    expect(active).toEqual(fresh);
    expect(app.emails.map((m) => m.to)).toEqual(["neuf@example.com"]); // aucun e-mail pour le compte actif
    expect(await app.prisma.user.count()).toBe(2);
  });

  it("renvoie un NOUVEAU lien si la demande est répétée, et l'ancien lien cesse de fonctionner", async () => {
    await register();
    const first = tokenFromLastEmail();
    await register();
    const second = tokenFromLastEmail();
    expect(second).not.toBe(first);
    await expect(activate(first)).rejects.toSatisfy((e: ServiceError) => validationErrors(e)[0]?.code === "invalid_token");
    await expect(activate(second)).resolves.toBeDefined();
  });

  it("rejette une adresse invalide avec la liste des champs fautifs", async () => {
    const error = await register("pas-un-email").catch((e: ServiceError) => e);
    expect(error).toMatchObject({ code: status.INVALID_ARGUMENT, details: "validation_failed" });
    expect(validationErrors(error as ServiceError)).toEqual([{ field: "email", code: "invalid_email" }]);
  });

  it("n'envoie que 3 e-mails par heure et par adresse (anti-inondation de boîte mail)", async () => {
    for (let i = 0; i < 5; i += 1) await register();
    expect(app.emails).toHaveLength(3);
  });

  it("l'activation définit le mot de passe (argon2id), active le compte et ouvre une session", async () => {
    await register();
    const response = await activate(tokenFromLastEmail(), "mon nouveau mot de passe");
    expect(response.user).toMatchObject({ email: "nouveau@example.com" });
    expect(response.tokens?.accessToken).toBeTruthy();
    expect(response.tokens?.refreshToken).toBeTruthy();

    const user = await app.prisma.user.findUniqueOrThrow({ where: { email: "nouveau@example.com" } });
    expect(user.status).toBe("ACTIVE");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain("mon nouveau mot de passe");
    await expect(login("nouveau@example.com", "mon nouveau mot de passe")).resolves.toBeDefined();
  });

  it("le jeton est à USAGE UNIQUE et un mot de passe trop court ne le consomme pas", async () => {
    await register();
    const token = tokenFromLastEmail();
    const weak = await activate(token, "court").catch((e: ServiceError) => e);
    expect(validationErrors(weak as ServiceError)).toEqual([{ field: "password", code: "password_too_short" }]);

    await expect(activate(token)).resolves.toBeDefined(); // toujours utilisable
    await expect(activate(token)).rejects.toMatchObject({ code: status.INVALID_ARGUMENT }); // plus une 2e fois
  });

  it("refuse un jeton expiré, inconnu ou mal formé avec le même code", async () => {
    await register();
    const token = tokenFromLastEmail();
    await app.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    for (const candidate of [token, "a".repeat(43), "n'importe quoi"]) {
      const error = await activate(candidate).catch((e: ServiceError) => e);
      expect(error).toMatchObject({ code: status.INVALID_ARGUMENT });
      expect(validationErrors(error as ServiceError)[0]?.code).toBe("invalid_token");
    }
  });

  it("un lien d'activation ne sert pas à réinitialiser un mot de passe, et inversement", async () => {
    await register();
    const activation = tokenFromLastEmail();
    await expect(
      call((cb) => app.clients.auth.resetPassword(ResetPasswordRequest.fromPartial({ token: activation, newPassword: PASSWORD }), cb)),
    ).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });

    await createUser({ email: "actif@example.com" });
    app.emails.length = 0;
    await forgot("actif@example.com");
    await expect(activate(tokenFromLastEmail())).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });
});

// ---------- connexion ----------

describe("Login + GetMe", () => {
  it("connecte un utilisateur actif et renvoie son profil sans aucun secret", async () => {
    await createUser();
    const response = await login("student@example.com");
    expect(response.user).toMatchObject({ email: "student@example.com", firstName: "Test" });
    expect(JSON.stringify(response.user)).not.toMatch(/passwordHash|argon2/);
    expect(response.tokens?.accessExpiresAt && response.tokens.accessExpiresAt > new Date()).toBe(true);
    expect((await app.prisma.user.findUniqueOrThrow({ where: { email: "student@example.com" } })).lastLoginAt).not.toBeNull();
  });

  it("accepte l'e-mail quelle que soit la casse", async () => {
    await createUser();
    await expect(login("  Student@EXAMPLE.com ")).resolves.toBeDefined();
  });

  it("répond de façon IDENTIQUE pour mauvais mot de passe, e-mail inconnu, compte en attente et compte suspendu", async () => {
    await createUser({ email: "actif@example.com" });
    await createUser({ email: "attente@example.com", status: "PENDING_ACTIVATION", password: null });
    await createUser({ email: "suspendu@example.com", status: "SUSPENDED" });
    const attempts: Array<[string, string?]> = [
      ["actif@example.com", "mauvais mot de passe"],
      ["inconnu@example.com"],
      ["attente@example.com"],
      ["suspendu@example.com"], // bon mot de passe, mais compte suspendu
    ];
    for (const [email, password] of attempts) {
      await expect(login(email, password)).rejects.toEqual(expectCode(status.UNAUTHENTICATED, "invalid_credentials"));
    }
  });

  it("bloque après 5 échecs pour le couple e-mail + IP, sans bloquer une autre IP", async () => {
    await createUser();
    for (let i = 0; i < 5; i += 1) {
      await expect(login("student@example.com", "faux mot de passe", "203.0.113.10")).rejects.toMatchObject({
        code: status.UNAUTHENTICATED,
      });
    }
    // Même le BON mot de passe est refusé pendant le blocage.
    const blocked = await login("student@example.com", PASSWORD, "203.0.113.10").catch((e: ServiceError) => e);
    expect(blocked).toMatchObject({ code: status.RESOURCE_EXHAUSTED, details: "rate_limited" });
    expect(Number((blocked as ServiceError).metadata?.get("retry-after")[0])).toBeGreaterThanOrEqual(1);

    await expect(login("student@example.com", PASSWORD, "203.0.113.11")).resolves.toBeDefined();
  });

  it("un succès remet le compteur d'échecs à zéro", async () => {
    await createUser();
    for (let i = 0; i < 4; i += 1) await login("student@example.com", "faux", "203.0.113.20").catch(() => undefined);
    await login("student@example.com", PASSWORD, "203.0.113.20");
    for (let i = 0; i < 4; i += 1) {
      await expect(login("student@example.com", "faux", "203.0.113.20")).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    }
  });

  it("GetMe fonctionne avec le jeton d'accès et exige une authentification", async () => {
    const { tokens } = await loggedIn();
    const me = await call<{ user?: { email: string } }>((cb) =>
      app.clients.auth.getMe(GetMeRequest.fromPartial({}), bearer(tokens.accessToken), cb),
    );
    expect(me.user?.email).toBe("student@example.com");
    await expect(call((cb) => app.clients.auth.getMe(GetMeRequest.fromPartial({}), cb))).rejects.toMatchObject({
      code: status.UNAUTHENTICATED,
    });
  });
});

// ---------- jeton d'accès ----------

describe("jeton d'accès (JWT)", () => {
  const getMe = (header: string | undefined) =>
    call((cb) =>
      app.clients.auth.getMe(GetMeRequest.fromPartial({}), metadata(header ? { authorization: header } : {}), cb),
    );

  it("rejette un jeton expiré, falsifié, d'un autre schéma ou mal formé", async () => {
    const { user } = await loggedIn();
    const expired = await app.jwt.signAccessToken({ userId: user.id, role: "STUDENT" }, new Date(Date.now() - 3_600_000));
    const valid = await app.jwt.signAccessToken({ userId: user.id, role: "STUDENT" });
    const tampered = `${valid.token.slice(0, -4)}AAAA`;

    for (const header of [`Bearer ${expired.token}`, `Bearer ${tampered}`, `Basic ${valid.token}`, "Bearer", "Bearer a b", valid.token]) {
      await expect(getMe(header)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    }
    await expect(getMe(`Bearer ${valid.token}`)).resolves.toBeDefined();
  });

  it("sur une méthode PUBLIQUE, un jeton expiré est traité comme anonyme (le catalogue reste lisible)", async () => {
    const { user } = await loggedIn();
    const expired = await app.jwt.signAccessToken({ userId: user.id, role: "STUDENT" }, new Date(Date.now() - 3_600_000));
    await expect(
      call((cb) => app.clients.course.listCategories(ListCategoriesRequest.fromPartial({}), bearer(expired.token), cb)),
    ).resolves.toBeDefined();
  });

  it("un compte SUSPENDU perd l'accès immédiatement, sans attendre l'expiration du jeton", async () => {
    const { tokens, user } = await loggedIn();
    await app.prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expect(getMe(`Bearer ${tokens.accessToken}`)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("un compte supprimé (suppression douce) perd l'accès immédiatement", async () => {
    const { tokens, user } = await loggedIn();
    await app.prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    await expect(getMe(`Bearer ${tokens.accessToken}`)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("le RÔLE vient de la base, pas du jeton : une rétrogradation est immédiate", async () => {
    const { tokens, user } = await loggedIn("admin@example.com", "ADMIN");
    const listAdmin = () =>
      call((cb) => app.clients.course.listAdminCourses(ListAdminCoursesRequest.fromPartial({}), bearer(tokens.accessToken), cb));
    await expect(listAdmin()).resolves.toBeDefined(); // autorisé
    await app.prisma.user.update({ where: { id: user.id }, data: { role: "STUDENT" } });
    await expect(listAdmin()).rejects.toMatchObject({ code: status.PERMISSION_DENIED });
  });
});

// ---------- contrôle d'accès avec de vrais jetons ----------

describe("RBAC de bout en bout", () => {
  const listAdmin = (md = metadata()) =>
    call((cb) => app.clients.course.listAdminCourses(ListAdminCoursesRequest.fromPartial({}), md, cb));

  it("anonyme → UNAUTHENTICATED ; étudiant → PERMISSION_DENIED ; admin → autorisé", async () => {
    await expect(listAdmin()).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    const student = await loggedIn("etudiant@example.com", "STUDENT");
    await expect(listAdmin(bearer(student.tokens.accessToken))).rejects.toMatchObject({ code: status.PERMISSION_DENIED });
    const admin = await loggedIn("admin@example.com", "ADMIN");
    await expect(listAdmin(bearer(admin.tokens.accessToken))).resolves.toBeDefined();
  });
});

// ---------- jetons de rafraîchissement ----------

describe("RefreshToken (rotation, rejeu, expiration)", () => {
  it("échange le jeton contre un nouveau couple et invalide l'ancien (usage unique)", async () => {
    const { tokens } = await loggedIn();
    const rotated = (await refresh(tokens.refreshToken)) as { tokens: TokenPair };
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);
    expect(rotated.tokens.accessToken).not.toBe(tokens.accessToken);
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    await expect(refresh(rotated.tokens.refreshToken)).resolves.toBeDefined();
  });

  it("ne stocke que le hash des refresh tokens", async () => {
    const { tokens } = await loggedIn();
    const rows = await app.prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(tokens.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(tokens.refreshToken);
  });

  it("garde la même famille de session à travers les rotations", async () => {
    const { tokens } = await loggedIn();
    const second = (await refresh(tokens.refreshToken)) as { tokens: TokenPair };
    await refresh(second.tokens.refreshToken);
    const families = new Set((await app.prisma.refreshToken.findMany()).map((r) => r.familyId));
    expect(families.size).toBe(1);
  });

  it("RÉUTILISATION d'un jeton déjà consommé (hors fenêtre de tolérance) → toute la session est révoquée", async () => {
    const { tokens } = await loggedIn();
    const rotated = (await refresh(tokens.refreshToken)) as { tokens: TokenPair };

    // On vieillit la consommation du 1er jeton au-delà de la fenêtre de tolérance.
    await app.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(tokens.refreshToken) },
      data: { revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 5_000) },
    });
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    // Le jeton légitime, pourtant plus récent, est aussi coupé : le vol est présumé.
    await expect(refresh(rotated.tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("deux requêtes quasi simultanées avec le même jeton (fenêtre de tolérance) ne coupent PAS la session", async () => {
    const { tokens } = await loggedIn();
    const rotated = (await refresh(tokens.refreshToken)) as { tokens: TokenPair };
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED }); // refusé…
    await expect(refresh(rotated.tokens.refreshToken)).resolves.toBeDefined(); // …mais la session survit
  });

  it("sous concurrence, UN SEUL des 8 échanges simultanés du même jeton réussit", async () => {
    const { tokens } = await loggedIn();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => refresh(tokens.refreshToken)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Une seule nouvelle ligne a été créée : pas de jeton "fantôme" valide.
    expect(await app.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);
  });

  it("refuse un jeton expiré, inconnu ou mal formé", async () => {
    const { tokens } = await loggedIn();
    await app.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    for (const candidate of [tokens.refreshToken, "a".repeat(43), "n'importe quoi", ""]) {
      await expect(refresh(candidate)).rejects.toEqual(expectCode(status.UNAUTHENTICATED, "unauthenticated"));
    }
  });

  it("refuse (et révoque) la session d'un compte suspendu", async () => {
    const { tokens, user } = await loggedIn();
    await app.prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    expect(await app.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});

// ---------- déconnexion ----------

describe("Logout", () => {
  const logout = (refreshToken: string) =>
    call((cb) => app.clients.auth.logout(LogoutRequest.fromPartial({ refreshToken }), cb));

  it("révoque la session : le refresh token ne fonctionne plus, même après plusieurs rotations", async () => {
    const { tokens } = await loggedIn();
    const rotated = (await refresh(tokens.refreshToken)) as { tokens: TokenPair };
    await expect(logout(rotated.tokens.refreshToken)).resolves.toEqual({});
    await expect(refresh(rotated.tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("est idempotent et ne révèle rien : jeton inconnu, mal formé ou déjà révoqué répondent tous « succès »", async () => {
    const { tokens } = await loggedIn();
    await logout(tokens.refreshToken);
    for (const candidate of [tokens.refreshToken, "a".repeat(43), "n'importe quoi", ""]) {
      await expect(logout(candidate)).resolves.toEqual({});
    }
  });

  it("ne coupe que la session concernée (les autres appareils restent connectés)", async () => {
    await createUser();
    const phone = (await login("student@example.com")).tokens as TokenPair;
    const laptop = (await login("student@example.com")).tokens as TokenPair;
    await logout(phone.refreshToken);
    await expect(refresh(phone.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    await expect(refresh(laptop.refreshToken)).resolves.toBeDefined();
  });
});

// ---------- mot de passe oublié ----------

describe("ForgotPassword + ResetPassword", () => {
  it("répond de la même façon pour une adresse inconnue, active, en attente ou suspendue", async () => {
    await createUser({ email: "actif@example.com" });
    await createUser({ email: "suspendu@example.com", status: "SUSPENDED" });
    const responses = await Promise.all([
      forgot("inconnu@example.com"),
      forgot("actif@example.com"),
      forgot("suspendu@example.com"),
    ]);
    for (const response of responses) expect(response).toEqual({});
    expect(app.emails.map((m) => m.to)).toEqual(["actif@example.com"]); // seul le compte actif reçoit un lien
  });

  it("envoie un lien de réinitialisation à un compte actif et un lien d'ACTIVATION à un compte en attente", async () => {
    await createUser({ email: "actif@example.com" });
    await createUser({ email: "attente@example.com", status: "PENDING_ACTIVATION", password: null });
    await forgot("actif@example.com");
    await forgot("attente@example.com");
    expect(app.emails.map((m) => [m.to, m.kind])).toEqual([
      ["actif@example.com", "password_reset"],
      ["attente@example.com", "account_activation"],
    ]);
    expect(app.emails[0]?.link).toContain("/reinitialiser?token=");
  });

  it("limite à 3 e-mails par heure et par adresse", async () => {
    await createUser();
    for (let i = 0; i < 5; i += 1) await forgot("student@example.com");
    expect(app.emails).toHaveLength(3);
  });

  it("change le mot de passe, ferme TOUTES les sessions et le lien ne sert qu'une fois", async () => {
    await createUser();
    const session = (await login("student@example.com")).tokens as TokenPair;
    await forgot("student@example.com");
    const token = tokenFromLastEmail();

    const reset = (newPassword: string) =>
      call((cb) => app.clients.auth.resetPassword(ResetPasswordRequest.fromPartial({ token, newPassword }), cb));
    await expect(reset("nouveau mot de passe")).resolves.toEqual({});

    await expect(login("student@example.com", PASSWORD)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    await expect(login("student@example.com", "nouveau mot de passe")).resolves.toBeDefined();
    await expect(refresh(session.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    await expect(reset("encore un autre mot de passe")).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });

  it("refuse un lien expiré ou un mot de passe trop court (sans consommer le lien)", async () => {
    await createUser();
    await forgot("student@example.com");
    const token = tokenFromLastEmail();
    const reset = (newPassword: string) =>
      call((cb) => app.clients.auth.resetPassword(ResetPasswordRequest.fromPartial({ token, newPassword }), cb));

    const weak = await reset("court").catch((e: ServiceError) => e);
    expect(validationErrors(weak as ServiceError)).toEqual([{ field: "newPassword", code: "password_too_short" }]);

    await app.prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(reset("nouveau mot de passe")).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });
});

// ---------- changement de mot de passe ----------

describe("ChangePassword", () => {
  const change = (accessToken: string | null, currentPassword: string, newPassword: string) =>
    call((cb) =>
      app.clients.auth.changePassword(
        ChangePasswordRequest.fromPartial({ currentPassword, newPassword }),
        accessToken ? bearer(accessToken) : metadata(),
        cb,
      ),
    );

  it("exige une authentification", async () => {
    await expect(change(null, PASSWORD, "nouveau mot de passe")).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("change le mot de passe et ferme toutes les sessions de l'utilisateur", async () => {
    const { tokens } = await loggedIn();
    await expect(change(tokens.accessToken, PASSWORD, "nouveau mot de passe")).resolves.toEqual({});
    await expect(login("student@example.com", PASSWORD)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
    await expect(login("student@example.com", "nouveau mot de passe")).resolves.toBeDefined();
    await expect(refresh(tokens.refreshToken)).rejects.toMatchObject({ code: status.UNAUTHENTICATED });
  });

  it("un mauvais mot de passe actuel donne INVALID_ARGUMENT (pas UNAUTHENTICATED : la session reste valide)", async () => {
    const { tokens } = await loggedIn();
    const error = await change(tokens.accessToken, "mauvais", "nouveau mot de passe").catch((e: ServiceError) => e);
    expect(error).toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(validationErrors(error as ServiceError)).toEqual([{ field: "currentPassword", code: "invalid_password" }]);
    await expect(refresh(tokens.refreshToken)).resolves.toBeDefined();
  });

  it("refuse un nouveau mot de passe identique à l'ancien ou trop court", async () => {
    const { tokens } = await loggedIn();
    const same = await change(tokens.accessToken, PASSWORD, PASSWORD).catch((e: ServiceError) => e);
    expect(validationErrors(same as ServiceError)).toEqual([{ field: "newPassword", code: "password_unchanged" }]);
    const short = await change(tokens.accessToken, PASSWORD, "court").catch((e: ServiceError) => e);
    expect(validationErrors(short as ServiceError)).toEqual([{ field: "newPassword", code: "password_too_short" }]);
  });

  it("bloque après 5 mots de passe actuels erronés", async () => {
    const { tokens } = await loggedIn();
    for (let i = 0; i < 5; i += 1) await change(tokens.accessToken, "faux", "nouveau mot de passe").catch(() => undefined);
    await expect(change(tokens.accessToken, PASSWORD, "nouveau mot de passe")).rejects.toMatchObject({
      code: status.RESOURCE_EXHAUSTED,
    });
  });
});

// ---------- premier administrateur ----------

describe("createAdminAccount (pnpm admin:create)", () => {
  it("crée un administrateur actif qui peut se connecter, et refuse d'écraser un compte existant", async () => {
    const admin = await createAdminAccount(app.prisma, {
      email: "Admin@Example.com",
      firstName: "Molka",
      lastName: "Gara-Hellal",
      password: "un mot de passe solide",
    });
    expect(admin).toMatchObject({ email: "admin@example.com", role: "ADMIN", status: "ACTIVE" });
    expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(login("admin@example.com", "un mot de passe solide")).resolves.toBeDefined();

    await expect(
      createAdminAccount(app.prisma, { email: "admin@example.com", firstName: "X", lastName: "Y", password: "un autre mot de passe" }),
    ).rejects.toBeInstanceOf(AdminBootstrapError);
  });

  it("refuse un mot de passe trop court ou un e-mail invalide", async () => {
    await expect(
      createAdminAccount(app.prisma, { email: "admin@example.com", firstName: "X", lastName: "Y", password: "court" }),
    ).rejects.toThrow(/password/);
    await expect(
      createAdminAccount(app.prisma, { email: "pas-un-email", firstName: "X", lastName: "Y", password: "un mot de passe solide" }),
    ).rejects.toThrow(/email/);
    expect(await app.prisma.user.count()).toBe(0);
  });
});
