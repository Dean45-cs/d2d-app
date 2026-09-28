import { requireRole } from "@/lib/auth";
import { handle, optionalNumber, ValidationError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listManualPrices, saveManualPrice, type ManualPriceInput } from "@/lib/energy/manual";
import { locator } from "@/lib/energy/places";
import { checkPrice, type TableRow } from "@/lib/energy/table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ROWS = 500;
/** Die oeffentliche Ortssuche erlaubt eine Anfrage pro Sekunde - mehr wuerde zu lange dauern. */
const MAX_SEARCHES = 10;

/**
 * Viele Grundversorger-Preise auf einmal - aus einer Tabelle, die im Browser
 * eingelesen wurde. Geprueft wird hier noch einmal mit denselben Regeln.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();
    const rows: TableRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) throw new ValidationError("Die Tabelle enthält keine Zeilen.");
    if (rows.length > MAX_ROWS) {
      throw new ValidationError(`Bitte höchstens ${MAX_ROWS} Zeilen auf einmal übernehmen.`);
    }

    const existing = new Map(listManualPrices(leader.team_id).map((row) => [row.postal_code, row]));
    const locate = locator(leader.team_id);
    let searches = 0;

    const ready = new Map<string, ManualPriceInput>();
    const errors: Array<{ line: number; error: string }> = [];
    let skipped = 0;

    for (const [index, row] of rows.entries()) {
      const line = Number(row?.line) || index + 1;
      const fields = row?.fields;
      if (!fields || typeof fields !== "object") {
        errors.push({ line, error: "Zeile nicht lesbar." });
        continue;
      }
      const checked = checkPrice(fields);
      if (!checked.ok) {
        if (checked.empty) skipped++;
        else errors.push({ line, error: checked.error });
        continue;
      }
      const price = checked.value;

      let lat = optionalNumber(fields.lat);
      let lng = optionalNumber(fields.lng);
      const known = existing.get(price.postal_code);
      if ((lat === null || lng === null) && known && known.lat !== null && known.lng !== null) {
        [lat, lng] = [known.lat, known.lng];
      }
      if (lat === null || lng === null) {
        let point = await locate(price.postal_code, price.city);
        if (!point && searches < MAX_SEARCHES) {
          searches++;
          point = await locate(price.postal_code, price.city, { search: true });
        }
        if (point) [lat, lng] = point;
      }
      // Dieselbe PLZ zweimal in der Tabelle: die untere Zeile gilt.
      ready.set(price.postal_code, { ...price, lat, lng });
    }

    const save = getDb().transaction((items: ManualPriceInput[]) => {
      for (const item of items) saveManualPrice(leader.team_id, leader.id, item);
    });
    save([...ready.values()]);

    const saved = [...ready.values()];
    return {
      created: saved.filter((item) => !existing.has(item.postal_code)).length,
      updated: saved.filter((item) => existing.has(item.postal_code)).length,
      skipped,
      errors,
      unlocated: saved
        .filter((item) => item.lat === null || item.lng === null)
        .map((item) => `${item.postal_code} ${item.city}`.trim()),
    };
  });
}
