import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Card } from "@/components/space/student-shell";
import { ProfileForm } from "@/components/space/profile-form";
import { Locale } from "@center/proto-gen/common/v1/common";
import { loadProfile } from "@/lib/student";
import { logoutAction } from "@/actions/auth";
import { buttonClasses } from "@/components/ui/button";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "profile", "/espace/profil");
}

export default async function ProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/profil");
  const [t, profile] = await Promise.all([getTranslations("Student"), loadProfile(locale)]);
  const user = profile.user;
  const code = user?.locale === Locale.LOCALE_AR ? "AR" : user?.locale === Locale.LOCALE_EN ? "EN" : "FR";
  return (
    <StudentShell title={t("nav.profile")} lead={t("profile.lead")}>
      <Card className="space-y-6">
        <p className="text-sm"><span className="text-muted">{t("profile.email")} : </span><span dir="ltr" className="font-medium">{user?.email}</span></p>
        <ProfileForm firstName={user?.firstName ?? ""} lastName={user?.lastName ?? ""} phone={profile.phone ?? ""} locale={code} />
      </Card>
      <form action={logoutAction}>
        <button type="submit" className={buttonClasses("secondary")}>{t("profile.logout")}</button>
      </form>
    </StudentShell>
  );
}
