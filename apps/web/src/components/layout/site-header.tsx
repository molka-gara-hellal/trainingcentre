import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/actions/auth";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/data";
import { buttonClasses } from "@/components/ui/button";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";

/** Logo : trois marches, écho du parcours Théorie → Carrière. Purement décoratif (le nom est écrit à côté). */
function Mark() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" className="shrink-0 rtl:-scale-x-100">
      <rect x="2" y="17" width="7" height="9" rx="1.5" fill="#1d5fbf" />
      <rect x="10.5" y="10" width="7" height="16" rx="1.5" fill="#1d5fbf" />
      <rect x="19" y="2" width="7" height="24" rx="1.5" fill="#e9a93b" />
    </svg>
  );
}

export async function SiteHeader() {
  const [t, settings, user] = await Promise.all([getTranslations("Nav"), getSettings(), getCurrentUser()]);
  const projectName = settings["PROJECT_NAME"];
  const brand = projectName && !projectName.isTodo ? projectName.value : t("brandFallback");

  const links = [
    { href: "/formations", label: t("courses") },
    { href: "/pfe", label: t("pfe") },
    { href: "/a-propos", label: t("about") },
    { href: "/contact", label: t("contact") },
  ];

  const account = user ? (
    <div className="flex items-center gap-3 whitespace-nowrap">
      <Link href="/espace" className="text-sm font-medium underline-offset-4 hover:underline">
        {t("mySpace")}
      </Link>
      <form action={logoutAction}>
        <button type="submit" className={buttonClasses("secondary", "min-h-11 px-4 py-2 text-sm")}>
          {t("logout")}
        </button>
      </form>
    </div>
  ) : (
    <div className="flex items-center gap-3 whitespace-nowrap">
      <Link href="/connexion" className="text-sm font-medium underline-offset-4 hover:underline">
        {t("login")}
      </Link>
      <Link href="/inscription" className={buttonClasses("primary", "min-h-11 px-4 py-2 text-sm")}>
        {t("register")}
      </Link>
    </div>
  );

  return (
    <header className="relative z-30 border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold">
          <Mark />
          <span className="leading-tight">{brand}</span>
        </Link>

        <nav aria-label={t("main")} className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-control px-3.5 font-medium hover:bg-chalk">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-4 xl:flex">
          <LocaleSwitcher />
          {account}
        </div>

        <MobileNav links={links}>
          <LocaleSwitcher />
          {account}
        </MobileNav>
      </div>
    </header>
  );
}
