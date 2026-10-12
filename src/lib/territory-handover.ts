import { getDb } from "./db";
import { doorStatus } from "./doors";
import { listDoorbells, listHouseNumbers, listStreets } from "./queries";
import { assertPermission, assertTerritoryAccess, territoryAssignee } from "./permissions";
import type { Territory, User } from "./types";

export interface HandoverAppointment {
  id: number;
  slot: string;
  owner_name: string;
  address: string;
}

export interface HandoverSummary {
  openDoors: number;
  retryDoors: number;
  blockedDoors: number;
  unknownBuildings: number;
  attempts: number;
  notes: string;
  details: { label: string; state: "RETRY" | "BLOCKED"; attempts: number; note: string }[];
  appointments: HandoverAppointment[];
  latest: { from_name: string | null; to_name: string | null; note: string; appointments_transferred: number; created_at: string } | null;
}

export function handoverSummary(territory: Territory): HandoverSummary {
  const db = getDb();
  const streets = listStreets(territory.id);
  const houses = listHouseNumbers(streets.map((item) => item.id));
  const bells = listDoorbells(houses.map((item) => item.id));
  const streetNames = new Map(streets.map((item) => [item.id, item.name]));
  const summary: HandoverSummary = { openDoors: 0, retryDoors: 0, blockedDoors: 0, unknownBuildings: 0,
    attempts: 0, notes: territory.note, details: [], appointments: [], latest: null };
  for (const house of houses) {
    const address = `${streetNames.get(house.street_id)} ${house.number}`;
    const houseBells = bells.filter((bell) => bell.house_number_id === house.id);
    if (house.building_type === "MFH" && !houseBells.length && !house.blocked_at) summary.unknownBuildings++;
    for (const door of houseBells.length ? houseBells : [house]) {
      const state = doorStatus({ ...door, blocked_at: house.blocked_at ?? door.blocked_at });
      const label = "label" in door ? `${address} · ${door.label}` : address;
      if (state === "OPEN" || state === "RETRY") summary.openDoors++;
      if (state === "RETRY") summary.retryDoors++;
      if (state === "BLOCKED") summary.blockedDoors++;
      if (state === "RETRY" || state === "BLOCKED") summary.details.push({ label, state,
        attempts: door.not_home_count, note: house.blocked_note || door.blocked_note });
    }
  }
  summary.attempts = (db.prepare("SELECT COUNT(*) AS total FROM visits WHERE territory_id = ? AND team_id = ? AND outcome = 'NOT_HOME'")
    .get(territory.id, territory.team_id) as { total: number }).total;
  summary.appointments = db.prepare(`SELECT v.id, v.follow_up_at AS slot, u.name AS owner_name,
      COALESCE(s.name, '') || ' ' || v.house_number || CASE WHEN d.label IS NULL THEN '' ELSE ' · ' || d.label END AS address
    FROM visits v JOIN users u ON u.id = COALESCE(v.follow_up_user_id, v.user_id)
    LEFT JOIN streets s ON s.id = v.street_id LEFT JOIN doorbells d ON d.id = v.doorbell_id
    WHERE v.territory_id = ? AND v.team_id = ? AND v.outcome = 'APPOINTMENT' AND v.follow_up_done_at IS NULL
    ORDER BY v.follow_up_at, v.id`).all(territory.id, territory.team_id) as HandoverAppointment[];
  summary.latest = (db.prepare(`SELECT f.name AS from_name, t.name AS to_name, h.note,
      h.appointments_transferred, h.created_at FROM territory_handovers h
    LEFT JOIN users f ON f.id = h.from_user_id LEFT JOIN users t ON t.id = h.to_user_id
    WHERE h.territory_id = ? ORDER BY h.id DESC LIMIT 1`).get(territory.id) ?? null) as HandoverSummary["latest"];
  return summary;
}

/** Called in the same transaction as reassignment. Original visit credit stays with its author. */
export function recordTerritoryHandover(actor: User, territory: Territory, newAssignee: number | null,
  policy: unknown, note: string) {
  assertPermission(actor, "territories.assign");
  assertTerritoryAccess(actor, territory);
  territoryAssignee(actor, newAssignee);
  if (newAssignee === territory.assigned_user_id) return;
  const db = getDb();
  const open = (db.prepare(`SELECT COUNT(*) AS total FROM visits WHERE team_id = ? AND territory_id = ?
    AND outcome = 'APPOINTMENT' AND follow_up_done_at IS NULL`).get(actor.team_id, territory.id) as { total: number }).total;
  if (policy !== undefined && policy !== "KEEP" && policy !== "TRANSFER") throw new Error("Ungültige Terminübergabe.");
  if (open && policy === undefined) throw new Error("Bitte festlegen, wer die offenen Termine übernimmt.");
  const choice = policy ?? "KEEP";
  let transferred = 0;
  if (choice === "TRANSFER") {
    assertPermission(actor, "appointments.team");
    if (newAssignee === null) throw new Error("Für die Terminübergabe bitte eine Person wählen.");
    transferred = db.prepare(`UPDATE visits SET follow_up_user_id = ? WHERE territory_id = ? AND team_id = ?
      AND outcome = 'APPOINTMENT' AND follow_up_done_at IS NULL AND COALESCE(follow_up_user_id, user_id) <> ?`)
      .run(newAssignee, territory.id, actor.team_id, newAssignee).changes;
  }
  db.prepare(`INSERT INTO territory_handovers(territory_id, actor_id, from_user_id, to_user_id, note,
    appointment_policy, appointments_transferred) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(territory.id, actor.id, territory.assigned_user_id, newAssignee, note, choice, transferred);
}
