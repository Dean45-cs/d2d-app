import assert from "node:assert/strict";
import { test } from "node:test";

// Leer gelassene Zeilen aus der .env ("OVERPASS_URL=") - vor dem Import setzen,
// die Adressen werden beim Laden des Moduls gelesen.
process.env.OVERPASS_URL = " , ";
process.env.NOMINATIM_URL = "";
process.env.GEO_USER_AGENT = "";

test("leere Geo-Einstellungen fallen auf die Standard-Server zurück", async () => {
  const { geoSources } = await import("../../src/lib/geo/osm");
  const sources = geoSources();
  assert.ok(sources.overpass.length > 0, "ohne Overpass-Server käme nie eine Antwort");
  assert.ok(sources.overpass.every((url) => url.startsWith("https://")));
  assert.equal(sources.nominatim, "https://nominatim.openstreetmap.org");
});
