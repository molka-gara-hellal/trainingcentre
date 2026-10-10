import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GetPublicSettingsRequest, SettingStatus, type GetPublicSettingsResponse } from "@center/proto-gen/site/v1/site";
import { call, resetDatabase, startTestApp, type TestApp } from "../helpers";

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app.prisma);
});

describe("SiteService.getPublicSettings", () => {
  it("renvoie les paramètres triés par clé, avec leur statut TODO / SET", async () => {
    await app.prisma.siteSetting.createMany({
      data: [
        { key: "PHONE", value: "TODO", status: "TODO" },
        { key: "CITY", value: "Monastir", status: "SET" },
      ],
    });
    const res = await call<GetPublicSettingsResponse>((cb) =>
      app.clients.site.getPublicSettings(GetPublicSettingsRequest.fromPartial({}), cb),
    );
    expect(res.settings).toEqual([
      { key: "CITY", value: "Monastir", status: SettingStatus.SETTING_STATUS_SET },
      { key: "PHONE", value: "TODO", status: SettingStatus.SETTING_STATUS_TODO },
    ]);
  });

  it("renvoie une liste vide (et non une erreur) sans aucun paramètre", async () => {
    const res = await call<GetPublicSettingsResponse>((cb) =>
      app.clients.site.getPublicSettings(GetPublicSettingsRequest.fromPartial({}), cb),
    );
    expect(res.settings).toEqual([]);
  });
});
