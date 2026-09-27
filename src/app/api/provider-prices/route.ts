import { requireRole } from "@/lib/auth";
import { handle, optionalNumber, optionalText, requireText, ValidationError } from "@/lib/api";
import { saveManualPrice } from "@/lib/energy/manual";
import { searchPlaces } from "@/lib/geo/osm";

export const dynamic = "force-dynamic";

/** Arbeitspreis in ct/kWh - brutto, wie auf dem Preisblatt. */
function workingPrice(value: unknown, label: string): number | null {
  const n = optionalNumber(value);
  if (n === null) return null;
  if (n < 3 || n > 150) {
    throw new ValidationError(`${label}: Arbeitspreis bitte in Cent pro kWh angeben (z. B. 38,5).`);
  }
  return Math.round(n * 1000) / 1000;
}

/** Grundpreis kommt in Euro pro Monat und wird als Jahresbetrag gespeichert. */
function basePerYear(value: unknown, label: string): number | null {
  const n = optionalNumber(value);
  if (n === null) return null;
  if (n < 0 || n > 200) {
    throw new ValidationError(`${label}: Grundpreis bitte in Euro pro Monat angeben (z. B. 13,50).`);
  }
  return Math.round(n * 12 * 100) / 100;
}

/** Grundversorger-Preis eines Ortes anlegen oder aktualisieren (eine Zeile je PLZ). */
export async function POST(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();

    const postalCode = requireText(body.postalCode, "PLZ", 5);
    if (!/^\d{5}$/.test(postalCode)) throw new ValidationError("Bitte eine fünfstellige PLZ angeben.");
    const city = optionalText(body.city, 120);
    const provider = requireText(body.provider, "Grundversorger", 120);

    const stromCt = workingPrice(body.stromCt, "Strom");
    const gasCt = workingPrice(body.gasCt, "Gas");
    if (stromCt === null && gasCt === null) {
      throw new ValidationError("Bitte mindestens den Strom- oder den Gaspreis eintragen.");
    }

    const validFrom = optionalText(body.validFrom, 10);
    if (validFrom && !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      throw new ValidationError("„Gültig ab“ bitte als Datum angeben.");
    }
    const sourceUrl = optionalText(body.sourceUrl, 500);
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      throw new ValidationError("Der Link zum Preisblatt muss mit https:// beginnen.");
    }

    let lat = optionalNumber(body.lat);
    let lng = optionalNumber(body.lng);
    // Ohne Lage kennt die App den Ort nur ueber PLZ und Namen. Mit Lage
    // gilt der Preis auch fuer Gebiete gleich nebenan.
    if (lat === null || lng === null) {
      try {
        const [hit] = await searchPlaces(`${postalCode} ${city}`.trim());
        if (hit) {
          lat = hit.lat;
          lng = hit.lng;
        }
      } catch {
        // Ortssuche nicht erreichbar - dann eben ohne Lage.
      }
    }

    const id = saveManualPrice(leader.team_id, leader.id, {
      postal_code: postalCode,
      city,
      provider,
      gas_provider: optionalText(body.gasProvider, 120),
      lat,
      lng,
      strom_ct_kwh: stromCt,
      strom_base_eur: basePerYear(body.stromBaseMonth, "Strom"),
      gas_ct_kwh: gasCt,
      gas_base_eur: basePerYear(body.gasBaseMonth, "Gas"),
      valid_from: validFrom,
      source_url: sourceUrl,
    });
    return { id };
  });
}
