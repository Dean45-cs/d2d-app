import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAccessibleTerritories } from "@/lib/queries";
import { providerLookup } from "@/lib/energy/provider";
import { compareTariffOptions, comparePlaces } from "@/lib/tariff-options";
import { TariffComparison } from "@/components/tariff/TariffComparison";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarifvergleich" };

/**
 * Tarifvergleich als eigene Seite - fuer Termine, Beratung am Telefon und das
 * iPad. An der Tuer oeffnet derselbe Rechner als Blatt beim Klinken.
 *
 * Mit dabei: die Tarife der Provisionsliste (nur Namen, keine Betraege) und
 * die Grundversorger der eigenen Gebiete, damit der aktuelle Vertrag beim
 * Grundversorger mit einem Tipp eingetragen ist.
 */
export default async function TariffComparisonPage() {
  const user = await requireUser();
  const places = comparePlaces(listAccessibleTerritories(user), providerLookup(user.team_id));
  return <TariffComparison layout="page" tariffs={compareTariffOptions(user.team_id)} places={places} />;
}
