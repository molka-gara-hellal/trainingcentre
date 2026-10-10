import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthCard } from "@/components/features/auth-card";
import { SignupForm } from "@/components/features/auth-forms";
import { Link } from "@/i18n/navigation";
import { buildMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Auth" });
  return buildMetadata({ locale, path: "/creer-un-compte", title: t("signupTitle"), description: t("signupLead"), noindex: true });
}

export default async function SignupPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");
  return (
    <AuthCard
      title={t("signupTitle")}
      lead={t("signupLead")}
      footer={
        <p>
          {t("haveAccount")}{" "}
          <Link href="/connexion" className="font-medium text-primary underline underline-offset-4">
            {t("loginLink")}
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
