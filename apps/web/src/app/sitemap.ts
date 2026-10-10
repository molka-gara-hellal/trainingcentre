import type { MetadataRoute } from "next";
import { LOCALES } from "@center/shared";
import { getCourses } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic"; // le catalogue change : pas de génération au build (l'API n'est pas joignable)

const STATIC_PATHS = ["/", "/formations", "/inscription", "/pfe", "/a-propos", "/contact", "/mentions-legales", "/confidentialite"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data } = await getCourses("fr", {}, 100);
  const paths = [...STATIC_PATHS, ...data.courses.map((c) => `/formations/${c.slug}`)];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(locale, path),
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(l, path)])) },
    })),
  );
}
