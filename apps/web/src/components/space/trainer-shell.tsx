import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/actions/auth";
import { buttonClasses } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";

/** Cadre des pages formateur : titre, fil d'Ariane optionnel et contenu. */
export async function TrainerShell({
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
  const t = await getTranslations("Trainer");
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <Container className="space-y-8 py-8 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {back ? (
            <Link href={back.href} className="text-sm font-medium text-primary underline underline-offset-4">
              ← {back.label}
            </Link>
          ) : (
            <span />
          )}
          <form action={logoutAction}>
            <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>{t("logout")}</button>
          </form>
        </div>
        {children}
      </Container>
    </>
  );
}
