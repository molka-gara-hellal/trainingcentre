import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 py-2.5 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-strong",
  secondary: "border border-ink/25 bg-surface text-ink hover:border-ink hover:bg-chalk",
  quiet: "text-primary underline-offset-4 hover:underline",
};

/** Classes d'un bouton : réutilisables sur un <Link> ou un <button>. */
export const buttonClasses = (variant: ButtonVariant = "primary", extra = ""): string =>
  `${base} ${variants[variant]} ${extra}`.trim();

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
