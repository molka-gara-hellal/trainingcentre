import { getTranslations } from "next-intl/server";
import type { Course } from "@center/proto-gen/course/v1/course";
import { Link } from "@/i18n/navigation";
import { Todo } from "@/components/ui/page";
import { formatPrice, levelKey } from "@/lib/format";

/** Une formation du catalogue : une ligne lisible, pas une carte. Les valeurs inconnues restent "À définir". */
export async function CourseRow({ course, locale }: { course: Course; locale: string }) {
  const [t, lv, c] = await Promise.all([getTranslations("Courses"), getTranslations("Levels"), getTranslations("Common")]);
  const level = levelKey(course.level);
  const price = formatPrice(course.priceTnd, locale);

  return (
    <li className="border-b border-line">
      <Link
        href={`/formations/${course.slug}`}
        className="group grid gap-3 py-6 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8"
      >
        <div className="space-y-1.5">
          <p className="text-sm text-muted">{course.category?.name}</p>
          <h3 className="text-xl font-semibold group-hover:text-primary group-hover:underline group-hover:underline-offset-4">
            {course.title}
          </h3>
          {course.summary && <p className="max-w-2xl text-muted">{course.summary}</p>}
        </div>
        <dl className="grid grid-cols-3 gap-x-6 text-sm sm:min-w-80">
          <div>
            <dt className="text-muted">{t("level")}</dt>
            <dd className="font-medium">{level ? lv(level) : <Todo label={c("todo")} />}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("duration")}</dt>
            <dd className="font-medium">
              {course.durationHours ? t("hours", { count: course.durationHours }) : <Todo label={c("todo")} />}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t("price")}</dt>
            <dd className="font-medium" dir="ltr">
              {price ?? <Todo label={c("todo")} />}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}
