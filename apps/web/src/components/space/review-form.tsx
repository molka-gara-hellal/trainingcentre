"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { reviewProjectAction } from "@/actions/trainer";
import { RadioGroup, TextAreaField, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

export function ReviewForm({ projectId, feedback, grade, status }: { projectId: string; feedback: string; grade: string; status: "REVIEWED" | "VALIDATED" }) {
  const t = useTranslations("Trainer.review");
  const [state, run] = useActionState<FormState, FormData>(reviewProjectAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={run} className="space-y-4" noValidate>
      <FormError state={state} />
      {state.status === "success" && (
        <p role="status" className="rounded-control border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">
          {state.code === "validated" ? t("savedValidated") : t("savedReviewed")}
        </p>
      )}
      <input type="hidden" name="projectId" value={projectId} />
      <RadioGroup
        legend={t("decision")}
        name="status"
        required
        defaultValue={values["status"] ?? status}
        error={errors["status"]}
        options={[
          { value: "REVIEWED", label: t("toFix") },
          { value: "VALIDATED", label: t("validate") },
        ]}
      />
      <TextAreaField label={t("feedback")} hint={t("feedbackHint")} name="feedback" rows={4} maxLength={2000} defaultValue={values["feedback"] ?? feedback} error={errors["feedback"]} />
      <TextField label={t("grade")} hint={t("gradeHint")} name="grade" inputMode="decimal" dir="ltr" className="max-w-40" defaultValue={values["grade"] ?? grade} error={errors["grade"]} />
      <SubmitButton>{t("save")}</SubmitButton>
      <p className="text-sm text-muted">{t("notifyHint")}</p>
    </form>
  );
}
