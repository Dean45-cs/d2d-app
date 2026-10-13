/**
 * Strassen einer Flaeche aus dem Browser laden.
 *
 * Zuerst fragt das Geraet Overpass selbst - mit der eigenen IP-Adresse. Der
 * App-Server laeuft bei einem Hoster, dessen Ausgangs-IP sich viele teilen;
 * deren Overpass-Kontingent ist oft verbraucht, und dann kommen ueber den
 * Server gar keine Strassen. Erst wenn der direkte Weg scheitert (etwa weil
 * ein Netz die Server sperrt), geht die Anfrage ueber den App-Server.
 */

import { centerOf, type LatLng } from "./area";
import {
  DEFAULT_OVERPASS_URLS,
  EMPTY_PLACE,
  QueryRejected,
  checkAreaSize,
  placeFromAddress,
  queryOverpass,
  streetQuery,
  streetsFromElements,
  type AreaStreets,
  type NominatimAddress,
  type PlaceInfo,
} from "./osm-streets";
import { mainRing, type Shape } from "./shape";

/** Etwas laenger als die Wartezeit des Servers (Overpass-Versuche + Ortssuche). */
const SERVER_TIMEOUT_MS = 50_000;
/** PLZ und Ort sind nur Beiwerk - dafuer wartet niemand laenger. */
const PLACE_TIMEOUT_MS = 6_000;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

/** Fehler mit einer Meldung, die so in der App angezeigt werden kann. */
export class StreetsError extends Error {}

export async function loadStreets(area: Shape): Promise<AreaStreets> {
  let areaSqKm: number;
  try {
    areaSqKm = checkAreaSize(area);
  } catch (error) {
    throw new StreetsError(error instanceof Error ? error.message : "Die Fläche ist zu groß.");
  }

  try {
    const [{ elements }, place] = await Promise.all([
      queryOverpass(DEFAULT_OVERPASS_URLS, streetQuery(area)),
      placeOf(centerOf(mainRing(area) ?? area[0][0])),
    ]);
    return { ...streetsFromElements(elements, area), place, areaSqKm };
  } catch (error) {
    // Eine abgelehnte Abfrage lehnt auch der Server ab - da hilft kein Umweg.
    if (error instanceof QueryRejected) throw new StreetsError(error.message);
    console.warn("[strassen] direkt nicht geklappt, versuche den App-Server:", error);
  }

  return viaServer(area);
}

/** Der Umweg ueber /api/geo/streets - mit Zeitlimit, damit nichts ewig laedt. */
async function viaServer(area: Shape): Promise<AreaStreets> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
  try {
    const response = await fetch("/api/geo/streets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new StreetsError(data.error ?? "Die Straßen konnten nicht geladen werden.");
    }
    return data as AreaStreets;
  } catch (error) {
    if (error instanceof StreetsError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new StreetsError(
        "Die Straßensuche dauert zu lange. Bitte in einer Minute noch einmal versuchen.",
      );
    }
    throw new StreetsError("OpenStreetMap ist gerade nicht erreichbar.");
  } finally {
    clearTimeout(timer);
  }
}

/** PLZ, Ort und Stadtteil zur Mitte der Flaeche - leer, wenn Nominatim nicht antwortet. */
async function placeOf([lat, lng]: LatLng): Promise<PlaceInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLACE_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${NOMINATIM_URL}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=de` +
        `&lat=${lat}&lon=${lng}`,
      { signal: controller.signal },
    );
    if (!response.ok) return EMPTY_PLACE;
    const hit = (await response.json()) as { address?: NominatimAddress };
    return placeFromAddress(hit.address);
  } catch {
    return EMPTY_PLACE;
  } finally {
    clearTimeout(timer);
  }
}
