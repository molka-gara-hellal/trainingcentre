// Vérifie que fr.json, en.json et ar.json ont EXACTEMENT les mêmes clés (et les mêmes variables {x}).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/messages");
const locales = ["fr", "en", "ar"];
const data = Object.fromEntries(locales.map((l) => [l, JSON.parse(readFileSync(join(dir, `${l}.json`), "utf8"))]));

const flatten = (value, prefix = "", out = new Map()) => {
  if (Array.isArray(value)) {
    out.set(`${prefix}#length`, String(value.length));
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.set(prefix, String(value));
  return out;
};

const variables = (text) => [...text.matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1]).sort().join(",");
const rich = (text) => [...text.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort().join(",");

const base = flatten(data.fr);
let problems = 0;
for (const locale of locales.slice(1)) {
  const other = flatten(data[locale]);
  for (const key of base.keys()) {
    if (!other.has(key)) { console.error(`[${locale}] clé manquante : ${key}`); problems++; continue; }
    if (key.endsWith("#length")) { if (base.get(key) !== other.get(key)) { console.error(`[${locale}] taille différente : ${key}`); problems++; } continue; }
    if (variables(base.get(key)) !== variables(other.get(key))) { console.error(`[${locale}] variables différentes : ${key}`); problems++; }
    if (rich(base.get(key)) !== rich(other.get(key))) { console.error(`[${locale}] balises différentes : ${key}`); problems++; }
  }
  for (const key of other.keys()) if (!base.has(key)) { console.error(`[${locale}] clé en trop : ${key}`); problems++; }
}
if (problems > 0) { console.error(`${problems} problème(s) de traduction.`); process.exit(1); }
console.log(`Messages OK : ${base.size} entrées identiques en ${locales.join(", ")}.`);
