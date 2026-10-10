import { z } from "zod";
import { emailField, newPasswordField, requiredText } from "@center/shared";
import { hashPassword } from "../../common/password";
import type { PrismaClient } from "../../common/prisma";
import type { User } from "../../generated/prisma/client";

const adminInputSchema = z.object({
  email: emailField,
  firstName: requiredText(80),
  lastName: requiredText(80),
  password: newPasswordField,
});

export class AdminBootstrapError extends Error {}

/**
 * Crée un compte ADMIN actif. Utilisé par `pnpm admin:create` : c'est la seule façon de créer le tout premier
 * administrateur (il n'existe volontairement aucun compte par défaut ni mot de passe dans le dépôt).
 * Refuse d'écraser un compte existant.
 */
export async function createAdminAccount(
  prisma: PrismaClient,
  input: { email: string; firstName: string; lastName: string; password: string },
): Promise<User> {
  const parsed = adminInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${String(i.path[0])} (${i.message})`).join(", ");
    throw new AdminBootstrapError(`Données invalides : ${fields}`);
  }
  const { password, ...data } = parsed.data;
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    throw new AdminBootstrapError("Un compte avec cet e-mail existe déjà.");
  }
  return prisma.user.create({
    data: { ...data, passwordHash: await hashPassword(password), role: "ADMIN", status: "ACTIVE" },
  });
}
