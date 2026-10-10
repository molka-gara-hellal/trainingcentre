import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/features/auth-card";
import { LoginForm } from "@/components/features/auth-forms";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { buildMetadata } from "@/lib/seo";
import { safeNextPath } from "@/actions/helpers";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ next?: string }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return buildMetadata({ locale, path: "/connexion", title: t("loginTitle"), description: t("loginLead"), noindex: true });
}

export default async function LoginPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(`/${locale}/espace`);
  const t = await getTranslations("Auth");
  return (
    <AuthCard
      title={t("loginTitle")}
      lead={t("loginLead")}
      footer={
        <p>
          {t("noAccount")}{" "}
          <Link href="/creer-un-compte" className="font-medium text-primary underline underline-offset-4">
            {t("signupLink")}
          </Link>
        </p>
      }
    >
      <LoginForm next={next ? safeNextPath(next) : undefined} />
    </AuthCard>
  );
}
