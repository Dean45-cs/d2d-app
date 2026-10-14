/**
 * Legt eine startklare Datenbank an:
 *   npm run db:seed
 *
 * Optional per Umgebungsvariable steuerbar:
 *   SEED_TEAM, SEED_LEADER_NAME, SEED_LEADER_EMAIL, SEED_LEADER_PASSWORD
 *   SEED_DEMO=1   legt zusaetzlich Beispiel-Mitarbeiter und -Gebiete an
 */
import "./load-env";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { createVisit, ensureDefaultReasons } from "../src/lib/queries";
import { feedConfig } from "../src/lib/energy/adapters";
import { refreshEnergyPrices } from "../src/lib/energy/refresh";

async function main() {
  const db = getDb();

  // "||" statt "??": leere Zeilen aus .env.example zaehlen als nicht gesetzt.
  const teamName = process.env.SEED_TEAM || "Door2Door Team";
  const leaderName = process.env.SEED_LEADER_NAME || "Teamleitung";
  const leaderEmail = (process.env.SEED_LEADER_EMAIL || "leitung@example.de").toLowerCase();
  const leaderPassword = process.env.SEED_LEADER_PASSWORD || "start1234";

  let team = db.prepare("SELECT id FROM teams WHERE name = ?").get(teamName) as
    | { id: number }
    | undefined;
  if (!team) {
    const id = db.prepare("INSERT INTO teams (name) VALUES (?)").run(teamName)
      .lastInsertRowid as number;
    team = { id };
    console.log(`Team angelegt: ${teamName}`);
  }

  const existingLeader = db
    .prepare("SELECT id FROM users WHERE lower(email) = ?")
    .get(leaderEmail) as { id: number } | undefined;

  if (!existingLeader) {
    db.prepare(
      `INSERT INTO users (team_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'LEADER')`,
    ).run(team.id, leaderName, leaderEmail, hashPassword(leaderPassword));
    console.log(`Teamleitung angelegt: ${leaderEmail} / ${leaderPassword}`);
  } else {
    console.log(`Teamleitung existiert bereits: ${leaderEmail}`);
  }

  ensureDefaultReasons(team.id);
  console.log("Ablehnungsgründe bereit.");

  if (process.env.SEED_DEMO === "1") {
    seedDemo(team.id);
  }

  if (feedConfig()) {
    const result = await refreshEnergyPrices();
    console.log(
      result.status === "ok"
        ? `Energiekarte: ${result.rowCount} Postleitzahlen aus „${result.source}“`
        : `Energiekarte konnte nicht geladen werden: ${result.message}`,
    );
  } else {
    console.log("Energiekarte: Preise in der App eintragen (Energiekarte → Preis eintragen).");
  }

  console.log("\nFertig. Starten mit:  npm run dev");
}

/* ---------------------------------------------------------------------------
   Demodaten: zwei Gebiete in Dortmund mit Flaeche, Hausnummern samt Lage,
   zwei Wochen Tuerbesuche, Termine, ein Mehrfamilienhaus, eine Sperre, ein
   Preis und ein paar Beitraege. Nur mit SEED_DEMO=1 - nie in Produktion.
   --------------------------------------------------------------------------- */

type LatLng = [number, number];

interface DemoStreet {
  name: string;
  from: LatLng;
  to: LatLng;
  numbers: number[];
  units?: number;
}

interface DemoTerritory {
  name: string;
  city: string;
  postal_code: string;
  member: string;
  area: LatLng[];
  streets: DemoStreet[];
}

const range = (from: number, to: number, step = 1) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const DEMO_TERRITORIES: DemoTerritory[] = [
  {
    name: "Innenstadt Nord",
    city: "Dortmund",
    postal_code: "44135",
    member: "alex@example.de",
    area: [
      [51.5262, 7.4528],
      [51.5268, 7.4668],
      [51.5208, 7.4682],
      [51.5199, 7.4541],
    ],
    streets: [
      { name: "Bahnhofstraße", from: [51.5252, 7.4555], to: [51.5214, 7.4562], numbers: range(1, 24) },
      { name: "Kampstraße", from: [51.5236, 7.4585], to: [51.5232, 7.4660], numbers: range(2, 28, 2) },
      { name: "Lindenweg", from: [51.5255, 7.4600], to: [51.5222, 7.4640], numbers: range(1, 12) },
    ],
  },
  {
    name: "Südviertel",
    city: "Dortmund",
    postal_code: "44139",
    member: "sina@example.de",
    area: [
      [51.5068, 7.4560],
      [51.5072, 7.4712],
      [51.5004, 7.4720],
      [51.4998, 7.4566],
    ],
    streets: [
      { name: "Hohe Straße", from: [51.5060, 7.4590], to: [51.5008, 7.4602], numbers: range(10, 40, 2) },
      { name: "Märkische Straße", from: [51.5050, 7.4640], to: [51.5012, 7.4690], numbers: range(1, 20) },
      { name: "Gartenweg", from: [51.5030, 7.4580], to: [51.5030, 7.4700], numbers: range(2, 14, 2) },
    ],
  },
];

