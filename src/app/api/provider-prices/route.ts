import { requirePermission } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { handle, optionalNumber, ValidationError } from "@/lib/api";
import { deleteManualPrice, saveManualPrice } from "@/lib/energy/manual";
import { locator } from "@/lib/energy/places";
import { checkPrice, type PriceFields } from "@/lib/energy/table";

export const dynamic = "force-dynamic";

/**
 * Grundversorger-Preis eines Ortes anlegen oder aktualisieren (eine Zeile je PLZ).
 * Arbeitspreis in ct/kWh, Grundpreis in Euro pro Monat - brutto, wie auf dem Preisblatt.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requirePermission("energy.manage");
    const body = (await request.json()) as PriceFields & { id?: unknown };

    const checked = checkPrice(body);
    if (!checked.ok) throw new ValidationError(checked.error);
    const price = checked.value;

    // Eine Zeile je PLZ: ein Tippfehler in der PLZ ueberschriebe sonst still den Preis eines anderen Ortes.
    const previous = optionalNumber(body.id);
    const taken = getDb()
      .prepare("SELECT id, provider FROM provider_prices WHERE team_id = ? AND postal_code = ?")
      .get(leader.team_id, price.postal_code) as { id: number; provider: string } | undefined;
    if (taken && taken.id !== previous) {
      throw new ValidationError(
        `Für ${price.postal_code} gibt es schon einen Preis${taken.provider ? ` (${taken.provider})` : ""} – bitte diesen bearbeiten.`,
      );
    }

    let lat = optionalNumber(body.lat);
    let lng = optionalNumber(body.lng);
    // Ohne Lage kennt die App den Ort nur ueber PLZ und Namen. Mit Lage
    // erscheint er auf der Karte und gilt auch fuer Gebiete gleich nebenan.
    if (lat === null || lng === null) {
      const point = await locator(leader.team_id)(price.postal_code, price.city, { search: true });
      if (point) [lat, lng] = point;
    }

    const id = saveManualPrice(leader.team_id, leader.id, { ...price, lat, lng });

    // Beim Bearbeiten wurde die PLZ geaendert: der alte Eintrag ist damit ersetzt.
    if (previous !== null && previous !== id) deleteManualPrice(leader.team_id, previous);

    return { id, postalCode: price.postal_code, located: lat !== null && lng !== null };
  });
}
