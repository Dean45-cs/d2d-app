/**
 * Erzeugt die PNG-Symbole der App aus den SVG-Vorlagen in public/.
 *
 *   npm run icons
 *
 * Vorlagen (Geometrie wie in src/components/Logo.tsx):
 *   public/icon.svg           gerundetes Quadrat mit Verlauf, Licht und
 *                             Lichtkante; Marke hell mit weichem Schatten
 *   public/icon-maskable.svg  Verlauf randlos, Marke in der sicheren Zone (80 %)
 *   public/logo-mark.svg      nur die Form - weiss als Benachrichtigungs-Symbol
 *                             (badge) fuer die Statusleiste unter Android
 *
 * Nach jeder Aenderung an den Vorlagen erneut laufen lassen und die PNGs
 * mit einchecken. In public/sw.js die VERSION erhoehen, damit installierte
 * Apps die neuen Symbole holen.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// Dunkles Ende des Verlaufs - Hintergrund, wo kein Alpha erlaubt ist.
const OPAQUE = "#06612f";

/** SVG direkt in der Zielgroesse rastern - schaerfer als nachtraegliches Skalieren. */
async function render(svg, size) {
  const buffer = Buffer.from(svg);
  const { width = size } = await sharp(buffer).metadata();
  const density = (72 * size) / width;
  return sharp(buffer, { density }).resize(size, size, { fit: "fill" });
}

async function main() {
  const icon = await readFile(pub("icon.svg"), "utf8");
  const maskable = await readFile(pub("icon-maskable.svg"), "utf8");
  const mark = await readFile(pub("logo-mark.svg"), "utf8");
  // Die Statusleiste nimmt nur die Deckkraft: Form weiss auf Transparenz.
  const badge = mark.replace(/<style>[\s\S]*?<\/style>/, "").replaceAll("currentColor", "#fff");
  // iOS rundet selbst ab und fuellt Transparenz schwarz: dort das Quadrat
  // randlos und deckend (ohne rx), sonst bleiben dunkle Ecken stehen. Die
  // Lichtkante folgt dem eigenen Radius - im Quadrat entfaellt sie.
  const square = icon.replace(/\s*<rect class="rim"[^>]*\/>/, "").replace(/\srx="[^"]*"/g, "");

  const jobs = [
    { name: "icon-192.png", svg: icon, size: 192 },
    { name: "icon-512.png", svg: icon, size: 512 },
    { name: "favicon-32.png", svg: icon, size: 32 },
    { name: "apple-touch-icon.png", svg: square, size: 180, opaque: true },
    { name: "icon-maskable-512.png", svg: maskable, size: 512, opaque: true },
    { name: "badge-96.png", svg: badge, size: 96 },
  ];

  for (const job of jobs) {
    let image = await render(job.svg, job.size);
    if (job.opaque) image = image.flatten({ background: OPAQUE });
    const png = await image.png({ compressionLevel: 9, palette: false }).toBuffer();
    await writeFile(pub(job.name), png);
    console.log(`${job.name.padEnd(24)} ${job.size} px  ${(png.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
