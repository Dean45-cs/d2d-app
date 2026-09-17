/**
 * Taeglicher Abruf der Grundversorger-Preise fuer die Energiekarte.
 *
 *   npm run energy:refresh
 *
 * Fuer den Cron-Betrieb ohne laufende App gedacht; wer die App ohnehin
 * betreibt, kann stattdessen /api/energy/refresh aufrufen.
 */
import "./load-env";
import { refreshEnergyPrices } from "../src/lib/energy/refresh";

refreshEnergyPrices()
  .then((result) => {
    console.log(`[${result.finishedAt}] ${result.status}: ${result.message}`);
    if (result.isDemo) {
      console.log(
        "Hinweis: Es wurden Demo-Beispielwerte geschrieben. Für echte Tagespreise " +
          "ENERGY_FEED_MODE und ENERGY_FEED_URL setzen.",
      );
    }
    process.exit(result.status === "ok" ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
