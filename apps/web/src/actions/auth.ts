"use server";

import { getLocale } from "next-intl/server";
import {
  ActivateAccountRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LogoutRequest,
  RegisterRequest,
  ResetPasswordRequest,
  type TokenPair,
} from "@center/proto-gen/auth/v1/auth";
import {
  activateAccountInputSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  registerAccountInputSchema,
  resetPasswordInputSchema,
} from "@center/shared";
import { redirect } from "@/i18n/navigation";
import { clients, rpc } from "@/lib/grpc/client";
import { toTokenSet } from "@/lib/auth/refresh";
import { callContext, clearSessionCookies, readRefreshToken, writeSessionCookies } from "@/lib/auth/session";
import { protoLocale } from "@/lib/data";
import type { FormState } from "@/lib/form-state";
import { apiFailure, isBot, safeNextPath, text, valuesOf, zodFailure } from "./helpers";

const upperLocale = (locale: string) => locale.toUpperCase();

export async function loginAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const parsed = loginInputSchema.safeParse({ email: text(data, "email"), password: text(data, "password") });
  if (!parsed.success) return zodFailure(parsed.error, data);

  try {
    const res = await rpc<{ tokens?: TokenPair }>(await callContext(), (md, opts, cb) =>
      clients().auth.login(LoginRequest.fromPartial(parsed.data), md, opts, cb),
    );
    await writeSessionCookies(toTokenSet(res.tokens));
  } catch (err) {
    return apiFailure(err, data);
  }
  // redirect() lève une exception de contrôle : surtout pas dans le try/catch
  redirect({ href: safeNextPath(text(data, "next")) ?? "/espace", locale });
  return { status: "idle" };
}

export async function logoutAction(): Promise<void> {
  const locale = await getLocale();
  const refreshToken = await readRefreshToken();
  if (refreshToken) {
    try {
      await rpc(await callContext(), (md, opts, cb) =>
        clients().auth.logout(LogoutRequest.fromPartial({ refreshToken }), md, opts, cb),
      );
    } catch {
      // Même si l'API ne répond pas, on supprime les cookies : l'utilisateur est déconnecté de CE navigateur.
    }
  }
  await clearSessionCookies();
  redirect({ href: "/", locale });
}

export async function registerAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  if (isBot(data)) return { status: "success" };
  const parsed = registerAccountInputSchema.safeParse({
    email: text(data, "email"),
    firstName: text(data, "firstName"),
    lastName: text(data, "lastName"),
    locale: upperLocale(locale),
  });
  if (!parsed.success) return zodFailure(parsed.error, data);
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().auth.register(
        RegisterRequest.fromPartial({ ...parsed.data, locale: protoLocale(locale) }),
        md,
        opts,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  // Réponse volontairement identique que l'adresse soit nouvelle ou déjà connue (anti-énumération).
  return { status: "success" };
}

export async function forgotPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const parsed = forgotPasswordInputSchema.safeParse({ email: text(data, "email"), locale: upperLocale(locale) });
  if (!parsed.success) return zodFailure(parsed.error, data);
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().auth.forgotPassword(
        ForgotPasswordRequest.fromPartial({ email: parsed.data.email, locale: protoLocale(locale) }),
        md,
        opts,
        cb,
      ),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  return { status: "success" };
}

/** Nouveau mot de passe + confirmation : la confirmation est vérifiée ici, avant tout appel à l'API. */
function mismatch(data: FormData, field: "password" | "newPassword"): FormState | undefined {
  if (text(data, field) !== text(data, "confirmPassword")) {
    return { status: "error", fieldErrors: { confirmPassword: "password_mismatch" }, values: valuesOf(data) };
  }
  return undefined;
}

export async function resetPasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  const parsed = resetPasswordInputSchema.safeParse({ token: text(data, "token"), newPassword: text(data, "newPassword") });
  if (!parsed.success) return zodFailure(parsed.error, data);
  const different = mismatch(data, "newPassword");
  if (different) return different;
  try {
    await rpc(await callContext(), (md, opts, cb) =>
      clients().auth.resetPassword(ResetPasswordRequest.fromPartial(parsed.data), md, opts, cb),
    );
  } catch (err) {
    return apiFailure(err, data);
  }
  return { status: "success" };
}

export async function activateAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  const locale = await getLocale();
  const parsed = activateAccountInputSchema.safeParse({ token: text(data, "token"), password: text(data, "password") });
  if (!parsed.success) return zodFailure(parsed.error, data);
  const different = mismatch(data, "password");
  if (different) return different;
  try {
    const res = await rpc<{ tokens?: TokenPair }>(await callContext(), (md, opts, cb) =>
      clients().auth.activateAccount(ActivateAccountRequest.fromPartial(parsed.data), md, opts, cb),
    );
    await writeSessionCookies(toTokenSet(res.tokens)); // le compte est activé ET connecté
  } catch (err) {
    return apiFailure(err, data);
  }
  redirect({ href: "/espace", locale });
  return { status: "idle" };
}
