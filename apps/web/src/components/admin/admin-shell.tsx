import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/actions/auth";
import { buttonClasses } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { AdminNav } from "./admin-nav";

/** Cadre commun des pages d'administration : titre, menu latéral (haut sur mobile) et contenu. */
export async function AdminShell({
  title,
  lead,
  back,
  children,
}: {
  title: string;
  lead?: string;
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  const t = await getTranslations("Admin");
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-12">
        <aside className="space-y-4">
          <AdminNav />
          <form action={logoutAction}>
            <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{t("logout")}</button>
          </form>
        </aside>
        <div className="min-w-0 space-y-8">
          {back && (
            <Link href={back.href} className="inline-block text-sm font-medium text-primary underline underline-offset-4">← {back.label}</Link>
          )}
          {children}
        </div>
      </Container>
    </>
  );
}

/** Pagination simple (précédent / suivant) conservant les autres paramètres de recherche. */
export async function Pager({ page, totalPages, path, params = {} }: { page: number; totalPages: number; path: string; params?: Record<string, string | undefined> }) {
  if (totalPages <= 1) return null;
  const t = await getTranslations("Admin.pager");
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${path}?${q.toString()}`;
  };
  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-4 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="font-medium text-primary underline underline-offset-4">← {t("previous")}</Link> : <span />}
      <span className="text-muted">{t("page", { page, total: totalPages })}</span>
      {page < totalPages ? <Link href={href(page + 1)} className="font-medium text-primary underline underline-offset-4">{t("next")} →</Link> : <span />}
    </nav>
  );
}

/** Tableau responsive : défilement horizontal plutôt que débordement de page. */
export function DataTable({ caption, head, children }: { caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full min-w-[40rem] text-start text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-chalk text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line align-top">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => <td className={`px-3 py-3 ${className}`}>{children}</td>;
