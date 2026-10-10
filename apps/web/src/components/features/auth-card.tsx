import type { ReactNode } from "react";
import { Container } from "@/components/ui/page";

/** Cadre commun des pages de compte : une colonne étroite, un seul <h1>. */
export function AuthCard({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="max-w-md py-12 sm:py-16">
      <h1 className="display mb-3 text-3xl sm:text-4xl">{title}</h1>
      {lead && <p className="mb-8 text-muted">{lead}</p>}
      {children}
      {footer && <div className="mt-8 border-t border-line pt-6 text-sm">{footer}</div>}
    </Container>
  );
}
