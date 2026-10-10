"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { submitRegistrationAction } from "@/actions/public";
import { Link } from "@/i18n/navigation";
import { CheckboxField, Honeypot, RadioGroup, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton, SuccessPanel } from "@/components/ui/form-feedback";
import { idleState, type FormState } from "@/lib/form-state";

export type CourseOption = { slug: string; title: string };
export type SessionOption = { id: string; courseSlug: string; label: string };

export function RegistrationForm({
  courses,
  sessions,
  defaultCourse,
  defaultSession,
}: {
  courses: CourseOption[];
  sessions: SessionOption[];
  defaultCourse?: string;
  defaultSession?: string;
}) {
  const t = useTranslations("Registration");
  const lv = useTranslations("Levels");
  const [state, action] = useActionState<FormState, FormData>(submitRegistrationAction, idleState);
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const [course, setCourse] = useState(values["courseSlug"] ?? defaultCourse ?? "");

  if (state.status === "success") {
    return (
      <SuccessPanel title={t("successTitle")}>
        <p>{t("successBody")}</p>
      </SuccessPanel>
    );
  }

  const courseSessions = sessions.filter((s) => s.courseSlug === course);

  return (
    <form action={action} className="relative space-y-6" noValidate>
      <FormError state={state} />
      <Honeypot />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label={t("firstName")} name="firstName" autoComplete="given-name" required defaultValue={values["firstName"]} error={errors["firstName"]} />
        <TextField label={t("lastName")} name="lastName" autoComplete="family-name" required defaultValue={values["lastName"]} error={errors["lastName"]} />
        <TextField label={t("email")} name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={values["email"]} error={errors["email"]} />
        <TextField label={t("phone")} name="phone" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" required defaultValue={values["phone"]} error={errors["phone"]} />
        <TextField label={t("age")} name="age" type="number" inputMode="numeric" min={10} max={100} required defaultValue={values["age"]} error={errors["age"]} />
        <TextField label={t("educationLevel")} hint={t("educationLevelHint")} name="educationLevel" required defaultValue={values["educationLevel"]} error={errors["educationLevel"]} />
      </div>
      <TextField label={t("institution")} name="institution" defaultValue={values["institution"]} error={errors["institution"]} />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={t("course")}
          name="courseSlug"
          required
          value={course}
          onChange={(event) => setCourse(event.target.value)}
          error={errors["courseSlug"]}
        >
          <option value="">{t("chooseCourse")}</option>
          {courses.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("session")} hint={courseSessions.length === 0 ? t("noSession") : undefined} name="sessionId" defaultValue={values["sessionId"] ?? defaultSession ?? ""} error={errors["sessionId"]}>
          <option value="">{t("anySession")}</option>
          {courseSessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
      </div>

      <SelectField label={t("level")} name="level" required defaultValue={values["level"] ?? ""} error={errors["level"]}>
        <option value="">{t("chooseLevel")}</option>
        <option value="BEGINNER">{lv("BEGINNER")}</option>
        <option value="INTERMEDIATE">{lv("INTERMEDIATE")}</option>
        <option value="ADVANCED">{lv("ADVANCED")}</option>
      </SelectField>

      <RadioGroup
        legend={t("laptop")}
        name="hasOwnLaptop"
        required
        defaultValue={values["hasOwnLaptop"]}
        error={errors["hasOwnLaptop"]}
        options={[
          { value: "yes", label: t("yes") },
          { value: "no", label: t("no") },
        ]}
      />

      <TextAreaField label={t("message")} name="message" defaultValue={values["message"]} error={errors["message"]} />

      <CheckboxField name="consentGiven" error={errors["consentGiven"]}>
        {t.rich("consent", {
          link: (chunks) => (
            <Link href="/confidentialite" className="font-medium text-primary underline underline-offset-4">
              {chunks}
            </Link>
          ),
        })}
      </CheckboxField>

      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}
