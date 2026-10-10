import { getTranslations } from "next-intl/server";
import { CourseLevel, Locale as ProtoLocale } from "@center/proto-gen/common/v1/common";
import type { AdminCourse, CourseTranslationInput } from "@center/proto-gen/course/v1/course";
import type { CourseCategory } from "@center/proto-gen/course/v1/course";
import { saveCourseAction } from "@/actions/admin";
import { AArea, AdminForm, ASelect, AText, FormGrid, Hidden } from "./admin-form";

const LOCALES = [
  { code: "FR", proto: ProtoLocale.LOCALE_FR, dir: "ltr" },
  { code: "AR", proto: ProtoLocale.LOCALE_AR, dir: "rtl" },
  { code: "EN", proto: ProtoLocale.LOCALE_EN, dir: "ltr" },
] as const;

const programToText = (program: CourseTranslationInput["program"]) =>
  program.map((m) => [m.title, ...m.topics.map((x) => `- ${x}`)].join("\n")).join("\n");

const LEVEL_VALUE: Record<string, string> = {
  [CourseLevel.COURSE_LEVEL_BEGINNER]: "BEGINNER",
  [CourseLevel.COURSE_LEVEL_INTERMEDIATE]: "INTERMEDIATE",
  [CourseLevel.COURSE_LEVEL_ADVANCED]: "ADVANCED",
};

/** Formulaire de création / modification d'une formation (3 langues ; le français est obligatoire). */
export async function CourseForm({ course, categories }: { course?: AdminCourse; categories: CourseCategory[] }) {
  const [t, levels] = await Promise.all([getTranslations("Admin.course.form"), getTranslations("Levels")]);
  const tr = (code: (typeof LOCALES)[number]["proto"]) => course?.translations.find((x) => x.locale === code);
  return (
    <AdminForm action={saveCourseAction} submit={course ? t("save") : t("create")} successLabel={t("saved")} className="space-y-8">
      {course && <Hidden name="id" value={course.id} />}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-semibold">{t("general")}</legend>
        <FormGrid>
          <AText label={t("slug")} hint={t("slugHint")} name="slug" required dir="ltr" maxLength={80} defaultValue={course?.slug} />
          <ASelect label={t("category")} name="categoryId" required defaultValue={course?.categoryId}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </ASelect>
          <ASelect label={t("level")} name="level" defaultValue={course?.level ? LEVEL_VALUE[course.level] : ""}>
            <option value="">{t("tbd")}</option>
            <option value="BEGINNER">{levels("BEGINNER")}</option>
            <option value="INTERMEDIATE">{levels("INTERMEDIATE")}</option>
            <option value="ADVANCED">{levels("ADVANCED")}</option>
          </ASelect>
          <AText label={t("duration")} hint={t("tbdHint")} name="durationHours" inputMode="numeric" dir="ltr" defaultValue={course?.durationHours?.toString()} />
          <AText label={t("sessionsCount")} hint={t("tbdHint")} name="sessionsCount" inputMode="numeric" dir="ltr" defaultValue={course?.sessionsCount?.toString()} />
          <AText label={t("price")} hint={t("priceHint")} name="priceTnd" inputMode="decimal" dir="ltr" defaultValue={course?.priceTnd} />
        </FormGrid>
      </fieldset>
      {LOCALES.map(({ code, proto, dir }) => {
        const x = tr(proto);
        return (
          <fieldset key={code} dir={dir} lang={code.toLowerCase()} className="space-y-4 rounded-control border border-line p-5">
            <legend className="px-2 text-lg font-semibold">{t(`lang.${code}`)}{code === "FR" ? "" : ` — ${t("optionalLang")}`}</legend>
            <AText label={t("title")} name={`title_${code}`} required={code === "FR"} maxLength={150} defaultValue={x?.title} />
            <AArea label={t("summary")} name={`summary_${code}`} rows={2} maxLength={300} defaultValue={x?.summary} />
            <AArea label={t("description")} name={`description_${code}`} rows={5} maxLength={5000} defaultValue={x?.description} />
            <AArea label={t("objectives")} hint={t("perLine")} name={`objectives_${code}`} rows={4} defaultValue={x?.objectives.join("\n")} />
            <AArea label={t("prerequisites")} hint={t("perLine")} name={`prerequisites_${code}`} rows={3} defaultValue={x?.prerequisites.join("\n")} />
            <AArea label={t("skills")} hint={t("perLine")} name={`skills_${code}`} rows={3} defaultValue={x?.skills.join("\n")} />
            <AText label={t("finalProject")} name={`finalProject_${code}`} maxLength={300} defaultValue={x?.finalProject} />
            <AArea label={t("program")} hint={t("programHint")} name={`program_${code}`} rows={8} defaultValue={x ? programToText(x.program) : ""} />
          </fieldset>
        );
      })}
    </AdminForm>
  );
}
