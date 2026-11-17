/**
 * Was der Tarifvergleich aus der App mitbekommt - auf dem Server
 * zusammengestellt, damit nichts Vertrauliches im Browser landet.
 *
 * - Tarife aus der Provisionsliste: nur Anbieter, Name, Sparte und
 *   Verbrauchsstaffeln, keine Provisionen.
 * - Grundversorger der eigenen Gebiete: Anbieter und Preise vom Preisblatt,
 *   damit der aktuelle Vertrag beim Grundversorger nicht abgetippt werden muss.
 */
import { loadTariffs } from "./commissions/store";
import type { ProviderLookup } from "./energy/provider";
import { readArea } from "./geo/area";
import { comparePlace, type ComparePlace, type CompareTariffOption } from "./tariff-compare";

export function compareTariffOptions(teamId: number): CompareTariffOption[] {
  return loadTariffs(teamId)
    .filter((tariff) => tariff.active && !tariff.hidden && (tariff.sparte === "STROM" || tariff.sparte === "GAS"))
    .map((tariff) => ({
      id: tariff.id,
      provider: tariff.provider,
      name: tariff.name,
      sparte: tariff.sparte as CompareTariffOption["sparte"],
      business: tariff.segment === "GEWERBE",
      ranges: tariff.bands.map((band) => [band.kwh_from, band.kwh_to] as [number, number]),
    }));
}

/** Grundversorger der Gebiete, je PLZ einmal - fuer die Auswahl auf der Seite "Tarifvergleich". */
export function comparePlaces(
  territories: Array<{ name: string; postal_code: string; city: string; area_json?: string }>,
  lookup: ProviderLookup,
): ComparePlace[] {
  const byPlz = new Map<string, ComparePlace>();
  for (const territory of territories) {
    const info = lookup.find({ postal_code: territory.postal_code, city: territory.city, area: readArea(territory.area_json) });
    const place = comparePlace(info, territory.name);
    if (!place) continue;
    const key = territory.postal_code || place.plz;
    if (!byPlz.has(key)) byPlz.set(key, { ...place, plz: key || place.plz, city: territory.city || place.city });
  }
  return [...byPlz.values()].sort((a, b) => a.plz.localeCompare(b.plz));
}
