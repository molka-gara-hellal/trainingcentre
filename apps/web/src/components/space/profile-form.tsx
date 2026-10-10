"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProfileAction } from "@/actions/student";
import { SelectField, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

export function ProfileForm({ firstName, lastName, phone, locale }: { firstName: string; lastName: string; phone: string; locale: "FR" | "AR" | "EN" }) {
  const t = useTranslations("Student.profile");
  const [state, run] = useActionState<FormState, FormData>(updateProfileAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={run} className="space-y-5" noValidate>
      <FormError state={state} />
      {state.status === "success" && (
        <p role="status" className="rounded-control border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">{t("saved")}</p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label={t("firstName")} name="firstName" autoComplete="given-name" required defaultValue={values["firstName"] ?? firstName} error={errors["firstName"]} />
        <TextField label={t("lastName")} name="lastName" autoComplete="family-name" required defaultValue={values["lastName"] ?? lastName} error={errors["lastName"]} />
      </div>
      <TextField label={t("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" defaultValue={values["phone"] ?? phone} error={errors["phone"]} />
      <SelectField label={t("language")} hint={t("languageHint")} name="locale" required defaultValue={values["locale"] ?? locale} error={errors["locale"]}>
        <option value="FR">Français</option>
        <option value="AR">العربية</option>
        <option value="EN">English</option>
      </SelectField>
      <SubmitButton>{t("save")}</SubmitButton>
    </form>
  );
}
