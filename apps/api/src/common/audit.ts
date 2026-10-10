import type { Prisma } from "./prisma";

/**
 * Journal d'audit des actions d'administration : qui a fait quoi, sur quoi. Jamais de donnée sensible
 * (mot de passe, jeton) dans `metadata`. Écrit dans la même transaction que l'action.
 */
export function audit(
  db: Pick<Prisma.TransactionClient, "auditLog">,
  actorId: string | undefined,
  action: string,
  entity: string,
  entityId: string | undefined,
  metadata?: Prisma.InputJsonValue,
) {
  return db.auditLog.create({ data: { actorId: actorId ?? null, action, entity, entityId: entityId ?? null, metadata: metadata ?? undefined } });
}
