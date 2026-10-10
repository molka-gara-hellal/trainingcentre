import { status } from "@grpc/grpc-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CourseLevel, Locale } from "@center/proto-gen/common/v1/common";
import {
  GetCourseRequest,
  ListCategoriesRequest,
  ListCoursesRequest,
  ListFaqsRequest,
  ListUpcomingSessionsRequest,
  SessionStatus,
  type GetCourseResponse,
  type ListCategoriesResponse,
  type ListCoursesResponse,
  type ListFaqsResponse,
  type ListUpcomingSessionsResponse,
} from "@center/proto-gen/course/v1/course";
import { enroll, NOW, seedCatalog } from "../fixtures";
import { call, resetDatabase, startTestApp, type TestApp } from "../helpers";

let app: TestApp;
let fixtures: Awaited<ReturnType<typeof seedCatalog>>;

beforeAll(async () => {
  app = await startTestApp({ now: () => NOW });
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase(app.prisma);
  fixtures = await seedCatalog(app.prisma);
});

const courses = (req: Partial<ListCoursesRequest> = {}) =>
  call<ListCoursesResponse>((cb) => app.clients.course.listCourses(ListCoursesRequest.fromPartial(req), cb));

describe("CourseService.listCourses", () => {
  it("ne renvoie que les formations PUBLIÉES et non supprimées", async () => {
    const res = await courses({ locale: Locale.LOCALE_FR });
    expect(res.courses.map((c) => c.slug).sort()).toEqual(["python-test", "web-test"]);
    expect(res.pageInfo).toMatchObject({ totalItems: 2, page: 1 });
  });

  it("n'invente aucune valeur : prix/durée/niveau absents restent absents, un vrai prix est formaté", async () => {
    const res = await courses({ locale: Locale.LOCALE_FR });
    const python = res.courses.find((c) => c.slug === "python-test")!;
    const web = res.courses.find((c) => c.slug === "web-test")!;
    expect(python.priceTnd).toBeUndefined(); // "À définir" côté interface
    expect(python.level).toBe(CourseLevel.COURSE_LEVEL_BEGINNER);
    expect(python.durationHours).toBe(30);
    expect(python.program).toEqual([{ title: "Module 1", topics: ["Sujet a", "Sujet b"] }]);
    expect(web.priceTnd).toBe("120.000");
    expect(web.level).toBeUndefined();
    expect(web.durationHours).toBeUndefined();
  });

  it("sert une formation dont les listes n'ont jamais été renseignées (cas du seed : titre seul) sans erreur", async () => {
    const web = (await courses({ locale: Locale.LOCALE_FR })).courses.find((c) => c.slug === "web-test")!;
    expect(web.objectives).toEqual([]);
    expect(web.prerequisites).toEqual([]);
    expect(web.skills).toEqual([]);
    expect(web.program).toEqual([]);
  });

  it("sert la langue demandée, avec repli sur le français", async () => {
    const res = await courses({ locale: Locale.LOCALE_EN });
    const python = res.courses.find((c) => c.slug === "python-test")!;
    const web = res.courses.find((c) => c.slug === "web-test")!;
    expect(python.title).toBe("Python (test) EN");
    expect(python.locale).toBe(Locale.LOCALE_EN);
    expect(web.title).toBe("Web (test)"); // pas de traduction EN → français
    expect(web.locale).toBe(Locale.LOCALE_FR);
  });

  it("filtre par catégorie et par recherche (insensible à la casse)", async () => {
    expect((await courses({ categorySlug: "web" })).courses.map((c) => c.slug)).toEqual(["web-test"]);
    expect((await courses({ query: "PYTHON" })).courses.map((c) => c.slug)).toEqual(["python-test"]);
    expect((await courses({ query: "inexistant" })).courses).toEqual([]);
  });

  it("pagine", async () => {
    const page1 = await courses({ page: { page: 1, pageSize: 1 } });
    const page2 = await courses({ page: { page: 2, pageSize: 1 } });
    expect(page1.courses).toHaveLength(1);
    expect(page2.courses).toHaveLength(1);
    expect(page1.courses[0]!.slug).not.toBe(page2.courses[0]!.slug);
    expect(page1.pageInfo).toMatchObject({ totalItems: 2, totalPages: 2, pageSize: 1 });
  });

  it("rejette un filtre invalide (INVALID_ARGUMENT)", async () => {
    await expect(courses({ categorySlug: "Pas Un Slug!" })).rejects.toMatchObject({
      code: status.INVALID_ARGUMENT,
    });
  });
});

