"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  activateAccountAction,
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
} from "@/actions/auth";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Honeypot, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton, SuccessPanel } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

const useForm = (action: (prev: FormState, data: FormData) => Promise<FormState>) => {
  const [state, run] = useActionState<FormState, FormData>(action, idleState);
  return {
    state,
    run,
    values: state.status === "error" ? (state.values ?? {}) : ({} as Record<string, string>),
    errors: state.status === "error" ? (state.fieldErrors ?? {}) : ({} as Record<string, string>),
  };
};

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("Auth");
  const { state, run, values, errors } = useForm(loginAction);
  return (
    <form action={run} className="space-y-5" noValidate>
      <FormError state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <TextField label={t("email")} name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
      <TextField label={t("password")} name="password" type="password" autoComplete="current-password" required error={errors["password"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubmitButton pendingLabel={t("loggingIn")}>{t("loginSubmit")}</SubmitButton>
        <Link href="/mot-de-passe-oublie" className="text-sm font-medium text-primary underline underline-offset-4">
          {t("forgotLink")}
        </Link>
      </div>
    </form>
  );
}

export function SignupForm() {
  const t = useTranslations("Auth");
  const { state, run, values, errors } = useForm(registerAction);
  if (state.status === "success") {
    return (
      <SuccessPanel title={t("signupSuccessTitle")}>
        <p>{t("signupSuccessBody")}</p>
      </SuccessPanel>
    );
  }
  return (
    <form action={run} className="relative space-y-5" noValidate>
      <FormError state={state} />
      <Honeypot />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label={t("firstName")} name="firstName" autoComplete="given-name" required defaultValue={values["firstName"]} error={errors["firstName"]} />
        <TextField label={t("lastName")} name="lastName" autoComplete="family-name" required defaultValue={values["lastName"]} error={errors["lastName"]} />
      </div>
      <TextField label={t("email")} name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
      <p className="text-sm text-muted">{t("signupHint")}</p>
      <SubmitButton>{t("signupSubmit")}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const { state, run, values, errors } = useForm(forgotPasswordAction);
  if (state.status === "success") {
    return (
      <SuccessPanel title={t("forgotSuccessTitle")}>
        <p>{t("forgotSuccessBody")}</p>
      </SuccessPanel>
    );
  }
  return (
    <form action={run} className="space-y-5" noValidate>
      <FormError state={state} />
      <TextField label={t("email")} name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
      <SubmitButton>{t("forgotSubmit")}</SubmitButton>
    </form>
  );
}

/** Choix du nouveau mot de passe : sert à la réinitialisation ET à l'activation du compte. */
export function NewPasswordForm({ token, mode }: { token: string; mode: "reset" | "activate" }) {
  const t = useTranslations("Auth");
  const { state, run, errors } = useForm(mode === "reset" ? resetPasswordAction : activateAccountAction);
  const field = mode === "reset" ? "newPassword" : "password";

  if (state.status === "success") {
    return (
      <SuccessPanel title={t("resetSuccessTitle")}>
        <p>{t("resetSuccessBody")}</p>
        <Link href="/connexion" className={buttonClasses("primary", "mt-2")}>
          {t("loginSubmit")}
        </Link>
      </SuccessPanel>
    );
  }
  const tokenError = errors["token"];
  return (
    <form action={run} className="space-y-5" noValidate>
      <FormError state={state} />
      {tokenError && (
        <div role="alert" className="space-y-2 rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          <p className="font-medium">{t("linkInvalid")}</p>
          <Link href={mode === "reset" ? "/mot-de-passe-oublie" : "/creer-un-compte"} className="font-medium underline underline-offset-4">
            {mode === "reset" ? t("requestNewReset") : t("requestNewActivation")}
          </Link>
        </div>
      )}
      <input type="hidden" name="token" value={token} />
      <TextField
        label={t("newPassword")}
        hint={t("passwordRule")}
        name={field}
        type="password"
        autoComplete="new-password"
        minLength={10}
        maxLength={128}
        required
        error={errors[field]}
      />
      <TextField label={t("confirmPassword")} name="confirmPassword" type="password" autoComplete="new-password" required error={errors["confirmPassword"]} />
      <SubmitButton>{mode === "reset" ? t("resetSubmit") : t("activateSubmit")}</SubmitButton>
    </form>
  );
}
