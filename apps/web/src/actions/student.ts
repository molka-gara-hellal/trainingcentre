"use server";

import { revalidatePath } from "next/cache";
import { MarkAllNotificationsReadRequest, MarkNotificationReadRequest } from "@center/proto-gen/notification/v1/notification";
import { UpdateMyProjectRequest } from "@center/proto-gen/student/v1/student";
import { UpdateProfileRequest } from "@center/proto-gen/user/v1/user";
import { updateMyProjectInputSchema, updateProfileInputSchema } from "@center/shared";
import { clients, rpc } from "@/lib/grpc/client";
import { withFreshAccess } from "@/lib/auth/session";
import { protoLocale } from "@/lib/data";
import type { FormState } from "@/lib/form-state";
import { apiFailure, text, zodFailure } from "./helpers";

const sessionExpired = (): FormState => ({ status: "error", code: "unauthenticated", values: {} });

/** Enregistre un brouillon de projet ou le rend au formateur (bouton `intent`). */
export async function updateProjectAction(_prev: FormState, data: FormData): Promise<FormState> {
  const submit = text(data, "intent") === "submit";
  const parsed = updateMyProjectInputSchema.safeParse({
    projectId: text(data, "projectId"),
    description: text(data, "description"),
    repoUrl: text(data, "repoUrl").trim() === "" ? undefined : text(data, "repoUrl"),
    submit,
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  const ctx = await withFreshAccess();
  if (!ctx) return sessionExpired();
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().student.updateMyProject(
        UpdateMyProjectRequest.fromPartial({
          projectId: parsed.data.projectId,
          description: parsed.data.description ?? "",
          repoUrl: parsed.data.repoUrl,
          submit: parsed.data.submit,
        }),
        md,
        o,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  revalidatePath("/", "layout");
  return { status: "success", code: submit ? "submitted" : "saved" };
}

export async function updateProfileAction(_prev: FormState, data: FormData): Promise<FormState> {
  const rawLocale = text(data, "locale");
  const parsed = updateProfileInputSchema.safeParse({
    firstName: text(data, "firstName"),
    lastName: text(data, "lastName"),
    locale: rawLocale,
    phone: text(data, "phone").trim() === "" ? undefined : text(data, "phone"),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  const ctx = await withFreshAccess();
  if (!ctx) return sessionExpired();
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().user.updateProfile(
        UpdateProfileRequest.fromPartial({
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          locale: protoLocale(parsed.data.locale.toLowerCase()),
          phone: parsed.data.phone,
        }),
        md,
        o,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  revalidatePath("/", "layout");
  return { status: "success" };
}

export async function markNotificationReadAction(data: FormData): Promise<void> {
  const ctx = await withFreshAccess();
  if (!ctx) return;
  const id = text(data, "id");
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().notification.markNotificationRead(MarkNotificationReadRequest.fromPartial({ id }), md, o, cb),
    );
  } catch {
    // Notification déjà lue ou inexistante : rien à faire, la page se rafraîchit.
  }
  revalidatePath("/", "layout");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const ctx = await withFreshAccess();
  if (!ctx) return;
  try {
    await rpc(ctx, (md, o, cb) =>
      clients().notification.markAllNotificationsRead(MarkAllNotificationsReadRequest.fromPartial({}), md, o, cb),
    );
  } catch {
    // Sans conséquence : l'utilisateur peut réessayer.
  }
  revalidatePath("/", "layout");
}
