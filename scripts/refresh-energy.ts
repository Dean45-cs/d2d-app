/**
 * Taeglicher Abruf der Tagesquelle fuer die Energiekarte (falls eingerichtet).
 *
 *   npm run energy:refresh
 *
 * Fuer den Cron-Betrieb ohne laufende App gedacht; wer die App ohnehin
 * betreibt, kann stattdessen /api/energy/refresh aufrufen.
 */
import "./load-env";
import { feedConfig } from "../src/lib/energy/adapters";
import { refreshEnergyPrices } from "../src/lib/energy/refresh";

if (!feedConfig()) {
  console.log(
    "Keine Tagesquelle eingerichtet (ENERGY_FEED_MODE=csv|json und ENERGY_FEED_URL).\n" +
      "Die Preise der Energiekarte werden in der App gepflegt – einzeln oder als Tabelle.",
  );
  process.exit(1);
}

refreshEnergyPrices()
  .then((result) => {
    console.log(`[${result.finishedAt}] ${result.status}: ${result.message}`);
    process.exit(result.status === "ok" ? 0 : 1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
