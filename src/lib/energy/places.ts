/**
 * Wo fehlen noch Preise - und wo liegt ein Ort auf der Karte?
 *
 * Die Energiekarte fuellt sich am schnellsten von den eigenen Gebieten her:
 * jeder Ort, in dem das Team klingelt und fuer den noch kein Preis vorliegt,
 * erscheint dort als grauer Punkt zum Antippen und in der Vorlage fuer den
 * Tabellen-Import.
 */
import { listTerritories } from "../queries";
import { centerOf, readArea, type LatLng } from "../geo/area";
import { searchPlaces } from "../geo/osm";
import { findCity } from "./cities";
import { providerLookup } from "./provider";

export interface OpenPlace {
  /** PLZ, sonst Ortsname - ein Eintrag je Ort */
  key: string;
  postal_code: string;
  city: string;
  territories: Array<{ id: number; name: string }>;
  lat: number | null;
  lng: number | null;
  /** Namensvorschlag aus der Staedteliste - bitte mit dem Preisblatt pruefen */
  provider: string;
}

/** Orte der offenen Gebiete, fuer die noch kein Preis vorliegt. */
export function openPlaces(teamId: number): OpenPlace[] {
  const lookup = providerLookup(teamId);
  const places = new Map<string, OpenPlace>();
  for (const territory of listTerritories(teamId)) {
    if (territory.status === "DONE") continue;
    const area = readArea(territory.area_json);
    const info = lookup.find({ postal_code: territory.postal_code, city: territory.city, area });
    // Ein Preis aus dem Nachbarort zaehlt nicht: dort kann ein anderer Versorger zustaendig sein.
    if (info && (info.match === "plz" || info.match === "city")) continue;

    const key = territory.postal_code || territory.city.trim().toLowerCase();
    const center = area ? centerOf(area) : null;
    const known = places.get(key);
    if (known) {
      known.territories.push({ id: territory.id, name: territory.name });
      if (known.lat === null && center) [known.lat, known.lng] = center;
      continue;
    }
    places.set(key, {
      key,
      postal_code: territory.postal_code,
      city: territory.city,
      territories: [{ id: territory.id, name: territory.name }],
      lat: center?.[0] ?? null,
      lng: center?.[1] ?? null,
      provider: findCity(territory.postal_code, territory.city)?.provider ?? "",
    });
  }
  return [...places.values()];
}

/**
 * Bestimmt die Lage eines Ortes: Mitte eines eigenen Gebiets mit derselben
 * PLZ, sonst die Staedteliste, auf Wunsch zuletzt die Ortssuche (Nominatim,
 * hoechstens eine Anfrage pro Sekunde - fuer grosse Tabellen deshalb nur
 * begrenzt).
 */
export function locator(teamId: number) {
  const byPlz = new Map<string, LatLng>();
  for (const territory of listTerritories(teamId)) {
    if (!territory.postal_code || byPlz.has(territory.postal_code)) continue;
    const area = readArea(territory.area_json);
    if (area) byPlz.set(territory.postal_code, centerOf(area));
  }

  return async function locate(
    postalCode: string,
    city: string,
    options: { search?: boolean } = {},
  ): Promise<LatLng | null> {
    const own = byPlz.get(postalCode);
    if (own) return own;
    const known = findCity(postalCode, city);
    if (known) return [known.lat, known.lng];
    if (!options.search) return null;
    try {
      const [hit] = await searchPlaces(`${postalCode} ${city}`.trim());
      return hit ? [hit.lat, hit.lng] : null;
    } catch {
      // Ortssuche nicht erreichbar - dann eben ohne Lage.
      return null;
    }
  };
}
