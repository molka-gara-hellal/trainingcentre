import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListAdminSessionsResponse } from "@center/proto-gen/course/v1/course";
import { RegistrationStatus, type GetRegistrationResponse } from "@center/proto-gen/registration/v1/registration";
import { decideRegistrationAction } from "@/actions/admin";
import { AArea, AdminForm, ARadio, ASelect, Hidden } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { Badge, Card } from "@/components/space/student-shell";
import { Notice } from "@/components/ui/page";
import { adminLoad, clients, loc, requireAdmin, rpc } from "@/lib/admin";
import { levelKey, sessionStatusKey } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";
import { formatDateTime, registrationStatusKey } from "@/lib/student-format";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.requests" });
  return buildMetadata({ locale, title: t("detailTitle"), description: t("detailTitle"), noindex: true });
}

export default async function AdminRequestPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const path = `/espace/admin/demandes/${id}`;
  await requireAdmin(locale, path);
  const [t, tr, tl, tss] = await Promise.all([
    getTranslations("Admin.requests"),
    getTranslations("Student.registrationStatus"),
    getTranslations("Levels"),
    getTranslations("SessionStatus"),
  ]);
  const { registration: r } = await adminLoad(locale, path, (ctx) => rpc<GetRegistrationResponse>(ctx, (md, o, cb) => clients().registration.getRegistration({ id, locale: loc(locale) }, md, o, cb)));
  const reg = r!;
  const sessions = await adminLoad(locale, path, (ctx) =>
    rpc<ListAdminSessionsResponse>(ctx, (md, o, cb) => clients().course.listAdminSessions({ courseId: reg.courseId, page: { page: 1, pageSize: 50 } }, md, o, cb)),
  );
  const key = registrationStatusKey(reg.status);
  const decidable = reg.status === RegistrationStatus.REGISTRATION_STATUS_PENDING || reg.status === RegistrationStatus.REGISTRATION_STATUS_WAITLIST;
  const level = levelKey(reg.level);
  const rows: Array<[string, string | undefined]> = [
    [t("f.course"), reg.courseTitle],
    [t("f.email"), reg.email],
    [t("f.phone"), reg.phone],
    [t("f.age"), String(reg.age)],
    [t("f.education"), reg.educationLevel],
    [t("f.institution"), reg.institution],
    [t("f.level"), level ? tl(level) : undefined],
    [t("f.laptop"), reg.hasOwnLaptop ? t("yes") : t("no")],
    [t("f.date"), reg.createdAt ? formatDateTime(reg.createdAt, locale) : undefined],
  ];
  return (
    <AdminShell title={`${reg.firstName} ${reg.lastName}`} lead={t("detailLead")} back={{ href: "/espace/admin/demandes", label: t("back") }}>
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("candidate")}</h2>
          {key && <Badge tone={key === "ACCEPTED" ? "good" : key === "REJECTED" ? "bad" : "warn"}>{tr(key)}</Badge>}
        </div>
        <dl className="divide-y divide-line text-sm">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="font-medium" dir="auto">{v}</dd></div>
          ))}
        </dl>
        {reg.message && (<div><h3 className="text-sm font-semibold">{t("f.message")}</h3><p className="whitespace-pre-line text-sm" dir="auto">{reg.message}</p></div>)}
        {reg.adminNote && (<div><h3 className="text-sm font-semibold">{t("f.adminNote")}</h3><p className="whitespace-pre-line text-sm" dir="auto">{reg.adminNote}</p></div>)}
      </Card>
      {decidable ? (
        <section aria-labelledby="decide" className="space-y-3">
          <h2 id="decide" className="text-xl font-semibold">{t("decision")}</h2>
          <Notice>{t("acceptHint")}</Notice>
          <AdminForm action={decideRegistrationAction} submit={t("submit")} successLabel={t("decided")}>
            <Hidden name="id" value={id} />
            <ARadio legend={t("decisionLegend")} name="decision" required options={[{ value: "ACCEPT", label: t("accept") }, { value: "WAITLIST", label: t("waitlist") }, { value: "REJECT", label: t("reject") }]} />
            <ASelect label={t("session")} hint={t("sessionHint")} name="sessionId" defaultValue={reg.sessionId ?? ""}>
              <option value="">—</option>
              {sessions.sessions.map((s) => {
                const sk = sessionStatusKey(s.status);
                return <option key={s.id} value={s.id}>{s.label ?? s.startDate ?? s.id.slice(0, 8)} — {sk ? tss(sk) : ""} ({s.seatsTaken}/{s.capacity ?? "—"})</option>;
              })}
            </ASelect>
            <AArea label={t("note")} hint={t("noteHint")} name="adminNote" rows={3} maxLength={1000} defaultValue={reg.adminNote} />
          </AdminForm>
        </section>
      ) : (
        <Notice>{t("alreadyDecided")}</Notice>
      )}
    </AdminShell>
  );
}
