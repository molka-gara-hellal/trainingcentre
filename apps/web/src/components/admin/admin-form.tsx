"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { RadioGroup, SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { FormError, SubmitButton } from "@/components/ui/form-feedback";
import { buttonClasses } from "@/components/ui/button";
import { idleState, type FormState } from "@/lib/form-state";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Action = (prev: FormState, data: FormData) => Promise<FormState>;
const Ctx = createContext<{ errors: Record<string, string>; values: Record<string, string> }>({ errors: {}, values: {} });

/**
 * Formulaire d'administration : l'action serveur est passée en prop, les champs enfants (AText, AArea, ASelect…)
 * lisent erreurs et valeurs ressaisies depuis le contexte. Les messages ne sont jamais du texte brut de l'API.
 */
export function AdminForm({
  action,
  children,
  submit,
  className = "space-y-4",
  successLabel,
  hideSubmit = false,
}: {
  action: Action;
  children: ReactNode;
  submit?: string;
  className?: string;
  /** Libellé affiché au succès (déjà traduit côté serveur). */
  successLabel?: string;
  hideSubmit?: boolean;
}) {
  const [state, run] = useActionState<FormState, FormData>(action, idleState);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values = state.status === "error" ? (state.values ?? {}) : {};
  return (
    <form action={run} className={className} noValidate>
      <FormError state={state} />
      {state.status === "success" && successLabel && (
        <p role="status" className="rounded-control border border-success/40 bg-success/5 px-4 py-3 text-sm font-medium text-success">{successLabel}</p>
      )}
      <Ctx.Provider value={{ errors, values }}>{children}</Ctx.Provider>
      {!hideSubmit && submit && <SubmitButton>{submit}</SubmitButton>}
    </form>
  );
}

export const Hidden = ({ name, value }: { name: string; value: string }) => <input type="hidden" name={name} value={value} />;

export function AText({ name, defaultValue, ...rest }: { label: string; hint?: string; required?: boolean; name: string; defaultValue?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">) {
  const { errors, values } = useContext(Ctx);
  return <TextField name={name} defaultValue={values[name] ?? defaultValue ?? ""} error={errors[name]} {...rest} />;
}

export function AArea({ name, defaultValue, ...rest }: { label: string; hint?: string; required?: boolean; name: string; defaultValue?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "defaultValue">) {
  const { errors, values } = useContext(Ctx);
  return <TextAreaField name={name} defaultValue={values[name] ?? defaultValue ?? ""} error={errors[name]} {...rest} />;
}

export function ASelect({ name, defaultValue, children, ...rest }: { label: string; hint?: string; required?: boolean; name: string; defaultValue?: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name" | "defaultValue">) {
  const { errors, values } = useContext(Ctx);
  return <SelectField name={name} defaultValue={values[name] ?? defaultValue ?? ""} error={errors[name]} {...rest}>{children}</SelectField>;
}

export function ARadio({ name, defaultValue, ...rest }: { legend: string; name: string; options: { value: string; label: string }[]; required?: boolean; defaultValue?: string }) {
  const { errors, values } = useContext(Ctx);
  return <RadioGroup name={name} defaultValue={values[name] ?? defaultValue} error={errors[name]} {...rest} />;
}

/**
 * Petite action en ligne (bouton) : changement de statut, suppression… `confirm` demande une confirmation native.
 * L'erreur éventuelle s'affiche juste en dessous.
 */
export function InlineAction({
  action,
  fields,
  label,
  confirm,
  variant = "secondary",
}: {
  action: Action;
  fields: Record<string, string>;
  label: string;
  confirm?: string;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, idleState);
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-block"
    >
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending} className={buttonClasses(variant, "min-h-11 px-3 py-1.5 text-sm")}>{label}</button>
      <FormError state={state} />
    </form>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
