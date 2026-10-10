/**
 * Seed idempotent : peut être relancé sans écraser les modifications faites depuis l'admin
 * (toutes les écritures sont des upsert avec `update: {}`).
 *
 * Règle projet : aucune donnée inventée.
 *  - Coordonnées / nom du centre => TODO
 *  - Formations => brouillons (DRAFT) avec uniquement le titre issu de la première liste de formations ;
 *    niveau, durée, prix, programme restent vides ("À définir").
 *  - Aucun compte utilisateur ici : créés en Phase 5 (hash argon2).
 */
import { config as loadDotenv } from "dotenv";
import { SITE_DEFAULTS, TODO_VALUE } from "@center/shared";
import { createPrismaClient } from "../src/common/prisma";

loadDotenv({ path: [".env", "../../.env"], quiet: true });

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL manquante (voir .env.example).");
  process.exit(1);
}
const prisma = createPrismaClient(databaseUrl);

// --- Paramètres du site -------------------------------------------------------------------------
const TODO_SETTINGS = [
  "PROJECT_NAME",
  "PHONE",
  "EMAIL",
  "ADDRESS",
  "OPENING_HOURS",
  "GOOGLE_MAPS_URL",
  "WHATSAPP_NUMBER",
  "FACEBOOK_URL",
  "INSTAGRAM_URL",
  "LINKEDIN_URL",
] as const;

// --- Catégories (traductions AR/EN provisoires, à faire relire) ---------------------------------
const CATEGORIES = [
  { slug: "programmation", sortOrder: 1, names: { FR: "Programmation", EN: "Programming", AR: "البرمجة" } },
  { slug: "web", sortOrder: 2, names: { FR: "Web", EN: "Web", AR: "الويب" } },
  { slug: "database", sortOrder: 3, names: { FR: "Bases de données", EN: "Databases", AR: "قواعد البيانات" } },
  { slug: "autres", sortOrder: 4, names: { FR: "Autres", EN: "Other", AR: "أخرى" } },
] as const;

// --- Formations : première liste, en BROUILLON, titre seul --------------------------------------
const COURSES = [
  { slug: "python", category: "programmation", title: "Python" },
  { slug: "langage-c", category: "programmation", title: "Langage C" },
  { slug: "csharp", category: "programmation", title: "C#" },
  { slug: "java", category: "programmation", title: "Java" },
  { slug: "html-css", category: "web", title: "HTML & CSS" },
  { slug: "javascript", category: "web", title: "JavaScript" },
  { slug: "react", category: "web", title: "React" },
  { slug: "nodejs", category: "web", title: "Node.js" },
  { slug: "sql", category: "database", title: "SQL" },
  { slug: "postgresql", category: "database", title: "PostgreSQL" },
  { slug: "git-github", category: "autres", title: "Git & GitHub" },
] as const;

async function main() {
  // Paramètres du site
  for (const key of TODO_SETTINGS) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: TODO_VALUE, status: "TODO" },
      update: {},
    });
  }
  // Valeurs réellement connues
  for (const [key, value] of [
    ["CITY", SITE_DEFAULTS.CITY],
    ["COUNTRY", SITE_DEFAULTS.COUNTRY],
  ] as const) {
    await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value, status: "SET" },
      update: {},
    });
  }

  // Catégories
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const category = await prisma.courseCategory.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, sortOrder: c.sortOrder },
      update: {},
    });
    categoryIds.set(c.slug, category.id);
    for (const locale of ["FR", "EN", "AR"] as const) {
      await prisma.courseCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale } },
        create: { categoryId: category.id, locale, name: c.names[locale] },
        update: {},
      });
    }
  }

  // Formations (DRAFT, rien de publié)
  let order = 0;
  for (const c of COURSES) {
    order += 1;
    const categoryId = categoryIds.get(c.category);
    if (!categoryId) throw new Error(`Catégorie inconnue : ${c.category}`);
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, categoryId, status: "DRAFT", sortOrder: order },
      update: {},
    });
    await prisma.courseTranslation.upsert({
      where: { courseId_locale: { courseId: course.id, locale: "FR" } },
      create: { courseId: course.id, locale: "FR", title: c.title },
      update: {},
    });
  }

  // Salles : 2 salles au lancement, ~10 places chacune (capacité indicative, modifiable)
  for (const name of ["Salle 1", "Salle 2"]) {
    await prisma.room.upsert({ where: { name }, create: { name, capacity: 10 }, update: {} });
  }

  const counts = {
    settings: await prisma.siteSetting.count(),
    categories: await prisma.courseCategory.count(),
    courses: await prisma.course.count(),
    rooms: await prisma.room.count(),
  };
  console.log("Seed terminé :", counts);
}

main()
  .catch((err) => {
    console.error("Seed en échec :", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
