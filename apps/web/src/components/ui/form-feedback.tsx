"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { FormState } from "@/lib/form-state";
import { Button } from "./button";

/** Résumé d'erreur global d'un formulaire (annoncé aux lecteurs d'écran). */
export function FormError({ state }: { state: FormState }) {
  const t = useTranslations("Errors");
  if (state.status !== "error") return null;

  let message: string | undefined;
  if (state.code) {
    if (state.code === "rate_limited" && state.retryAfterSeconds) {
      message = t("api.rate_limited_wait", { minutes: Math.max(1, Math.ceil(state.retryAfterSeconds / 60)) });
    } else {
      message = t.has(`api.${state.code}`) ? t(`api.${state.code}`) : t("api.generic");
    }
  } else if (state.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
    message = t("api.fix_fields");
  }
  if (!message) return null;
  return (
    <div role="alert" className="rounded-control border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
      {message}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations("Common");
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? (pendingLabel ?? t("sending")) : children}
    </Button>
  );
}

export function SuccessPanel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="status" className="space-y-2 border-s-4 border-success bg-success/5 px-5 py-4">
      <p className="text-lg font-semibold text-success">{title}</p>
      {children && <div className="space-y-2 text-ink">{children}</div>}
    </div>
  );
}
