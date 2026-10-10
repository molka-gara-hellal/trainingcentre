import type { UntypedServiceImplementation } from "@grpc/grpc-js";
import { NotificationServiceService } from "@center/proto-gen/notification/v1/notification";
import { notificationTypeMap } from "../../common/enums";
import { notFound, unauthenticated, validationError } from "../../common/errors";
import type { PrismaClient } from "../../common/prisma";
import type { RequestContext, UnaryFactory } from "../../grpc/handler";
import { countUnread, notificationScope } from "../user/user.mapper";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildNotificationService(deps: {
  prisma: PrismaClient;
  unary: UnaryFactory;
  now?: () => Date;
}): UntypedServiceImplementation {
  const { prisma, unary, now = () => new Date() } = deps;
  const auth = (ctx: RequestContext) => {
    if (!ctx.auth) throw unauthenticated();
    return ctx.auth;
  };

  return {
    listMyNotifications: unary(NotificationServiceService.listMyNotifications, async (req, ctx) => {
      const { userId, role } = auth(ctx);
      const take = req.limit > 0 ? Math.min(Math.floor(req.limit), MAX_LIMIT) : DEFAULT_LIMIT;
      const rows = await prisma.notification.findMany({
        where: { ...notificationScope(userId, role), ...(req.unreadOnly && { readAt: null }) },
        orderBy: { createdAt: "desc" },
        take,
      });
      return {
        notifications: rows.map((row) => ({
          id: row.id,
          type: notificationTypeMap.toProto(row.type),
          payloadJson: JSON.stringify(row.payload ?? {}),
          readAt: row.readAt ?? undefined,
          createdAt: row.createdAt,
        })),
      };
    }),

    countMyUnread: unary(NotificationServiceService.countMyUnread, async (_req, ctx) => {
      const { userId, role } = auth(ctx);
      return { count: await countUnread(prisma, userId, role) };
    }),

    markNotificationRead: unary(NotificationServiceService.markNotificationRead, async (req, ctx) => {
      const { userId, role } = auth(ctx);
      if (!UUID.test(req.id)) throw validationError([{ field: "id", code: "invalid_value" }]);
      // Filtre de visibilité inclus : on ne peut pas marquer la notification d'un autre utilisateur.
      const found = await prisma.notification.findFirst({
        where: { id: req.id, ...notificationScope(userId, role) },
        select: { id: true },
      });
      if (!found) throw notFound();
      await prisma.notification.updateMany({ where: { id: found.id, readAt: null }, data: { readAt: now() } });
      return {};
    }),

    markAllNotificationsRead: unary(NotificationServiceService.markAllNotificationsRead, async (_req, ctx) => {
      const { userId, role } = auth(ctx);
      await prisma.notification.updateMany({
        where: { ...notificationScope(userId, role), readAt: null },
        data: { readAt: now() },
      });
      return {};
    }),
  };
}
