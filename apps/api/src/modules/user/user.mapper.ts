import type { User as ProtoUser } from "@center/proto-gen/user/v1/user";
import { localeMap, roleMap, userStatusMap } from "../../common/enums";
import type { PrismaClient } from "../../common/prisma";
import type { Role } from "../../generated/prisma/enums";

export const toProtoUser = (u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  locale: Parameters<typeof localeMap.toProto>[0];
  status: Parameters<typeof userStatusMap.toProto>[0];
  createdAt: Date;
}): ProtoUser => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: roleMap.toProto(u.role),
  locale: localeMap.toProto(u.locale),
  status: userStatusMap.toProto(u.status),
  createdAt: u.createdAt,
});

/**
 * Notifications visibles par un utilisateur : les siennes, plus celles adressées au rôle ADMIN
 * (équipe d'administration restreinte). Pour les autres rôles, jamais de notification "de groupe" :
 * son état lu/non lu serait partagé entre tous les comptes du rôle.
 */
export const notificationScope = (userId: string, role: Role) =>
  role === "ADMIN" ? { OR: [{ userId }, { audience: "ADMIN" as const }] } : { userId };

export const countUnread = (prisma: PrismaClient, userId: string, role: Role): Promise<number> =>
  prisma.notification.count({ where: { ...notificationScope(userId, role), readAt: null } });
