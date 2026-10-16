/**
 * Prueft die Preistabelle der Tagesquelle, bevor sie veroeffentlicht wird.
 *
 *   npm run energy:check -- data/grundversorger.csv
 *
 * Gibt Fehler aus (Exit-Code 1) und listet die Orte, die wieder nachgeschaut
 * werden sollten (Pruefdatum aelter als 14 Tage) sowie Orte der Staedteliste,
 * die noch ganz fehlen.
 */
import fs from "node:fs";
import { CITIES } from "../src/lib/energy/cities";
import { checkFeedCsv } from "../src/lib/energy/feed-check";

const file = process.argv[2] ?? "data/grundversorger.csv";
const { rows, issues, stale } = checkFeedCsv(fs.readFileSync(file, "utf8"));
const present = new Set(rows.map((row) => row.postal_code));
const missing = CITIES.filter((city) => !present.has(city.plz));

console.log(`${rows.length} Zeilen gelesen, ${issues.length} Fehler.`);
for (const issue of issues) console.log(`  Zeile ${issue.line} (${issue.plz}): ${issue.error}`);
if (stale.length > 0) console.log(`Nachschauen (alt): ${stale.join(", ")}`);
if (missing.length > 0) {
  console.log(`Fehlen noch (${missing.length}): ${missing.map((c) => `${c.plz} ${c.city}`).join(", ")}`);
}
process.exit(issues.length > 0 ? 1 : 0);
