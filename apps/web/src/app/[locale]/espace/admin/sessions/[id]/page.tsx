import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ListEnrollmentsResponse, ListTrainersResponse } from "@center/proto-gen/admin/v1/admin";
import type { GetAdminSessionResponse, ListAdminCoursesResponse, ListSessionEventsResponse } from "@center/proto-gen/course/v1/course";
import { EnrollmentStatus } from "@center/proto-gen/learning/v1/learning";
import { addEventAction, createProjectAction, deleteEventAction, issueCertificateAction, recordPaymentAction, sessionStatusAction, updateEnrollmentAction } from "@/actions/admin";
import { AdminForm, ASelect, AText, FormGrid, Hidden, InlineAction } from "@/components/admin/admin-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { SessionForm } from "@/components/admin/session-form";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { adminLoad, clients, loc, requireAdmin, rpc } from "@/lib/admin";
import { SESSION_STATUSES, sessionTone } from "@/lib/admin-ui";
import { sessionStatusKey } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";
import { formatDateTime } from "@/lib/student-format";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin.session" });
  return buildMetadata({ locale, title: t("manageTitle"), description: t("manageTitle"), noindex: true });
}

export default async function AdminSessionPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const path = `/espace/admin/sessions/${id}`;
  await requireAdmin(locale, path);
  const [t, tss, te, tp, tpm] = await Promise.all([
    getTranslations("Admin.session"),
    getTranslations("SessionStatus"),
    getTranslations("Student.enrollmentStatus"),
    getTranslations("Student.paymentStatus"),
    getTranslations("Student.paymentMethod"),
  ]);
  const [session, events, enrollments, courses, trainers] = await adminLoad(locale, path, (ctx) =>
    Promise.all([
      rpc<GetAdminSessionResponse>(ctx, (md, o, cb) => clients().course.getAdminSession({ id }, md, o, cb)),
      rpc<ListSessionEventsResponse>(ctx, (md, o, cb) => clients().course.listSessionEvents({ sessionId: id, locale: loc(locale) }, md, o, cb)),
      rpc<ListEnrollmentsResponse>(ctx, (md, o, cb) => clients().admin.listEnrollments({ sessionId: id, locale: loc(locale) }, md, o, cb)),
      rpc<ListAdminCoursesResponse>(ctx, (md, o, cb) => clients().course.listAdminCourses({ page: { page: 1, pageSize: 50 } }, md, o, cb)),
      rpc<ListTrainersResponse>(ctx, (md, o, cb) => clients().admin.listTrainers({}, md, o, cb)),
    ]),
  );
  const s = session.session!;
  const key = sessionStatusKey(s.status);
  const dayOnly = (d: Date) => formatDateTime(d, locale);
  return (
    <AdminShell title={s.courseTitle} lead={s.label ?? t("manageLead")} back={{ href: "/espace/admin/sessions", label: t("back") }}>
      <section aria-labelledby="ss-status" className="space-y-3">
        <h2 id="ss-status" className="text-xl font-semibold">{t("statusTitle")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {key && <Badge tone={sessionTone(s.status)}>{tss(key)}</Badge>}
          <span className="text-sm text-muted" dir="ltr">{s.seatsTaken}/{s.capacity ?? "—"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SESSION_STATUSES.filter((x) => x !== key).map((x) => (
            <InlineAction key={x} action={sessionStatusAction} fields={{ id, status: x }} label={t("setStatus", { status: tss(x) })} confirm={x === "CANCELLED" ? t("confirmCancel") : undefined} />
          ))}
        </div>
      </section>

      <section aria-labelledby="ss-edit" className="space-y-3">
        <h2 id="ss-edit" className="text-xl font-semibold">{t("editTitle")}</h2>
        <SessionForm session={s} courses={courses.courses} trainers={trainers.trainers} locale={locale} />
      </section>

      <section aria-labelledby="ss-events" className="space-y-3">
        <h2 id="ss-events" className="text-xl font-semibold">{t("eventsTitle")}</h2>
        {events.events.length === 0 ? (
          <EmptyState>{t("noEvents")}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {events.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span dir="ltr">{e.startsAt ? dayOnly(e.startsAt) : ""} → {e.endsAt ? dayOnly(e.endsAt) : ""}</span>
                <InlineAction action={deleteEventAction} fields={{ id: e.id }} label={t("deleteEvent")} confirm={t("confirmDeleteEvent")} variant="quiet" />
              </li>
            ))}
          </ul>
        )}
        <Card>
          <h3 className="mb-3 font-semibold">{t("addEvent")}</h3>
          <AdminForm action={addEventAction} submit={t("addEventSubmit")} successLabel={t("eventAdded")}>
            <Hidden name="sessionId" value={id} />
            <FormGrid>
              <AText label={t("startsAt")} name="startsAt" type="datetime-local" required dir="ltr" />
              <AText label={t("endsAt")} name="endsAt" type="datetime-local" required dir="ltr" />
            </FormGrid>
            <p className="text-sm text-muted">{t("tzHint")}</p>
          </AdminForm>
        </Card>
      </section>

      <section aria-labelledby="ss-enr" className="space-y-3">
        <h2 id="ss-enr" className="text-xl font-semibold">{t("enrollmentsTitle")}</h2>
        {enrollments.enrollments.length === 0 ? (
          <EmptyState>{t("noEnrollments")}</EmptyState>
        ) : (
          <ul className="space-y-4">
            {enrollments.enrollments.map((row) => {
              const e = row.enrollment!;
              const status = e.status === EnrollmentStatus.ENROLLMENT_STATUS_COMPLETED ? "COMPLETED" : e.status === EnrollmentStatus.ENROLLMENT_STATUS_DROPPED ? "DROPPED" : "ACTIVE";
              return (
                <li key={e.id}>
                  <Card className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{row.firstName} {row.lastName}</p>
                        <p className="text-sm text-muted" dir="ltr">{row.email}</p>
                      </div>
                      <Badge tone={status === "ACTIVE" ? "neutral" : status === "COMPLETED" ? "good" : "bad"}>{te(status)}</Badge>
                    </div>
                    <p className="text-sm text-muted">{t("projectsCount", { count: row.projectsCount })}{row.certificateCode ? ` · ${t("certificate")} ` : ""}{row.certificateCode && <span dir="ltr">{row.certificateCode}</span>}</p>
                    <details className="rounded-control border border-line px-4 py-2">
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t("manageEnrollment")}</summary>
                      <div className="space-y-6 py-4">
                        <AdminForm action={updateEnrollmentAction} submit={t("saveEnrollment")} successLabel={t("enrollmentSaved")}>
                          <Hidden name="id" value={e.id} />
                          <FormGrid>
                            <AText label={t("progress")} name="progressPct" inputMode="numeric" dir="ltr" defaultValue={String(e.progressPct)} />
                            <ASelect label={t("enrollmentStatus")} name="status" defaultValue={status}>
                              {(["ACTIVE", "COMPLETED", "DROPPED"] as const).map((x) => <option key={x} value={x}>{te(x)}</option>)}
                            </ASelect>
                          </FormGrid>
                        </AdminForm>
                        <AdminForm action={createProjectAction} submit={t("createProject")} successLabel={t("projectCreated")}>
                          <Hidden name="enrollmentId" value={e.id} />
                          <AText label={t("projectTitle")} name="title" required maxLength={150} />
                          <AText label={t("projectDescription")} name="description" maxLength={2000} />
                        </AdminForm>
                        <AdminForm action={recordPaymentAction} submit={t("recordPayment")} successLabel={t("paymentRecorded")}>
                          <Hidden name="enrollmentId" value={e.id} />
                          <FormGrid>
                            <AText label={t("amount")} hint={t("amountHint")} name="amount" required inputMode="decimal" dir="ltr" />
                            <ASelect label={t("paymentStatus")} name="status" required defaultValue={"PAID"}>
                              {(["UNPAID", "PARTIAL", "PAID", "REFUNDED"] as const).map((x) => <option key={x} value={x}>{tp(x)}</option>)}
                            </ASelect>
                            <ASelect label={t("method")} name="method" defaultValue="">
                              <option value="">—</option>
                              {(["CASH", "BANK_TRANSFER", "OTHER"] as const).map((x) => <option key={x} value={x}>{tpm(x)}</option>)}
                            </ASelect>
                            <AText label={t("reference")} name="reference" maxLength={100} dir="ltr" />
                          </FormGrid>
                          <AText label={t("paymentNote")} hint={t("paymentNoteHint")} name="note" maxLength={500} />
                        </AdminForm>
                        {!row.certificateCode && (
                          <InlineAction action={issueCertificateAction} fields={{ enrollmentId: e.id }} label={t("issueCertificate")} confirm={t("confirmCertificate")} variant="primary" />
                        )}
                      </div>
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
