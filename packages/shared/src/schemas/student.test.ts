import { describe, expect, it } from "vitest";
import { updateMyProjectInputSchema, updateProfileInputSchema } from "./student";

const id = "0192f0a5-6b3c-7d3e-8a1b-123456789abc";
const base = { projectId: id, submit: false };

describe("updateMyProjectInputSchema", () => {
  it("accepte un dépôt HTTPS et normalise les espaces", () => {
    const r = updateMyProjectInputSchema.parse({ ...base, repoUrl: "  https://github.com/a/b  ", description: " texte " });
    expect(r.repoUrl).toBe("https://github.com/a/b");
    expect(r.description).toBe("texte");
  });
  it.each(["javascript:alert(1)", "http://github.com/a/b", "https://u:p@github.com/a", "data:text/html,x", "github.com/a/b", "https://localhost/x"])(
    "refuse %s",
    (repoUrl) => {
      const r = updateMyProjectInputSchema.safeParse({ ...base, repoUrl });
      expect(r.success).toBe(false);
    },
  );
  it("refuse un identifiant non UUID et une description trop longue", () => {
    expect(updateMyProjectInputSchema.safeParse({ ...base, projectId: "x" }).success).toBe(false);
    expect(updateMyProjectInputSchema.safeParse({ ...base, description: "a".repeat(2001) }).success).toBe(false);
  });
});

describe("updateProfileInputSchema", () => {
  it("exige prénom et nom, téléphone facultatif mais valide", () => {
    expect(updateProfileInputSchema.safeParse({ firstName: "", lastName: "B", locale: "FR" }).success).toBe(false);
    expect(updateProfileInputSchema.safeParse({ firstName: "A", lastName: "B", locale: "FR", phone: "abc" }).success).toBe(false);
    expect(updateProfileInputSchema.parse({ firstName: "A", lastName: "B", locale: "AR" }).phone).toBeUndefined();
  });
});

import { attendanceInputSchema, reviewProjectInputSchema } from "./student";

describe("reviewProjectInputSchema", () => {
  const base = { projectId: id, status: "VALIDATED" as const };
  it.each(["0", "15", "15.5", "20", "20.00", "9.25"])("accepte la note %s", (grade) => {
    expect(reviewProjectInputSchema.safeParse({ ...base, grade }).success).toBe(true);
  });
  it.each(["20.5", "21", "-1", "1.234", "abc", "1,5"])("refuse la note %s", (grade) => {
    expect(reviewProjectInputSchema.safeParse({ ...base, grade }).success).toBe(false);
  });
  it("exige un commentaire pour « à corriger » mais pas pour « validé »", () => {
    expect(reviewProjectInputSchema.safeParse({ ...base, status: "REVIEWED" }).success).toBe(false);
    expect(reviewProjectInputSchema.safeParse({ ...base, status: "REVIEWED", feedback: "À revoir" }).success).toBe(true);
    expect(reviewProjectInputSchema.safeParse(base).success).toBe(true);
  });
  it("traite une note vide comme absente", () => {
    expect(reviewProjectInputSchema.parse({ ...base, grade: "" }).grade).toBeUndefined();
  });
});

describe("attendanceInputSchema", () => {
  const rec = { enrollmentId: id, status: "PRESENT" as const };
  it("exige au moins une présence et un statut connu", () => {
    expect(attendanceInputSchema.safeParse({ scheduleEventId: id, records: [] }).success).toBe(false);
    expect(attendanceInputSchema.safeParse({ scheduleEventId: id, records: [{ ...rec, status: "X" }] }).success).toBe(false);
    expect(attendanceInputSchema.safeParse({ scheduleEventId: id, records: [rec] }).success).toBe(true);
  });
});
