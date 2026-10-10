import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { SiteServiceService } from "@center/proto-gen/site/v1/site";
import { settingStatusMap } from "../../common/enums";
import type { PrismaClient } from "../../common/prisma";
import type { UnaryFactory } from "../../grpc/handler";

export function buildSiteService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
}): UntypedServiceImplementation {
  const { prisma, unary } = deps;
  return {
    // Tous les paramètres sont publics (nom, coordonnées, réseaux). Aucun secret ne doit y être stocké.
    getPublicSettings: unary(SiteServiceService.getPublicSettings, async () => {
      const rows = await prisma.siteSetting.findMany({ orderBy: { key: "asc" } });
      return {
        settings: rows.map((row) => ({
          key: row.key,
          value: row.value,
          status: settingStatusMap.toProto(row.status),
        })),
      };
    }),
  };
}
