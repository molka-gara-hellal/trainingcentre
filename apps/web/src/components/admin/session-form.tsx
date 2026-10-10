import { getTranslations } from "next-intl/server";
import type { CourseSession } from "@center/proto-gen/course/v1/course";
import type { ListAdminCoursesResponse } from "@center/proto-gen/course/v1/course";
import type { TrainerSummary } from "@center/proto-gen/admin/v1/admin";
import { saveSessionAction } from "@/actions/admin";
import { AArea, AdminForm, ASelect, AText, FormGrid, Hidden } from "./admin-form";

export async function SessionForm({
  session,
  courses,
  trainers,
  locale,
}: {
  session?: CourseSession;
  courses: ListAdminCoursesResponse["courses"];
  trainers: TrainerSummary[];
  locale: string;
}) {
  const t = await getTranslations("Admin.session.form");
  const label = (c: ListAdminCoursesResponse["courses"][number]) =>
    (c.translations.find((x) => x.locale.toLowerCase().endsWith(locale)) ?? c.translations[0])?.title ?? c.slug;
  return (
    <AdminForm action={saveSessionAction} submit={session ? t("save") : t("create")} successLabel={t("saved")}>
      {session && <Hidden name="id" value={session.id} />}
      {session?.roomId && <Hidden name="roomId" value={session.roomId} />}
      <FormGrid>
        <ASelect label={t("course")} name="courseId" required defaultValue={session?.courseId}>
          <option value="">—</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </ASelect>
        <ASelect label={t("trainer")} hint={t("tbdHint")} name="trainerId" defaultValue={session?.trainerId}>
          <option value="">{t("tbd")}</option>
          {trainers.map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}
        </ASelect>
        <AText label={t("label")} name="label" maxLength={100} defaultValue={session?.label} />
        <AText label={t("capacity")} hint={t("tbdHint")} name="capacity" inputMode="numeric" dir="ltr" defaultValue={session?.capacity?.toString()} />
        <AText label={t("startDate")} name="startDate" type="date" dir="ltr" defaultValue={session?.startDate} />
        <AText label={t("endDate")} name="endDate" type="date" dir="ltr" defaultValue={session?.endDate} />
      </FormGrid>
      <AArea label={t("scheduleNote")} hint={t("scheduleNoteHint")} name="scheduleNote" rows={3} maxLength={500} defaultValue={session?.scheduleNote} />
    </AdminForm>
  );
}
