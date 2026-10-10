import type { PrismaClient } from "../src/common/prisma";

/** Date "maintenant" injectée dans le serveur de test : rend les sessions "à venir" déterministes. */
export const NOW = new Date("2026-10-05T10:00:00.000Z");

/**
 * Jeu de données de TEST uniquement (jamais utilisé en dev ni en production).
 * Les titres/valeurs sont volontairement génériques : ce ne sont pas de vraies formations du centre.
 */
export async function seedCatalog(prisma: PrismaClient) {
  const web = await prisma.courseCategory.create({
    data: {
      slug: "web",
      sortOrder: 1,
      translations: { create: [{ locale: "FR", name: "Web" }, { locale: "EN", name: "Web EN" }] },
    },
  });
  const prog = await prisma.courseCategory.create({
    data: { slug: "programmation", sortOrder: 2, translations: { create: [{ locale: "FR", name: "Programmation" }] } },
  });

  // A : publiée, FR + EN, prix inconnu ("À définir")
  const courseA = await prisma.course.create({
    data: {
      slug: "python-test",
      categoryId: prog.id,
      level: "BEGINNER",
      durationHours: 30,
      status: "PUBLISHED",
      sortOrder: 1,
      translations: {
        create: [
          {
            locale: "FR",
            title: "Python (test)",
            summary: "Résumé FR",
            objectives: ["Objectif 1"],
            prerequisites: [],
            skills: ["Compétence 1"],
            program: [{ title: "Module 1", topics: ["Sujet a", "Sujet b"] }],
          },
          { locale: "EN", title: "Python (test) EN" },
        ],
      },
    },
  });
  // B : brouillon → ne doit JAMAIS apparaître côté public
  const courseB = await prisma.course.create({
    data: {
      slug: "brouillon-test",
      categoryId: web.id,
      status: "DRAFT",
      sortOrder: 2,
      translations: { create: [{ locale: "FR", title: "Brouillon (test)" }] },
    },
  });
  // C : publiée mais supprimée (suppression douce) → invisible
  await prisma.course.create({
    data: {
      slug: "supprimee-test",
      categoryId: web.id,
      status: "PUBLISHED",
      deletedAt: new Date("2026-09-01T00:00:00Z"),
      sortOrder: 3,
      translations: { create: [{ locale: "FR", title: "Supprimée (test)" }] },
    },
  });
  // D : publiée, FR seulement, avec un prix
  const courseD = await prisma.course.create({
    data: {
      slug: "web-test",
      categoryId: web.id,
      status: "PUBLISHED",
      priceTnd: "120",
      sortOrder: 4,
      translations: { create: [{ locale: "FR", title: "Web (test)" }] },
    },
  });
  return { web, prog, courseA, courseB, courseD };
}

let counter = 0;
/** Crée un étudiant (utilisateur + profil) pour remplir une session. */
export async function createStudent(prisma: PrismaClient) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `etudiant${counter}-${Date.now()}@test.invalid`,
      role: "STUDENT",
      firstName: "Étudiant",
      lastName: String(counter),
      student: { create: {} },
    },
    include: { student: true },
  });
  return user.student!;
}

export async function enroll(prisma: PrismaClient, sessionId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    const student = await createStudent(prisma);
    await prisma.enrollment.create({ data: { studentId: student.id, sessionId, status: "ACTIVE" } });
  }
}
