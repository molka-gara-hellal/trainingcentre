import { status, type ServiceError } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Locale } from "@center/proto-gen/common/v1/common";
import { VALIDATION_ERRORS_METADATA_KEY } from "../../src/common/errors";
import { NOW } from "../fixtures";
import { call, metadata, resetDatabase, startTestApp, type TestApp } from "../helpers";

let app: TestApp;
let seq = 0;
beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app.prisma);
});

async function makeUser(role: "STUDENT" | "ADMIN" = "STUDENT") {
  seq += 1;
  const user = await app.prisma.user.create({
    data: {
      email: `p${seq}@test.invalid`, role, status: "ACTIVE", firstName: "Prénom", lastName: "Nom",
      ...(role === "STUDENT" && { student: { create: {} } }),
    },
  });
  const { token } = await app.jwt.signAccessToken({ userId: user.id, role });
  return { user, md: metadata({ authorization: `Bearer ${token}` }) };
}
const errorOf = async (p: Promise<unknown>) => (await p.then(() => null, (e: ServiceError) => e)) as ServiceError | null;

describe("UserService", () => {
  it("renvoie et met à jour le profil (nom, langue, téléphone) sans toucher e-mail ni rôle", async () => {
    const me = await makeUser();
    const upd = await call<{ user?: { firstName: string; locale: Locale; email: string } }>((cb) =>
      app.clients.user.updateProfile(
        { firstName: "  Molka ", lastName: "Gara", locale: Locale.LOCALE_AR, phone: "+216 12 345 678" },
        me.md,
        cb,
      ),
    );
    expect(upd.user).toMatchObject({ firstName: "Molka", locale: Locale.LOCALE_AR, email: me.user.email });
    const got = await call<{ phone?: string }>((cb) => app.clients.user.getProfile({}, me.md, cb));
    expect(got.phone).toBe("+216 12 345 678");
    const row = await app.prisma.user.findUniqueOrThrow({ where: { id: me.user.id } });
    expect(row).toMatchObject({ role: "STUDENT", email: me.user.email, locale: "AR" });
  });

  it("conserve la langue si elle n'est pas fournie et rejette les valeurs invalides", async () => {
    const me = await makeUser();
    await call((cb) => app.clients.user.updateProfile({ firstName: "A", lastName: "B", locale: Locale.LOCALE_UNSPECIFIED }, me.md, cb));
    expect((await app.prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).locale).toBe("FR");
    const err = await errorOf(
      call((cb) => app.clients.user.updateProfile({ firstName: "", lastName: "B", locale: Locale.LOCALE_UNSPECIFIED, phone: "abc" }, me.md, cb)),
    );
    expect(err?.code).toBe(status.INVALID_ARGUMENT);
    const fields = JSON.parse(String(err?.metadata?.get(VALIDATION_ERRORS_METADATA_KEY)[0])) as Array<{ field: string }>;
    expect(fields.map((f) => f.field).sort()).toEqual(["firstName", "phone"]);
  });

  it("refuse l'anonyme", async () => {
    const err = await errorOf(call((cb) => app.clients.user.getProfile({}, cb)));
    expect(err?.code).toBe(status.UNAUTHENTICATED);
  });
});

describe("NotificationService", () => {
  it("ne montre et ne modifie que mes notifications", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const mine = await app.prisma.notification.create({ data: { userId: me.user.id, type: "PROJECT_REVIEWED", payload: { a: 1 } } });
    const theirs = await app.prisma.notification.create({ data: { userId: other.user.id, type: "SYSTEM" } });
    await app.prisma.notification.create({ data: { audience: "ADMIN", type: "NEW_REGISTRATION" } });

    const list = await call<{ notifications: Array<{ id: string; payloadJson: string }> }>((cb) =>
      app.clients.notification.listMyNotifications({ unreadOnly: true, limit: 0 }, me.md, cb),
    );
    expect(list.notifications.map((n) => n.id)).toEqual([mine.id]);
    expect(JSON.parse(list.notifications[0]!.payloadJson)).toEqual({ a: 1 });

    const err = await errorOf(call((cb) => app.clients.notification.markNotificationRead({ id: theirs.id }, me.md, cb)));
    expect(err?.code).toBe(status.NOT_FOUND);
    const bad = await errorOf(call((cb) => app.clients.notification.markNotificationRead({ id: "x" }, me.md, cb)));
    expect(bad?.code).toBe(status.INVALID_ARGUMENT);

    await call((cb) => app.clients.notification.markNotificationRead({ id: mine.id }, me.md, cb));
    expect((await call<{ count: number }>((cb) => app.clients.notification.countMyUnread({}, me.md, cb))).count).toBe(0);
    expect((await app.prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
  });

  it("un administrateur voit aussi les notifications adressées au rôle ADMIN ; marquer tout lu", async () => {
    const admin = await makeUser("ADMIN");
    await app.prisma.notification.create({ data: { audience: "ADMIN", type: "NEW_REGISTRATION" } });
    await app.prisma.notification.create({ data: { userId: admin.user.id, type: "SYSTEM" } });
    await app.prisma.notification.create({ data: { audience: "ADMIN", type: "NEW_CONTACT_MESSAGE", readAt: NOW } });
    expect((await call<{ count: number }>((cb) => app.clients.notification.countMyUnread({}, admin.md, cb))).count).toBe(2);
    await call((cb) => app.clients.notification.markAllNotificationsRead({}, admin.md, cb));
    expect((await call<{ count: number }>((cb) => app.clients.notification.countMyUnread({}, admin.md, cb))).count).toBe(0);
  });
});
