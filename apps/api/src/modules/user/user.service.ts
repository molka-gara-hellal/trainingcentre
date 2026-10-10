import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { UserServiceService } from "@center/proto-gen/user/v1/user";
import { updateProfileInputSchema } from "@center/shared";
import { localeMap } from "../../common/enums";
import { unauthenticated } from "../../common/errors";
import type { PrismaClient } from "../../common/prisma";
import { parseInput } from "../../common/validate";
import type { UnaryFactory } from "../../grpc/handler";
import { toProtoUser } from "./user.mapper";

export function buildUserService(deps: { prisma: PrismaClient; unary: UnaryFactory }): UntypedServiceImplementation {
  const { prisma, unary } = deps;
  return {
    getProfile: unary(UserServiceService.getProfile, async (_req, ctx) => {
      if (!ctx.auth) throw unauthenticated();
      const user = await prisma.user.findUnique({
        where: { id: ctx.auth.userId },
        include: { student: { select: { phone: true } } },
      });
      if (!user) throw unauthenticated();
      return { user: toProtoUser(user), phone: user.student?.phone ?? undefined };
    }),

    // L'e-mail et le rôle ne sont jamais modifiables ici. Le téléphone n'existe que sur le profil étudiant.
    updateProfile: unary(UserServiceService.updateProfile, async (req, ctx) => {
      if (!ctx.auth) throw unauthenticated();
      const current = await prisma.user.findUnique({
        where: { id: ctx.auth.userId },
        include: { student: { select: { id: true } } },
      });
      if (!current) throw unauthenticated();
      const input = parseInput(updateProfileInputSchema, {
        firstName: req.firstName,
        lastName: req.lastName,
        locale: localeMap.toDb(req.locale) ?? current.locale,
        phone: req.phone,
      });
      const user = await prisma.$transaction(async (tx) => {
        if (current.student && input.phone !== undefined) {
          await tx.student.update({ where: { id: current.student.id }, data: { phone: input.phone } });
        }
        return tx.user.update({
          where: { id: current.id },
          data: { firstName: input.firstName, lastName: input.lastName, locale: input.locale },
        });
      });
      return { user: toProtoUser(user) };
    }),
  };
}
