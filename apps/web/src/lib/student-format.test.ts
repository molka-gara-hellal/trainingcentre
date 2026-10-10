import { describe, expect, it } from "vitest";
import { NotificationType } from "@center/proto-gen/notification/v1/notification";
import { notificationHref, notificationKind } from "./student-format";

const SESSION = "0198f0f0-0000-7000-8000-000000000001";

describe("notifications", () => {
  it("projet rendu → page des projets de la session", () => {
    const kind = notificationKind(NotificationType.NOTIFICATION_TYPE_PROJECT_SUBMITTED);
    expect(kind).toBe("PROJECT_SUBMITTED");
    expect(notificationHref(kind, JSON.stringify({ sessionId: SESSION }))).toBe(`/espace/sessions/${SESSION}/projets`);
  });
  it("payload invalide ou identifiant suspect → lien générique, jamais d'injection de chemin", () => {
    expect(notificationHref("PROJECT_SUBMITTED", "pas du json")).toBe("/espace");
    expect(notificationHref("PROJECT_SUBMITTED", JSON.stringify({ sessionId: "../../admin" }))).toBe("/espace");
    expect(notificationHref("PROJECT_SUBMITTED", JSON.stringify({ sessionId: 42 }))).toBe("/espace");
  });
  it("types réservés à l'administration → message générique", () => {
    expect(notificationKind(NotificationType.NOTIFICATION_TYPE_NEW_REGISTRATION)).toBe("SYSTEM");
  });
});