describe("CourseService.getCourse", () => {
  const get = (slug: string, locale = Locale.LOCALE_FR) =>
    call<GetCourseResponse>((cb) => app.clients.course.getCourse(GetCourseRequest.fromPartial({ slug, locale }), cb));

  it("renvoie la formation et ses sessions à venir, places comprises", async () => {
    const session = await app.prisma.courseSession.create({
      data: { courseId: fixtures.courseA.id, status: "OPEN", startDate: new Date("2026-11-01"), capacity: 5, label: "Groupe 1" },
    });
    await enroll(app.prisma, session.id, 2);
    const res = await get("python-test");
    expect(res.course?.title).toBe("Python (test)");
    expect(res.upcomingSessions).toHaveLength(1);
    expect(res.upcomingSessions[0]).toMatchObject({
      label: "Groupe 1",
      startDate: "2026-11-01",
      capacity: 5,
      seatsTaken: 2,
      seatsLeft: 3,
      status: SessionStatus.SESSION_STATUS_OPEN,
    });
  });

  it.each(["brouillon-test", "supprimee-test", "inexistant-test"])(
    "NOT_FOUND pour %s (brouillon, supprimée ou inconnue : indiscernables)",
    async (slug) => {
      await expect(get(slug)).rejects.toMatchObject({ code: status.NOT_FOUND, details: "course_not_found" });
    },
  );

  it("rejette un slug invalide", async () => {
    await expect(get("../etc/passwd")).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
  });
});

describe("CourseService.listUpcomingSessions", () => {
  const upcoming = (req: Partial<ListUpcomingSessionsRequest> = {}) =>
    call<ListUpcomingSessionsResponse>((cb) =>
      app.clients.course.listUpcomingSessions(ListUpcomingSessionsRequest.fromPartial(req), cb),
    );

  it("garde planifiées/ouvertes/complètes à venir (dates 'À définir' incluses) et écarte le reste", async () => {
    const make = (label: string, data: { status: "PLANNED" | "OPEN" | "FULL" | "ONGOING" | "COMPLETED" | "CANCELLED"; startDate?: string }) =>
      app.prisma.courseSession.create({
        data: { courseId: fixtures.courseA.id, label, status: data.status, startDate: data.startDate ? new Date(data.startDate) : null },
      });
    await make("future-ouverte", { status: "OPEN", startDate: "2026-12-01" });
    await make("sans-date", { status: "PLANNED" });
    await make("aujourdhui", { status: "OPEN", startDate: "2026-10-05" });
    await make("passee", { status: "OPEN", startDate: "2026-01-01" });
    await make("terminee", { status: "COMPLETED", startDate: "2026-12-15" });
    await make("annulee", { status: "CANCELLED", startDate: "2026-12-20" });
    await make("en-cours", { status: "ONGOING", startDate: "2026-12-21" });

    const res = await upcoming();
    // Triées par date, la date inconnue en dernier
    expect(res.sessions.map((s) => s.label)).toEqual(["aujourdhui", "future-ouverte", "sans-date"]);
    expect(res.sessions.find((s) => s.label === "sans-date")?.startDate).toBeUndefined();
  });

  it("ne montre jamais les sessions d'une formation en brouillon", async () => {
    await app.prisma.courseSession.create({ data: { courseId: fixtures.courseB.id, status: "OPEN", startDate: new Date("2026-12-01") } });
    expect((await upcoming()).sessions).toEqual([]);
  });

  it("respecte la limite demandée", async () => {
    for (let i = 0; i < 3; i += 1) {
      await app.prisma.courseSession.create({ data: { courseId: fixtures.courseA.id, status: "OPEN", startDate: new Date(`2026-12-0${i + 1}`) } });
    }
    expect((await upcoming({ limit: 2 })).sessions).toHaveLength(2);
  });
});

describe("CourseService.listCategories / listFaqs", () => {
  it("traduit les catégories avec repli sur le français", async () => {
    const res = await call<ListCategoriesResponse>((cb) =>
      app.clients.course.listCategories(ListCategoriesRequest.fromPartial({ locale: Locale.LOCALE_EN }), cb),
    );
    expect(res.categories.map((c) => [c.slug, c.name])).toEqual([["web", "Web EN"], ["programmation", "Programmation"]]);
  });

  it("ne renvoie que les FAQ publiées, avec repli sur le français", async () => {
    await app.prisma.faq.createMany({
      data: [
        { locale: "FR", question: "Q publiée ?", answer: "R", published: true, sortOrder: 2 },
        { locale: "FR", question: "Q brouillon ?", answer: "R", published: false, sortOrder: 1 },
        { locale: "FR", question: "Q première ?", answer: "R", published: true, sortOrder: 0 },
      ],
    });
    const fr = await call<ListFaqsResponse>((cb) => app.clients.course.listFaqs(ListFaqsRequest.fromPartial({ locale: Locale.LOCALE_FR }), cb));
    expect(fr.faqs.map((f) => f.question)).toEqual(["Q première ?", "Q publiée ?"]);
    const ar = await call<ListFaqsResponse>((cb) => app.clients.course.listFaqs(ListFaqsRequest.fromPartial({ locale: Locale.LOCALE_AR }), cb));
    expect(ar.faqs).toHaveLength(2); // aucune FAQ arabe → repli sur le français
  });
});
