import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StudentShell } from "@/components/space/student-shell";
import { requireStudent, spaceMetadata } from "@/lib/student";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { ProjectForm } from "@/components/space/project-form";
import { isProjectEditable, formatShortDate, projectStatusKey } from "@/lib/student-format";
import { EnrollmentStatus } from "@center/proto-gen/learning/v1/learning";
import { loadEnrollments, loadProjects } from "@/lib/student";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return spaceMetadata((await params).locale, "projects", "/espace/projets");
}

export default async function ProjectsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireStudent(locale, "/espace/projets");
  const [t, projects, enrollments] = await Promise.all([getTranslations("Student"), loadProjects(locale), loadEnrollments(locale)]);
  const byId = new Map(enrollments.map((e) => [e.id, e]));
  return (
    <StudentShell title={t("nav.projects")} lead={t("projects.lead")}>
      {projects.length === 0 ? (
        <EmptyState>{t("projects.empty")}</EmptyState>
      ) : (
        <ul className="space-y-5">
          {projects.map((p) => {
            const enrollment = byId.get(p.enrollmentId);
            const status = projectStatusKey(p.status);
            const editable = isProjectEditable(p.status) && enrollment?.status === EnrollmentStatus.ENROLLMENT_STATUS_ACTIVE;
            return (
              <li key={p.id}>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{p.title}</h2>
                      {enrollment && <p className="text-sm text-muted">{enrollment.courseTitle}</p>}
                    </div>
                    {status && <Badge tone={status === "VALIDATED" ? "good" : status === "REVIEWED" ? "warn" : "neutral"}>{t(`projectStatus.${status}`)}</Badge>}
                  </div>
                  {p.submittedAt && <p className="text-sm text-muted">{t("projects.submittedOn", { date: formatShortDate(p.submittedAt, locale) })}</p>}
                  {(p.feedback || p.grade) && (
                    <div className="space-y-1 border-s-4 border-primary bg-primary/5 px-4 py-3 text-sm">
                      <p className="font-semibold">{t("projects.trainerFeedback")}</p>
                      {p.grade && <p>{t("projects.grade")} : <span dir="ltr" className="font-semibold">{p.grade} / 20</span></p>}
                      {p.feedback && <p className="whitespace-pre-line">{p.feedback}</p>}
                    </div>
                  )}
                  {editable ? (
                    <ProjectForm projectId={p.id} description={p.description ?? ""} repoUrl={p.repoUrl ?? ""} />
                  ) : (
                    <dl className="space-y-1 text-sm">
                      {p.description && <div><dt className="inline font-medium">{t("projects.description")} : </dt><dd className="inline whitespace-pre-line">{p.description}</dd></div>}
                      {p.repoUrl && (
                        <div>
                          <dt className="inline font-medium">{t("projects.repoUrl")} : </dt>
                          <dd className="inline"><a href={p.repoUrl} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-primary underline underline-offset-4">{p.repoUrl}</a></dd>
                        </div>
                      )}
                    </dl>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </StudentShell>
  );
}
