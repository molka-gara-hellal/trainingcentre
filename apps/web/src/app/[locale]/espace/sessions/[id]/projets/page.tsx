import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProjectStatus } from "@center/proto-gen/learning/v1/learning";
import { ReviewForm } from "@/components/space/review-form";
import { Badge, Card, EmptyState } from "@/components/space/student-shell";
import { TrainerShell } from "@/components/space/trainer-shell";
import { buildMetadata } from "@/lib/seo";
import { formatShortDate, projectStatusKey } from "@/lib/student-format";
import { loadSessionProjects, requireTrainer } from "@/lib/trainer";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Trainer" });
  return buildMetadata({ locale, path: `/espace/sessions/${id}/projets`, title: t("projects.title"), description: t("projects.title"), noindex: true });
}

export default async function TrainerProjectsPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireTrainer(locale, `/espace/sessions/${id}/projets`);
  const [t, ts, items] = await Promise.all([getTranslations("Trainer"), getTranslations("Student"), loadSessionProjects(locale, id)]);
  return (
    <TrainerShell title={t("projects.title")} lead={t("projects.lead")} back={{ href: `/espace/sessions/${id}`, label: t("backToSession") }}>
      {items.length === 0 ? (
        <EmptyState>{t("projects.empty")}</EmptyState>
      ) : (
        <ul className="space-y-5">
          {items.map(({ project: p, firstName, lastName }) => {
            if (!p) return null;
            const status = projectStatusKey(p.status);
            const reviewable = p.status === ProjectStatus.PROJECT_STATUS_SUBMITTED || p.status === ProjectStatus.PROJECT_STATUS_REVIEWED;
            return (
              <li key={p.id}>
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{p.title}</h2>
                      <p className="text-sm text-muted">{firstName} {lastName}</p>
                    </div>
                    {status && <Badge tone={status === "VALIDATED" ? "good" : status === "SUBMITTED" ? "warn" : "neutral"}>{ts(`projectStatus.${status}`)}</Badge>}
                  </div>
                  {p.submittedAt && <p className="text-sm text-muted">{ts("projects.submittedOn", { date: formatShortDate(p.submittedAt, locale) })}</p>}
                  {p.description && <p className="whitespace-pre-line text-sm">{p.description}</p>}
                  {p.repoUrl && (
                    <p className="text-sm">
                      <a href={p.repoUrl} target="_blank" rel="noopener noreferrer nofollow" dir="ltr" className="break-all text-primary underline underline-offset-4">{p.repoUrl}</a>
                    </p>
                  )}
                  {reviewable ? (
                    <ReviewForm projectId={p.id} feedback={p.feedback ?? ""} grade={p.grade ?? ""} status={p.status === ProjectStatus.PROJECT_STATUS_REVIEWED ? "REVIEWED" : "VALIDATED"} />
                  ) : p.status === ProjectStatus.PROJECT_STATUS_VALIDATED ? (
                    <div className="space-y-1 border-s-4 border-success bg-success/5 px-4 py-3 text-sm">
                      {p.grade && <p>{ts("projects.grade")} : <span dir="ltr" className="font-semibold">{p.grade} / 20</span></p>}
                      {p.feedback && <p className="whitespace-pre-line">{p.feedback}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">{t("projects.notSubmitted")}</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </TrainerShell>
  );
}
