/*
 * Schreibt src/app/themes.css: die --t-Werte jeder Akzentfarbe, abgeleitet
 * aus dem Gruen (src/lib/theme-palette.ts). Nach jeder Aenderung dort:
 *
 *   npm run themes
 *
 * Ein Test (scripts/tests/themes.test.ts) prueft, dass die Datei zum Code passt.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { themeCss } from "../src/lib/theme-palette";

const target = fileURLToPath(new URL("../src/app/themes.css", import.meta.url));
writeFileSync(target, themeCss());
console.log(`themes.css geschrieben: ${target}`);
