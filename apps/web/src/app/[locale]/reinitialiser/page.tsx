import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { opaqueTokenField } from "@center/shared";
import { AuthCard } from "@/components/features/auth-card";
import { NewPasswordForm } from "@/components/features/auth-forms";
import { Notice } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return buildMetadata({ locale, path: "/reinitialiser", title: t("resetTitle"), description: t("resetLead"), noindex: true });
}

/**
 * Le lien reçu par e-mail contient un jeton à usage unique : la page n'est jamais indexée, et
 * next.config.ts envoie "Referrer-Policy: no-referrer" + "Cache-Control: no-store" pour ce chemin.
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token: raw } = await searchParams;
  const t = await getTranslations("Auth");
  const token = opaqueTokenField.safeParse(raw);

  return (
    <AuthCard title={t("resetTitle")} lead={t("resetLead")}>
      {token.success ? (
        <NewPasswordForm token={token.data} mode="reset" />
      ) : (
        <div className="space-y-4">
          <Notice tone="warning">{t("linkInvalid")}</Notice>
          <Link href="/mot-de-passe-oublie" className="font-medium text-primary underline underline-offset-4">
            {t("requestNewReset")}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
