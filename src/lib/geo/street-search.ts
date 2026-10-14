/**
 * Strassen einer Flaeche aus zwei Quellen - auf dem Server und im Browser gleich.
 *
 * Overpass ist die bessere Quelle: Jede Hausnummer kennt dort ihre Strasse und
 * oft auch die Zahl der Wohnungen. Die oeffentlichen Server sind aber haeufig
 * ueberlastet und lehnen ab oder schweigen. Deshalb laufen von Anfang an auch
 * die Kartenkacheln mit (tile-streets.ts). Antwortet Overpass nicht binnen
 * weniger Sekunden oder scheitert es, gilt das Ergebnis aus den Kacheln - so
 * steht nach kurzer Zeit eine Liste da, statt dass die Suche endlos laedt.
 */

import {
  QueryRejected,
  queryOverpass,
  streetQuery,
  streetsFromElements,
  type FoundStreet,
  type StreetSource,
} from "./osm-streets";
import type { Shape } from "./shape";
import { elementsFromTiles } from "./tile-streets";

/** So lange hat Overpass Vorrang. Eine gute Antwort kommt in zwei bis fuenf Sekunden. */
const OVERPASS_HEAD_START_MS = 10_000;

export interface StreetSearchOptions {
  overpassUrls: string[];
  /** Zusaetzliche Kopfzeilen, etwa der User-Agent des Servers. */
  headers?: Record<string, string>;
  /** Mit diesem Overpass-Server anfangen. */
  startAt?: number;
  /** TileJSON der Kartenkacheln, sonst OpenFreeMap. */
  tileSource?: string;
  /** Vorsprung fuer Overpass (nur fuer Tests verstellbar). */
  headStartMs?: number;
}

export interface StreetSearchResult {
  streets: FoundStreet[];
  addressCount: number;
  source: StreetSource;
  /** Der Overpass-Server, der geantwortet hat. */
  server?: number;
}

/**
 * Overpass, wenn es rechtzeitig antwortet - sonst die Kartenkacheln. Scheitern
 * beide, kommt der Fehler von Overpass (QueryRejected bleibt erkennbar).
 */
export async function searchStreets(area: Shape, options: StreetSearchOptions): Promise<StreetSearchResult> {
  const controller = new AbortController();
  const headStart = options.headStartMs ?? OVERPASS_HEAD_START_MS;

  const overpass = queryOverpass(options.overpassUrls, streetQuery(area), {
    headers: options.headers,
    startAt: options.startAt,
    signal: controller.signal,
  }).then(({ elements, server }): StreetSearchResult => ({
    ...streetsFromElements(elements, area),
    source: "overpass",
    server,
  }));

  const tiles = elementsFromTiles(area, {
    source: options.tileSource,
    signal: controller.signal,
    headers: options.headers,
  }).then((elements): StreetSearchResult => {
    const found = streetsFromElements(elements, area);
    // Leere Kacheln sind kein Ergebnis - dann lieber weiter auf Overpass warten.
    if (found.streets.length === 0) throw new Error("Keine Straßen in den Kartendaten.");
    return { ...found, source: "tiles" };
  });
  // Gewinnt Overpass, scheitern die abgebrochenen Kacheln still.
  tiles.catch(() => undefined);

  // Eine leere Antwort von Overpass gewinnt nicht sofort - vielleicht kennen die Kacheln mehr.
  const usableOverpass = overpass.then((found) => {
    if (found.streets.length === 0) throw new Error("Keine Straßen von Overpass.");
    return found;
  });

  // Die Kacheln zaehlen erst nach dem Vorsprung - oder sobald Overpass gescheitert ist.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const headStartOver = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, headStart);
    usableOverpass.catch(() => resolve());
  });

  try {
    return await Promise.any([usableOverpass, headStartOver.then(() => tiles)]);
  } catch {
    const outcome = await overpass.then(
      (found) => ({ found }),
      (error: unknown) => ({ error }),
    );
    // Overpass hat geantwortet, nur ohne Strassen - dann ist die Flaeche wirklich leer.
    if ("found" in outcome) return outcome.found;
    // Beide gescheitert: Die Meldung von Overpass sagt mehr (ausgelastet, abgelehnt ...).
    const reason = outcome.error;
    if (reason instanceof QueryRejected) throw reason;
    throw reason instanceof Error ? reason : new Error("Die Straßen konnten nicht geladen werden.");
  } finally {
    clearTimeout(timer);
    // Was noch laeuft, wird nicht mehr gebraucht.
    controller.abort();
  }
}
