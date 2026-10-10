import { getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { Container } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const t = await getTranslations("Errors.notFound");
  return (
    <Container className="max-w-xl space-y-4 py-20">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="display text-3xl">{t("title")}</h1>
      <p className="text-muted">{t("text")}</p>
      <Link href="/" className={buttonClasses("primary")}>
        {t("home")}
      </Link>
    </Container>
  );
}
