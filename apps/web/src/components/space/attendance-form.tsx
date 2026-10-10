"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { markAttendanceAction } from "@/actions/trainer";
import { TextField } from "@/components/ui/fields";
import { FormError, SubmitButton } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

export type AttendanceRow = { enrollmentId: string; name: string; email: string; status?: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"; note?: string };
const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export function AttendanceForm({ eventId, rows }: { eventId: string; rows: AttendanceRow[] }) {
  const t = useTranslations("Trainer.attendance");
  const [state, run] = useActionState<FormState, FormData>(markAttendanceAction, idleState);
  return (
    <form action={run} className="space-y-6" noValidate>
      <FormError state={state} />
      {state.status === "error" && state.fieldErrors?.["records"] && (
        <p role="alert" className="text-sm font-medium text-danger">{t("pickOne")}</p>
      )}
      {state.status === "success" && (
        <p role="status" className="rounded-control border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">{t("saved")}</p>
      )}
      <input type="hidden" name="scheduleEventId" value={eventId} />
      <ul className="divide-y divide-line border-y border-line">
        {rows.map((row) => (
          <li key={row.enrollmentId} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto_14rem] lg:items-center">
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-muted" dir="ltr">{row.email}</p>
            </div>
            <fieldset className="flex flex-wrap gap-x-5 gap-y-1">
              <legend className="sr-only">{t("statusFor", { name: row.name })}</legend>
              {STATUSES.map((status) => (
                <label key={status} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="radio" name={`status_${row.enrollmentId}`} value={status} defaultChecked={row.status === status} className="size-5 accent-primary" />
                  {t(`status.${status}`)}
                </label>
              ))}
            </fieldset>
            <TextField label={t("note")} name={`note_${row.enrollmentId}`} maxLength={300} defaultValue={row.note ?? ""} />
          </li>
        ))}
      </ul>
      <SubmitButton>{t("save")}</SubmitButton>
    </form>
  );
}
