import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  listDoorbells,
  listHouseNumbers,
  listReasons,
  listTerritories,
  listVisits,
  totals,
} from "@/lib/queries";
import { TourClient } from "./TourClient";
import type { StreetWithStats } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TourPage() {
  const user = await requireUser();

  // Vertriebler sehen nur ihre zugeteilten Gebiete, die Teamleitung alle.
  const territories = listTerritories(user.team_id, {
    userId: user.role === "LEADER" ? undefined : user.id,
  }).filter((t) => t.status !== "DONE");

  const streets = territories.length
    ? (getDb()
        .prepare(
          `SELECT s.*,
                  (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id) AS visit_count,
                  (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                     AND v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')) AS met_count,
                  (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                     AND v.outcome = 'SALE') AS sale_count,
                  (SELECT MAX(v.created_at) FROM visits v WHERE v.street_id = s.id) AS last_visit_at
             FROM streets s
            WHERE s.territory_id IN (${territories.map(() => "?").join(",")})
            ORDER BY s.sort_order, s.name`,
        )
        .all(...territories.map((t) => t.id)) as StreetWithStats[])
    : [];

  // Hausnummern der eigenen Strassen: an der Tuer wird abgehakt statt getippt.
  const houseNumbers = listHouseNumbers(streets.map((s) => s.id));

  // Alle Klingelschilder gleich mitschicken statt bei Bedarf nachzuladen:
  // im Treppenhaus ist meist kein Netz, und genau dort werden sie gebraucht.
  const doorbells = listDoorbells(houseNumbers.map((h) => h.id));

  const today = new Date().toISOString().slice(0, 10);
  const todayTotals = totals(user.team_id, { userId: user.id, since: today });
  const recent = listVisits(user.team_id, { userId: user.id, limit: 8 });

  return (
    <TourClient
      territories={territories.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        postal_code: t.postal_code,
      }))}
      streets={streets}
      houseNumbers={houseNumbers}
      doorbells={doorbells}
      isLeader={user.role === "LEADER"}
      reasons={listReasons(user.team_id)}
      todayTotals={todayTotals}
      recent={recent}
      tarifrechnerUrl={
        process.env.NEXT_PUBLIC_TARIFRECHNER_URL ??
        "https://portal-ep24.de/menues/tarifrechner/"
      }
    />
  );
}