/** Gleichbleibende Zufallszahlen - die Demo sieht bei jedem Lauf gleich aus. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function sqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function localSlot(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function seedDemo(teamId: number) {
  const db = getDb();
  const rnd = random(42);

  const leader = db
    .prepare("SELECT id, name FROM users WHERE team_id = ? AND role = 'LEADER' ORDER BY id LIMIT 1")
    .get(teamId) as { id: number; name: string } | undefined;
  if (leader && leader.name === "Teamleitung") {
    db.prepare("UPDATE users SET name = ? WHERE id = ?").run("Jonas Carlsson", leader.id);
  }

  const members = [
    { name: "Alex Berger", email: "alex@example.de", bio: "Seit 2024 an der Tür. Abends am stärksten." },
    { name: "Sina Krause", email: "sina@example.de", bio: "Südviertel ist mein Revier." },
    { name: "Murat Yilmaz", email: "murat@example.de", bio: "" },
  ];
  // Vertrieb braucht eine direkte Fuehrungskraft - sonst kann niemand einladen.
  for (const member of members) {
    const exists = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(member.email);
    if (exists) continue;
    db.prepare(
      `INSERT INTO users (team_id, name, email, password_hash, role, manager_id, bio, created_at)
       VALUES (?, ?, ?, ?, 'MEMBER', ?, ?, datetime('now', '-120 days'))`,
    ).run(teamId, member.name, member.email, hashPassword("start1234"), leader?.id ?? null, member.bio);
    console.log(`Mitarbeiter angelegt: ${member.email} / start1234`);
  }
  const userId = (email: string) =>
    (db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as { id: number }).id;

  const reasons = db
    .prepare("SELECT id, code FROM rejection_reasons WHERE team_id = ? AND active = 1 ORDER BY sort_order")
    .all(teamId) as Array<{ id: number; code: string }>;
  const usableReasons = reasons.filter((r) => r.code !== "SONSTIGES");

  for (const t of DEMO_TERRITORIES) {
    const exists = db.prepare("SELECT id FROM territories WHERE team_id = ? AND name = ?").get(teamId, t.name);
    if (exists) continue;
    const memberId = userId(t.member);
    const territoryId = db
      .prepare(
        `INSERT INTO territories (team_id, name, city, postal_code, assigned_user_id, created_by, status, area_json, due_date)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, date('now', '+12 days'))`,
      )
      .run(teamId, t.name, t.city, t.postal_code, memberId, leader?.id ?? null, JSON.stringify(t.area))
      .lastInsertRowid as number;

    t.streets.forEach((street, streetIndex) => {
      const mid: LatLng = [(street.from[0] + street.to[0]) / 2, (street.from[1] + street.to[1]) / 2];
      const units = street.numbers.length + (street.units ?? 0);
      const streetId = db
        .prepare(
          `INSERT INTO streets (territory_id, name, house_numbers, units, sort_order, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          territoryId,
          street.name,
          `${street.numbers[0]}–${street.numbers[street.numbers.length - 1]}`,
          units,
          streetIndex + 1,
          mid[0],
          mid[1],
        ).lastInsertRowid as number;

      street.numbers.forEach((number, index) => {
        const f = street.numbers.length > 1 ? index / (street.numbers.length - 1) : 0.5;
        const side = number % 2 === 0 ? 0.00008 : -0.00008;
        const lat = street.from[0] + (street.to[0] - street.from[0]) * f + side;
        const lng = street.from[1] + (street.to[1] - street.from[1]) * f - side;
        db.prepare(
          `INSERT INTO house_numbers (street_id, number, units, lat, lng, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(streetId, String(number), number === 12 && street.name === "Bahnhofstraße" ? 8 : 1, lat, lng, index);
      });
    });
    console.log(`Gebiet angelegt: ${t.name}`);

    // Zwei Wochen an der Tuer: Haus fuer Haus, mit echten Anteilen.
    const houses = db
      .prepare(
        `SELECT h.id, h.number, h.street_id, h.lat, h.lng FROM house_numbers h
           JOIN streets s ON s.id = h.street_id
          WHERE s.territory_id = ? ORDER BY s.sort_order, h.sort_order`,
      )
      .all(territoryId) as Array<{ id: number; number: string; street_id: number; lat: number; lng: number }>;
    const attempts = new Map<number, number>();
    let cursor = 0;
    for (let day = 13; day >= 0; day--) {
      if (day % 6 === 5) continue;
      const count = 6 + Math.floor(rnd() * 9);
      for (let i = 0; i < count && cursor < houses.length * 2; i++) {
        const house = houses[cursor % houses.length];
        cursor += 1;
        const tried = attempts.get(house.id) ?? 0;
        if (tried >= 3 || (tried > 0 && rnd() < 0.4)) continue;
        const roll = rnd();
        const outcome = roll < 0.55 ? "NOT_HOME" : roll < 0.8 ? "MET_NO_SALE" : roll < 0.9 ? "APPOINTMENT" : "SALE";
        attempts.set(house.id, outcome === "NOT_HOME" ? tried + 1 : 3);
        const when = new Date(Date.now() - day * 86_400_000);
        when.setUTCHours(8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60), Math.floor(rnd() * 60));
        if (when.getTime() > Date.now()) when.setTime(Date.now() - (count - i) * 240_000);
        const follow = new Date(when.getTime() + (2 + Math.floor(rnd() * 3)) * 86_400_000);
        follow.setHours(18, 0, 0, 0);
        const visitId = createVisit({
          teamId,
          userId: memberId,
          territoryId,
          streetId: house.street_id,
          houseNumber: house.number,
          doorbellId: null,
          outcome,
          reasonId: outcome === "MET_NO_SALE" ? usableReasons[Math.floor(rnd() * usableReasons.length)]?.id ?? null : null,
          reasonNote: "",
          energyType: outcome === "SALE" ? (["STROM", "GAS", "BEIDES"] as const)[Math.floor(rnd() * 3)] : "",
          followUpAt: outcome === "APPOINTMENT" ? localSlot(follow) : null,
          contactName: outcome === "APPOINTMENT" ? ["Frau Müller", "Herr Schneider", "Familie Kaya", "Frau Wagner"][Math.floor(rnd() * 4)] : "",
          contactPhone: outcome === "APPOINTMENT" && rnd() < 0.6 ? "0231 5550123" : "",
          lat: house.lat,
          lng: house.lng,
        });
        db.prepare("UPDATE visits SET created_at = ? WHERE id = ?").run(sqlTime(when), visitId);
        db.prepare("UPDATE posts SET created_at = ? WHERE visit_id = ?").run(sqlTime(when), visitId);
        if (outcome === "APPOINTMENT" && follow.getTime() < Date.now() - 86_400_000) {
          db.prepare("UPDATE visits SET follow_up_done_at = datetime('now') WHERE id = ?").run(visitId);
        }
      }
    }
  }

  // Ein Mehrfamilienhaus mit Klingelbrett, ein gesperrtes Haus, ein Termin heute.
  const bahnhof12 = db
    .prepare(
      `SELECT h.id, h.street_id, s.territory_id FROM house_numbers h JOIN streets s ON s.id = h.street_id
        WHERE s.name = 'Bahnhofstraße' AND h.number = '12'`,
    )
    .get() as { id: number; street_id: number; territory_id: number } | undefined;
  if (bahnhof12 && !db.prepare("SELECT 1 FROM doorbells WHERE house_number_id = ?").get(bahnhof12.id)) {
    db.prepare("UPDATE house_numbers SET building_type = 'MFH' WHERE id = ?").run(bahnhof12.id);
    [
      ["Müller", "EG"],
      ["Kaya", "EG"],
      ["Schmidt", "1. OG"],
      ["Becker", "1. OG"],
      ["Weber", "2. OG"],
      ["Wagner", "2. OG"],
    ].forEach(([label, floor], index) => {
      db.prepare("INSERT INTO doorbells (house_number_id, label, floor, sort_order) VALUES (?, ?, ?, ?)").run(
        bahnhof12.id,
        label,
        floor,
        index,
      );
    });
    const bell = db.prepare("SELECT id FROM doorbells WHERE house_number_id = ? AND label = 'Kaya'").get(bahnhof12.id) as { id: number };
    const visitId = createVisit({
      teamId,
      userId: userId("alex@example.de"),
      territoryId: bahnhof12.territory_id,
      streetId: bahnhof12.street_id,
      houseNumber: "12",
      doorbellId: bell.id,
      outcome: "NOT_HOME",
      reasonId: null,
      reasonNote: "",
      energyType: "",
      followUpAt: null,
      lat: null,
      lng: null,
    });
    db.prepare("UPDATE visits SET created_at = datetime('now', '-1 day') WHERE id = ?").run(visitId);
  }

  const kamp = db
    .prepare(
      `SELECT h.id FROM house_numbers h JOIN streets s ON s.id = h.street_id
        WHERE s.name = 'Kampstraße' AND h.number = '6'`,
    )
    .get() as { id: number } | undefined;
  if (kamp) {
    db.prepare(
      "UPDATE house_numbers SET blocked_at = datetime('now', '-3 days'), blocked_by = ?, blocked_note = ? WHERE id = ?",
    ).run(userId("sina@example.de"), "Schild „Keine Werbung“", kamp.id);
  }

  const alex = userId("alex@example.de");
  const lindenweg = db
    .prepare(
      `SELECT s.id, s.territory_id FROM streets s JOIN territories t ON t.id = s.territory_id
        WHERE t.team_id = ? AND s.name = 'Lindenweg'`,
    )
    .get(teamId) as { id: number; territory_id: number } | undefined;
  if (lindenweg && !db.prepare("SELECT 1 FROM visits WHERE contact_name = 'Herr Okafor'").get()) {
    const today = new Date();
    today.setHours(18, 30, 0, 0);
    const late = new Date(Date.now() - 86_400_000);
    late.setHours(17, 0, 0, 0);
    for (const [name, slot, number] of [
      ["Herr Okafor", today, "7"],
      ["Frau Lehmann", late, "9"],
    ] as const) {
      const id = createVisit({
        teamId,
        userId: alex,
        territoryId: lindenweg.territory_id,
        streetId: lindenweg.id,
        houseNumber: number,
        doorbellId: null,
        outcome: "APPOINTMENT",
        reasonId: null,
        reasonNote: "Letzte Abrechnung bereitlegen",
        energyType: "",
        followUpAt: localSlot(slot),
        contactName: name,
        contactPhone: "0231 5550188",
        lat: null,
        lng: null,
      });
      db.prepare("UPDATE visits SET created_at = datetime('now', '-2 days') WHERE id = ?").run(id);
    }
  }

  // Preis vom Preisblatt fuer die Innenstadt - die Energiekarte hat einen Ort.
  if (!db.prepare("SELECT 1 FROM provider_prices WHERE team_id = ?").get(teamId)) {
    const insert = db.prepare(
      `INSERT INTO provider_prices (team_id, postal_code, city, provider, lat, lng, strom_ct_kwh, strom_base_eur, gas_ct_kwh, gas_base_eur, valid_from, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(teamId, "44135", "Dortmund", "DEW21", 51.5236, 7.4606, 42.9, 186, 13.1, 204, "2026-01-01", leader?.id ?? null);
    insert.run(teamId, "44139", "Dortmund", "DEW21", 51.5035, 7.4640, 39.4, 168, 12.2, 180, "2026-01-01", leader?.id ?? null);
    insert.run(teamId, "44787", "Bochum", "Stadtwerke Bochum", 51.4818, 7.2162, 36.1, 150, 11.4, 170, "2026-01-01", leader?.id ?? null);
    insert.run(teamId, "45127", "Essen", "Stadtwerke Essen", 51.4556, 7.0116, 44.2, 198, 13.8, 210, "2026-01-01", leader?.id ?? null);
  }

  // Ein paar Beitraege, Herzen und Abos - der Feed ist nicht leer.
  if (leader && !db.prepare("SELECT 1 FROM posts WHERE team_id = ? AND kind = 'TEXT'").get(teamId)) {
    const sina = userId("sina@example.de");
    const post = db
      .prepare(
        "INSERT INTO posts (team_id, user_id, kind, body, created_at) VALUES (?, ?, 'TEXT', ?, datetime('now', '-3 hours'))",
      )
      .run(teamId, leader.id, "Starke Woche, Team! Morgen ab 16 Uhr gemeinsam in der Innenstadt Nord – Treffpunkt Bahnhofstraße.")
      .lastInsertRowid as number;
    db.prepare("INSERT INTO post_comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, datetime('now', '-2 hours'))").run(
      post,
      alex,
      "Bin dabei!",
    );
    for (const id of [alex, sina]) db.prepare("INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)").run(post, id);
    db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)").run(alex, sina);
    db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)").run(sina, alex);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
