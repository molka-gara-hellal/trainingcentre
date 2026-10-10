import { describe, expect, it } from "vitest";
import { courseInputSchema, recordPaymentInputSchema, scheduleEventInputSchema, settingInputSchema, updateEnrollmentInputSchema } from "./admin";

const uuid = "0198f0f0-0000-7000-8000-000000000001";
const fr = { locale: "FR" as const, title: "Titre", objectives: [], prerequisites: [], skills: [], program: [] };
const codes = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues.map((i) => i.message) ?? [];

describe("schémas d'administration", () => {
  it("formation : le français est obligatoire, les langues sont uniques", () => {
    const base = { slug: "ma-formation", categoryId: uuid };
    expect(courseInputSchema.safeParse({ ...base, translations: [fr] }).success).toBe(true);
    expect(codes(courseInputSchema.safeParse({ ...base, translations: [{ ...fr, locale: "EN" }] }))).toContain("french_required");
    expect(courseInputSchema.safeParse({ ...base, translations: [fr, fr] }).success).toBe(false);
    expect(courseInputSchema.safeParse({ ...base, slug: "Pas Valide", translations: [fr] }).success).toBe(false);
  });
  it("cours : la fin suit le début et dure au plus 12 h", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    expect(scheduleEventInputSchema.safeParse({ sessionId: uuid, startsAt: d(8), endsAt: d(10) }).success).toBe(true);
    expect(codes(scheduleEventInputSchema.safeParse({ sessionId: uuid, startsAt: d(10), endsAt: d(8) }))).toContain("end_before_start");
    expect(scheduleEventInputSchema.safeParse({ sessionId: uuid, startsAt: d(0), endsAt: new Date(Date.UTC(2026, 10, 2, 13)) }).success).toBe(false);
  });
  it("paiement : montant strictement positif, 3 décimales maximum", () => {
    const ok = { enrollmentId: uuid, status: "PAID" as const };
    expect(recordPaymentInputSchema.safeParse({ ...ok, amount: "100.500" }).success).toBe(true);
    expect(recordPaymentInputSchema.safeParse({ ...ok, amount: "0" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...ok, amount: "-5" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ ...ok, amount: "1.2345" }).success).toBe(false);
  });
  it("paramètre : clé connue, valeur « TODO » refusée si renseigné", () => {
    expect(settingInputSchema.safeParse({ key: "CITY", value: "Monastir", status: "SET" }).success).toBe(true);
    expect(settingInputSchema.safeParse({ key: "HACK", value: "x", status: "SET" }).success).toBe(false);
    expect(settingInputSchema.safeParse({ key: "PHONE", value: "TODO", status: "SET" }).success).toBe(false);
  });
  it("inscription : progression bornée, au moins un champ", () => {
    expect(updateEnrollmentInputSchema.safeParse({ id: uuid, progressPct: 100 }).success).toBe(true);
    expect(updateEnrollmentInputSchema.safeParse({ id: uuid, progressPct: 101 }).success).toBe(false);
    expect(updateEnrollmentInputSchema.safeParse({ id: uuid }).success).toBe(false);
  });
});
