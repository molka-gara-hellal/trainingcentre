import { useId } from "react";
import { useTranslations } from "next-intl";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const control =
  "block w-full rounded-control border border-ink/30 bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-muted/70 focus-visible:border-primary aria-[invalid=true]:border-danger";

type Common = { label: string; hint?: string; error?: string; required?: boolean };

/** Message d'erreur d'un champ (code stable → texte traduit). */
function useFieldError(code: string | undefined): string | undefined {
  const t = useTranslations("Errors.field");
  if (!code) return undefined;
  return t.has(code) ? t(code) : t("invalid_value");
}

function Shell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: Common & { id: string; children: (aria: { "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode }) {
  const t = useTranslations("Common");
  const message = useFieldError(error);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = message ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? (
          <span className="ms-1 text-danger" title={t("required")}>
            *
          </span>
        ) : (
          <span className="ms-2 font-normal text-muted">({t("optional")})</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children({ "aria-describedby": describedBy, "aria-invalid": message ? true : undefined })}
      {message && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  required,
  className = "",
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      {(aria) => <input id={id} required={required} className={`${control} ${className}`} {...aria} {...props} />}
    </Shell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  rows = 5,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      {(aria) => <textarea id={id} rows={rows} required={required} className={control} {...aria} {...props} />}
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  required,
  children,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required}>
      {(aria) => (
        <select id={id} required={required} className={control} {...aria} {...props}>
          {children}
        </select>
      )}
    </Shell>
  );
}

/** Groupe de boutons radio (fieldset + legend : lu correctement par les lecteurs d'écran). */
export function RadioGroup({
  legend,
  name,
  options,
  error,
  required,
  defaultValue,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const id = useId();
  const message = useFieldError(error);
  const errorId = message ? `${id}-error` : undefined;
  return (
    <fieldset className="space-y-2" aria-describedby={errorId}>
      <legend className="text-sm font-medium">
        {legend}
        {required && <span className="ms-1 text-danger">*</span>}
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-2.5">
            <input
              type="radio"
              name={name}
              value={option.value}
              required={required}
              defaultChecked={defaultValue === option.value}
              className="size-5 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
      {message && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </fieldset>
  );
}

export function CheckboxField({
  name,
  error,
  defaultChecked,
  children,
}: {
  name: string;
  error?: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const message = useFieldError(error);
  const errorId = message ? `${id}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name={name}
          required
          defaultChecked={defaultChecked}
          aria-describedby={errorId}
          aria-invalid={message ? true : undefined}
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm leading-relaxed">{children}</span>
      </label>
      {message && (
        <p id={errorId} className="ps-8 text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

/** Piège à robots : invisible pour les humains ET pour les lecteurs d'écran, ignoré du clavier. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
