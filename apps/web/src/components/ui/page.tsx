import type { ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

/** En-tête de page : un seul <h1> par page. */
export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="border-b border-line bg-chalk">
      <Container className="py-12 sm:py-16">
        <h1 className="display max-w-3xl text-4xl sm:text-5xl">{title}</h1>
        {lead && <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p>}
      </Container>
    </header>
  );
}

export function Section({
  title,
  children,
  id,
  tone = "plain",
}: {
  title?: string;
  children: ReactNode;
  id?: string;
  tone?: "plain" | "chalk";
}) {
  const heading = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? heading : undefined} className={tone === "chalk" ? "bg-chalk" : ""}>
      <Container className="py-12 sm:py-16">
        {title && (
          <h2 id={heading} className="display mb-8 max-w-2xl text-2xl sm:text-3xl">
            {title}
          </h2>
        )}
        {children}
      </Container>
    </section>
  );
}

/** Valeur non encore décidée : toujours affichée "À définir", jamais inventée. */
export function Todo({ label }: { label: string }) {
  return <span className="rounded-sm bg-sun/25 px-1.5 py-0.5 text-sm font-medium text-ink">{label}</span>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      role="note"
      className={`border-s-4 px-5 py-4 text-sm ${tone === "warning" ? "border-sun bg-sun/15" : "border-primary bg-primary/5"}`}
    >
      {children}
    </div>
  );
}
