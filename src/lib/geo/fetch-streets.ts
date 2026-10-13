/**
 * Strassenabfrage aus dem Browser - mit Zeitlimit, damit die Anzeige
 * "laedt ..." nie ewig stehen bleibt, falls der Server haengt.
 */

/** Etwas laenger als die Wartezeit des Servers (Overpass-Versuche + Ortssuche). */
const STREETS_TIMEOUT_MS = 55_000;

export class StreetsTimeout extends Error {
  constructor() {
    super("Die Straßensuche dauert zu lange. Bitte in einer Minute noch einmal versuchen.");
  }
}

export async function fetchStreets(area: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREETS_TIMEOUT_MS);
  try {
    return await fetch("/api/geo/streets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ area }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new StreetsTimeout();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
