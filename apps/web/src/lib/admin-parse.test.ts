import { describe, expect, it } from "vitest";
import { parseProgram, tunisDateTime } from "./admin-parse";

describe("parseProgram", () => {
  it("une ligne sans tiret ouvre un module, « - » ajoute un sujet", () => {
    expect(parseProgram("Module 1\n- Variables\n- Boucles\nModule 2\n- Fonctions")).toEqual([
      { title: "Module 1", topics: ["Variables", "Boucles"] },
      { title: "Module 2", topics: ["Fonctions"] },
    ]);
  });
  it("ignore les lignes vides, accepte CRLF et les espaces", () => {
    expect(parseProgram("  Module A \r\n\r\n -  Sujet  \r\n")).toEqual([{ title: "Module A", topics: ["Sujet"] }]);
  });
  it("sujets avant tout module : module sans titre (refusé ensuite par l'API)", () => {
    expect(parseProgram("- Orphelin")).toEqual([{ title: "", topics: ["Orphelin"] }]);
  });
  it("texte vide → programme vide", () => {
    expect(parseProgram("")).toEqual([]);
  });
});

describe("tunisDateTime", () => {
  it("interprète la saisie en heure de Tunis (UTC+1)", () => {
    expect(tunisDateTime("2026-11-02T08:00")?.toISOString()).toBe("2026-11-02T07:00:00.000Z");
  });
  it("refuse un format invalide ou une date impossible", () => {
    expect(tunisDateTime("2026-11-02 08:00")).toBeUndefined();
    expect(tunisDateTime("")).toBeUndefined();
    expect(tunisDateTime("2026-13-45T25:61")).toBeUndefined();
  });
});
