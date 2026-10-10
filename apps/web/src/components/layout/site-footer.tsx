import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSettings } from "@/lib/data";
import { Container, Todo } from "@/components/ui/page";

export async function SiteFooter() {
  const [t, c, settings] = await Promise.all([getTranslations("Footer"), getTranslations("Common"), getSettings()]);

  const value = (key: string) => {
    const setting = settings[key];
    return setting && !setting.isTodo ? setting.value : undefined;
  };
  const phone = value("PHONE");
  const email = value("EMAIL");
  const address = value("ADDRESS");
  const hours = value("OPENING_HOURS");

  return (
    <footer className="border-t border-line bg-chalk">
      <Container className="grid gap-10 py-12 md:grid-cols-3">
        <div className="space-y-3">
          <p className="text-lg font-semibold">{t("where")}</p>
          <p className="text-muted">{t("location")}</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">{t("address")}</dt>
              <dd>{address ?? <Todo label={c("todo")} />}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("hours")}</dt>
              <dd>{hours ?? <Todo label={c("todo")} />}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3">
          <p className="text-lg font-semibold">{t("reach")}</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">{t("phone")}</dt>
              <dd>
                {phone ? (
                  <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} dir="ltr" className="inline-block underline underline-offset-4">
                    {phone}
                  </a>
                ) : (
                  <Todo label={c("todo")} />
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">{t("email")}</dt>
              <dd>{email ? <a href={`mailto:${email}`} className="underline underline-offset-4">{email}</a> : <Todo label={c("todo")} />}</dd>
            </div>
          </dl>
          <Link href="/contact" className="inline-block text-sm font-medium text-primary underline underline-offset-4">
            {t("writeUs")}
          </Link>
        </div>

        <nav aria-label={t("legalNav")} className="space-y-3">
          <p className="text-lg font-semibold">{t("information")}</p>
          <ul className="space-y-1 text-sm">
            <li>
              <Link href="/mentions-legales" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">
                {t("legal")}
              </Link>
            </li>
            <li>
              <Link href="/confidentialite" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">
                {t("privacy")}
              </Link>
            </li>
            <li>
              <Link href="/a-propos" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">
                {t("about")}
              </Link>
            </li>
          </ul>
        </nav>
      </Container>
      <div className="border-t border-line py-4 text-center text-sm text-muted">
        <Container>{t("rights", { year: new Date().getFullYear() })}</Container>
      </div>
    </footer>
  );
}
