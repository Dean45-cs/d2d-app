import type { Metadata } from "next";
import { hasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  listAppointments,
  listDoorbells,
  listMembers,
  listHouseNumbers,
  listReasons,
  listAccessibleTerritories,
  listVisits,
  totals,
} from "@/lib/queries";
import { TourClient } from "./TourClient";
import { providerLookup } from "@/lib/energy/provider";
import { readArea } from "@/lib/geo/area";
import type { StreetWithStats } from "@/lib/queries";
import { getLevelProgress } from "@/lib/level-queries";
import { berlinMidnight, berlinSlot } from "@/lib/format";
import type { Territory } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Klinken" };

export default async function TourPage({
  searchParams,
}: {
  searchParams: Promise<{ gebiet?: string; street?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Vertriebler sehen nur ihre zugeteilten Gebiete, die Teamleitung alle.
  const accessible = listAccessibleTerritories(user).filter((t) => t.status !== "DONE");

  const streetRows = (where: string, values: number[]) =>
    getDb()
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id) AS visit_count,
                (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                   AND v.outcome IN ('MET_NO_SALE','APPOINTMENT','SALE')) AS met_count,
                (SELECT COUNT(*) FROM visits v WHERE v.street_id = s.id
                   AND v.outcome = 'SALE') AS sale_count,
                (SELECT MAX(v.created_at) FROM visits v WHERE v.street_id = s.id) AS last_visit_at
           FROM streets s
          WHERE ${where}
          ORDER BY s.sort_order, s.name`,
      )
      .all(...values) as StreetWithStats[];
  const ownStreets = accessible.length
    ? streetRows(`s.territory_id IN (${accessible.map(() => "?").join(",")})`, accessible.map((t) => t.id))
    : [];

  /*
   * Die eigenen Termine: die von heute und die kommenden, dazu die juengsten
   * ueberfaelligen. Was davon "heute" ist, entscheidet das Geraet: an der
   * Tuer zaehlt die Uhr des Verkaeufers, nicht die des Servers.
   */
  const today = berlinSlot().slice(0, 10);
  const appointments = [
    ...listAppointments(user.team_id, { userId: user.id, from: today, limit: 30 }),
    ...listAppointments(user.team_id, { userId: user.id, before: today, limit: 5 }),
  ];

  /*
   * Termine in Gebieten, die nicht (mehr) in der Tour stehen - uebergeben mit
   * "Termine bleiben" oder als fertig markiert: deren Tueren fahren trotzdem
   * mit, aber nur diese Tueren. Dort erfassen darf man nur wegen des Termins.
   */
  const known = new Set(ownStreets.map((s) => s.id));
  // Alle offenen eigenen Termine dort, nicht nur die angezeigten: jede Termin-Tuer muss sich oeffnen lassen.
  const foreignDoors = (
    getDb()
      .prepare(
        `SELECT v.street_id, v.house_number, v.doorbell_id FROM visits v
          WHERE +v.team_id = ? AND v.outcome = 'APPOINTMENT' AND v.follow_up_done_at IS NULL
            AND v.follow_up_at IS NOT NULL AND COALESCE(v.follow_up_user_id, v.user_id) = ?
            AND v.street_id IS NOT NULL`,
      )
      .all(user.team_id, user.id) as Array<{ street_id: number; house_number: string; doorbell_id: number | null }>
  ).filter((door) => !known.has(door.street_id));
  const foreignIds = [...new Set(foreignDoors.map((door) => door.street_id))];
  const appointmentStreets = foreignIds.length
    ? streetRows(
        `s.id IN (${foreignIds.map(() => "?").join(",")})
         AND s.territory_id IN (SELECT id FROM territories WHERE team_id = ?)`,
        [...foreignIds, user.team_id],
      )
    : [];
  const ownTerritoryIds = new Set(accessible.map((t) => t.id));
  const appointmentTerritoryIds = [
    ...new Set(appointmentStreets.map((s) => s.territory_id).filter((id) => !ownTerritoryIds.has(id))),
  ];
  const appointmentTerritories = appointmentTerritoryIds.length
    ? (getDb()
        .prepare(`SELECT * FROM territories WHERE team_id = ? AND id IN (${appointmentTerritoryIds.map(() => "?").join(",")})`)
        .all(user.team_id, ...appointmentTerritoryIds) as Territory[])
    : [];
  const territories: Territory[] = [
    ...accessible,
    ...appointmentTerritories.map((t) => ({ ...t, name: `${t.name} · Termine` })),
  ];
  const streets = [...ownStreets, ...appointmentStreets];

  /*
   * Hausnummern und Klingeln fahren fuer die eigenen Gebiete komplett mit -
   * im Treppenhaus ist meist kein Netz, und genau dort werden sie gebraucht.
   * Fremde Gebiete (Teamleitung, "alle Teamgebiete sehen") kommen erst dazu,
   * wenn eines davon gewaehlt ist (?gebiet=…); sonst luede die Teamleitung
   * jedes Haus des ganzen Teams. Gebiete mit eigenen Terminen fahren mit,
   * damit "Termine heute" auch ohne Netz an die richtige Tuer fuehrt.
   */
  const linked = streets.find((s) => s.id === Number(params.street));
  const requested = Number(params.gebiet) || linked?.territory_id || 0;
  const loaded = new Set(accessible.filter((t) => t.assigned_user_id === user.id).map((t) => t.id));
  if (territories.some((t) => t.id === requested)) loaded.add(requested);
  if (loaded.size === 0 && accessible[0]) loaded.add(accessible[0].id);
  const territoryOfStreet = new Map(streets.map((s) => [s.id, s.territory_id]));
  for (const item of appointments) {
    const territoryId = item.street_id ? territoryOfStreet.get(item.street_id) : undefined;
    if (territoryId) loaded.add(territoryId);
  }
  for (const id of appointmentTerritoryIds) loaded.add(id);

  // Hausnummern der eigenen Strassen: an der Tuer wird abgehakt statt getippt.
  const doorKey = (streetId: number, number: string) => `${streetId}|${number.replace(/\s+/g, "").toLowerCase()}`;
  const appointmentDoors = new Map<string, Set<number> | "house">();
  for (const door of foreignDoors) {
    const key = doorKey(door.street_id, door.house_number);
    const bells = appointmentDoors.get(key);
    // Termin ohne Klingel: das ganze Haus; sonst nur die Klingeln der Termine.
    if (door.doorbell_id === null || bells === "house") appointmentDoors.set(key, "house");
    else appointmentDoors.set(key, new Set([...(bells ?? []), door.doorbell_id]));
  }
  const appointmentOnly = new Set(appointmentStreets.filter((s) => !ownTerritoryIds.has(s.territory_id)).map((s) => s.id));
  const houseNumbers = listHouseNumbers(streets.filter((s) => loaded.has(s.territory_id)).map((s) => s.id)).filter(
    (h) => !appointmentOnly.has(h.street_id) || appointmentDoors.has(doorKey(h.street_id, h.number)),
  );

  // Alle Klingelschilder gleich mitschicken statt bei Bedarf nachzuladen:
  // im Treppenhaus ist meist kein Netz, und genau dort werden sie gebraucht.
  // In fremden Haeusern nur die Klingel des eigenen Termins - nicht das Haus des neuen Besitzers.
  const streetOfHouse = new Map(houseNumbers.map((h) => [h.id, h]));
  const doorbells = listDoorbells(houseNumbers.map((h) => h.id)).filter((bell) => {
    const house = streetOfHouse.get(bell.house_number_id);
    if (!house || !appointmentOnly.has(house.street_id)) return true;
    const allowed = appointmentDoors.get(doorKey(house.street_id, house.number));
    return allowed === "house" || Boolean(allowed?.has(bell.id));
  });

  // "Heute" beginnt um Mitternacht in Berlin - wie bei den Tageszielen.
  const todayTotals = totals(user.team_id, { userId: user.id, since: berlinMidnight() });
  const recent = listVisits(user.team_id, { userId: user.id, limit: 8 });

  /*
   * Name und Profilbild der Kollegen. Die Liste faehrt einmal komplett mit:
   * an der Tuer steht damit neben "zuletzt hier war ..." ein Gesicht - auch
   * dann, wenn im Treppenhaus kein Netz ist.
   */
  const team = listMembers(user.team_id).map((member) => ({
    id: member.id,
    name: member.name,
    avatar: member.avatar,
  }));

  // Grundversorger je Gebiet: an der Tuer das wichtigste Argument.
  const providers = providerLookup(user.team_id);

  return (
    <TourClient
      userId={user.id}
      initialProgress={getLevelProgress(user.team_id, user.id)}
      territories={territories.map((t) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        postal_code: t.postal_code,
        provider: providers.find({
          postal_code: t.postal_code,
          city: t.city,
          area: readArea(t.area_json),
        }),
        appointmentsOnly: !ownTerritoryIds.has(t.id),
      }))}
      streets={streets}
      loadedTerritories={[...loaded]}
      houseNumbers={houseNumbers}
      doorbells={doorbells}
      canUnblock={hasPermission(user, "doors.unblock")}
      team={team}
      reasons={listReasons(user.team_id)}
      todayTotals={todayTotals}
      recent={recent}
      appointments={appointments}
      tarifrechnerUrl={
        process.env.NEXT_PUBLIC_TARIFRECHNER_URL ??
        "https://portal-ep24.de/menues/tarifrechner/"
      }
    />
  );
}
