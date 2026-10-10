import type { ReactNode } from "react";
import { Container, PageHeader } from "@/components/ui/page";
import { loadUnreadCount } from "@/lib/student";
import { SpaceNav } from "./space-nav";

/** Cadre commun des pages de l'espace étudiant : titre, menu latéral (haut sur mobile) et contenu. */
export async function StudentShell({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  const unread = await loadUnreadCount();
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-12">
        <aside>
          <SpaceNav unread={unread} />
        </aside>
        <div className="min-w-0 space-y-8">{children}</div>
      </Container>
    </>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-control border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "bg-chalk text-ink border-line",
    good: "bg-success/10 text-success border-success/40",
    warn: "bg-sun/20 text-ink border-sun/60",
    bad: "bg-danger/10 text-danger border-danger/40",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-control border border-dashed border-line px-5 py-8 text-center text-muted">{children}</p>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2.5 w-full overflow-hidden rounded-full bg-chalk">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}
