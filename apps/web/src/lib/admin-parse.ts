// Analyse de champs de formulaire d'administration (fonctions pures, testées).

/** « Titre du module » puis « - sujet » : une ligne sans tiret ouvre un module. */
export function parseProgram(source: string): Array<{ title: string; topics: string[] }> {
  const modules: Array<{ title: string; topics: string[] }> = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("-")) {
      const topic = line.replace(/^-+\s*/, "").trim();
      if (!topic) continue;
      (modules.at(-1) ?? modules[modules.push({ title: "", topics: [] }) - 1])!.topics.push(topic);
    } else {
      modules.push({ title: line, topics: [] });
    }
  }
  return modules;
}

/** `datetime-local` → heure de Tunis (UTC+1, sans heure d'été) ; format invalide → undefined (l'API répond « required »). */
export const tunisDateTime = (value: string): Date | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

