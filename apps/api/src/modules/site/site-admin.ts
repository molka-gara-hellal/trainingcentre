import { SiteServiceService } from "@center/proto-gen/site/v1/site";
import { settingInputSchema } from "@center/shared";
import { actorId } from "../../common/caller";
import { audit } from "../../common/audit";
import { settingStatusMap } from "../../common/enums";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import type { UnaryFactory } from "../../grpc/handler";

/** Mise à jour d'un paramètre public connu (liste fermée : on ne crée pas de clé arbitraire). */
export function buildSiteAdminHandlers(deps: { prisma: PrismaClient; unary: UnaryFactory }) {
  const { prisma, unary } = deps;
  return {
    updateSetting: unary(SiteServiceService.updateSetting, async (req, ctx) => {
      const input = parseInput(settingInputSchema, { key: req.key, value: req.value, status: settingStatusMap.toDb(req.status) });
      // Une valeur « À définir » est toujours enregistrée comme telle, quel que soit le texte reçu.
      const value = input.status === "TODO" ? "TODO" : input.value;
      const row = await prisma.$transaction(async (tx) => {
        const saved = await tx.siteSetting.upsert({
          where: { key: input.key },
          create: { key: input.key, value, status: input.status },
          update: { value, status: input.status },
        });
        await audit(tx, actorId(ctx), "setting.update", "SiteSetting", input.key, { status: input.status });
        return saved;
      });
      return { setting: { key: row.key, value: row.value, status: settingStatusMap.toProto(row.status) } };
    }),
  };
}
