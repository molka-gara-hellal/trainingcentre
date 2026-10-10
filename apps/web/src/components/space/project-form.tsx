"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { updateProjectAction } from "@/actions/student";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { FormError } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

export function ProjectForm({ projectId, description, repoUrl }: { projectId: string; description: string; repoUrl: string }) {
  const t = useTranslations("Student.projects");
  const [state, run, pending] = useActionState<FormState, FormData>(updateProjectAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={run} className="space-y-4" noValidate>
      <FormError state={state} />
      {state.status === "success" && (
        <p role="status" className="rounded-control border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          {state.code === "submitted" ? t("submitted") : t("saved")}
        </p>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <TextAreaField label={t("description")} name="description" rows={4} maxLength={2000} defaultValue={values["description"] ?? description} error={errors["description"]} />
      <TextField label={t("repoUrl")} hint={t("repoHint")} name="repoUrl" type="url" inputMode="url" dir="ltr" placeholder="https://github.com/…" defaultValue={values["repoUrl"] ?? repoUrl} error={errors["repoUrl"]} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>{t("save")}</Button>
        <Button type="submit" name="intent" value="submit" disabled={pending}>{t("submit")}</Button>
      </div>
      <p className="text-sm text-muted">{t("submitHint")}</p>
    </form>
  );
}
