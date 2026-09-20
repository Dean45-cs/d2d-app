/**
 * Klingelschilder: Namen zerlegen und benennen.
 *
 * Bewusst ohne Datenbankbezug, damit sowohl die Tuer-Oberflaeche als auch die
 * API-Route dieselbe Logik benutzen - der Client braucht sie fuer die sofortige
 * Anzeige ohne Netz, der Server zur Pruefung.
 */

export interface DoorbellInput {
  label: string;
  floor: string;
}

/** Mehr Klingeln hat auch ein Hochhaus nicht. */
export const MAX_BELLS_PER_HOUSE = 200;

export const MAX_LABEL_LENGTH = 60;
export const MAX_FLOOR_LENGTH = 20;

/** Name in Speicherform bringen: Leerraum vereinheitlichen, Laenge begrenzen. */
export function normalizeLabel(value: unknown): string {
  return clean(value, MAX_LABEL_LENGTH);
}

/** Etage in Speicherform bringen. */
export function normalizeFloor(value: unknown): string {
  return clean(value, MAX_FLOOR_LENGTH);
}

/** Vergleichsform eines Schildnamens - Gross-/Kleinschreibung und Leerzeichen egal. */
export function bellKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}

/**
 * Die abgetippte Namensliste vom Klingelbrett, eine Zeile je Schild.
 * Nach einem Komma oder Semikolon darf die Etage stehen:
 *   Mueller, 2. OG
 *   Schmidt
 */
export function parseDoorbellLines(raw: string): DoorbellInput[] {
  const seen = new Set<string>();
  const out: DoorbellInput[] = [];

  for (const line of String(raw ?? "").split("\n")) {
    const parts = line.split(/[;,]/);
    const label = normalizeLabel(parts[0]);
    if (!label) continue;
    const key = bellKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, floor: normalizeFloor(parts.slice(1).join(" ")) });
    if (out.length >= MAX_BELLS_PER_HOUSE) break;
  }
  return out;
}

/**
 * Schnellanlage ohne Namen: "Klingel 1", "Klingel 2", ...
 *
 * Gezaehlt wird hinter der hoechsten schon vergebenen Nummer weiter, damit ein
 * zweiter Durchgang die vorhandenen Schilder nicht doppelt anlegt.
 */
export function numberedBells(count: number, existing: string[]): DoorbellInput[] {
  const taken = new Set(existing.map(bellKey));
  let start = 0;
  for (const label of existing) {
    const match = label.trim().match(/^Klingel\s+(\d+)$/i);
    if (match) start = Math.max(start, Number(match[1]));
  }

  const wanted = Math.max(0, Math.min(MAX_BELLS_PER_HOUSE, Math.round(count) || 0));
  const out: DoorbellInput[] = [];
  let n = start;
  while (out.length < wanted && n < start + wanted + MAX_BELLS_PER_HOUSE) {
    n += 1;
    const label = `Klingel ${n}`;
    if (taken.has(bellKey(label))) continue;
    out.push({ label, floor: "" });
  }
  return out;
}

function clean(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
