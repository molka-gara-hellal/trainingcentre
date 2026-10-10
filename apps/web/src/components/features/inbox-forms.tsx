"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { submitContactAction, submitPfeAction } from "@/actions/public";
import { Link } from "@/i18n/navigation";
import { CheckboxField, Honeypot, TextAreaField, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton, SuccessPanel } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

function Consent({ error }: { error?: string }) {
  const t = useTranslations("Common");
  return (
    <CheckboxField name="consentGiven" error={error}>
      {t.rich("consent", {
        link: (chunks) => (
          <Link href="/confidentialite" className="font-medium text-primary underline underline-offset-4">
            {chunks}
          </Link>
        ),
      })}
    </CheckboxField>
  );
}

export function ContactForm() {
  const t = useTranslations("Contact");
  const [state, action] = useActionState<FormState, FormData>(submitContactAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "success") {
    return (
      <SuccessPanel title={t("successTitle")}>
        <p>{t("successBody")}</p>
      </SuccessPanel>
    );
  }
  return (
    <form action={action} className="relative space-y-5" noValidate>
      <FormError state={state} />
      <Honeypot />
      <TextField label={t("name")} name="name" autoComplete="name" required defaultValue={values["name"]} error={errors["name"]} />
      <TextField label={t("email")} name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
      <TextField label={t("subject")} name="subject" required defaultValue={values["subject"]} error={errors["subject"]} />
      <TextAreaField label={t("message")} name="message" rows={6} required defaultValue={values["message"]} error={errors["message"]} />
      <Consent error={errors["consentGiven"]} />
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}

export function PfeForm() {
  const t = useTranslations("Pfe");
  const [state, action] = useActionState<FormState, FormData>(submitPfeAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  if (state.status === "success") {
    return (
      <SuccessPanel title={t("successTitle")}>
        <p>{t("successBody")}</p>
      </SuccessPanel>
    );
  }
  return (
    <form action={action} className="relative space-y-5" noValidate>
      <FormError state={state} />
      <Honeypot />
      <TextField label={t("name")} name="name" autoComplete="name" required defaultValue={values["name"]} error={errors["name"]} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label={t("email")} name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
        <TextField label={t("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" defaultValue={values["phone"]} error={errors["phone"]} />
      </div>
      <TextField label={t("topic")} hint={t("topicHint")} name="topic" required defaultValue={values["topic"]} error={errors["topic"]} />
      <TextAreaField label={t("message")} name="message" rows={6} defaultValue={values["message"]} error={errors["message"]} />
      <Consent error={errors["consentGiven"]} />
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}
