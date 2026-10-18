/**
 * Lastdaten fuer Performance-Messungen - NICHT fuer den Betrieb.
 *
 *   DATABASE_PATH=./data/last.db npx tsx scripts/seed-load.ts
 *
 * Legt ein Team in der Groesse an, fuer die die App gedacht ist (einige
 * Dutzend Leute, ein paar hunderttausend Besuche): 40 Personen, 60 Gebiete
 * mit je 12 Strassen zu 35 Hausnummern, ein Viertel davon
 * Mehrfamilienhaeuser mit 6 Klingeln, und 300.000 Besuche ueber ein halbes
 * Jahr. Zugang fuer alle: Passwort "start1234", die Teamleitung ist
 * leitung@last.test, der Vertrieb vertrieb1@last.test ... vertrieb36@last.test.
 *
 * Deterministisch (fester Zufallsstartwert), damit Messungen vergleichbar bleiben.
 */
import "./load-env";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { DEFAULT_REASONS } from "../src/lib/queries";

const PEOPLE = 40;
const TERRITORIES = 60;
const STREETS_PER_TERRITORY = 12;
const HOUSES_PER_STREET = 35;
const VISITS = Number(process.env.LOAD_VISITS ?? 300_000);
const DAYS = 180;

// Kleiner, deterministischer Zufall (mulberry32).
let seed = 20261014;
function random(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];

const db = getDb();
if ((db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c > 0) {
  throw new Error("Die Datenbank ist nicht leer - Lastdaten bitte in eine eigene Datei (DATABASE_PATH).");
}

const started = Date.now();
const password = hashPassword("start1234");
const now = Date.now();
const sql = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

db.transaction(() => {
  const team = Number(db.prepare("INSERT INTO teams (name) VALUES ('Lasttest')").run().lastInsertRowid);
  const reasonIds = DEFAULT_REASONS.map((r) =>
    Number(
      db.prepare(
        `INSERT INTO rejection_reasons (team_id, code, label, icon, hint, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
      ).run(team, r.code, r.label, r.icon, r.hint, r.sort_order).lastInsertRowid,
    ),
  );

  // Struktur: Teamleitung -> 3 Fuehrungskraefte -> Vertrieb.
  const insertUser = db.prepare(
    `INSERT INTO users (team_id, manager_id, name, email, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const leader = Number(insertUser.run(team, null, "Lea Leitung", "leitung@last.test", password, "LEADER", sql(now - DAYS * 864e5)).lastInsertRowid);
  const managers = [1, 2, 3].map((n) =>
    Number(insertUser.run(team, leader, `Fuehrung ${n}`, `fuehrung${n}@last.test`, password, "MEMBER", sql(now - DAYS * 864e5)).lastInsertRowid),
  );
  const sellers: number[] = [];
  for (let n = 1; n <= PEOPLE - 4; n += 1) {
    sellers.push(Number(insertUser.run(team, managers[n % 3], `Vertrieb ${n}`, `vertrieb${n}@last.test`, password, "MEMBER", sql(now - DAYS * 864e5)).lastInsertRowid));
  }

  // Gebiete, Strassen, Hausnummern, Klingeln.
  const insertTerritory = db.prepare(
    `INSERT INTO territories (team_id, name, city, postal_code, assigned_user_id, status, created_by)
     VALUES (?, ?, 'Dortmund', ?, ?, ?, ?)`,
  );
  const insertStreet = db.prepare(
    `INSERT INTO streets (territory_id, name, house_numbers, units, status, sort_order, lat, lng)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
  );
  const insertHouse = db.prepare(
    `INSERT INTO house_numbers (street_id, number, units, lat, lng, sort_order, building_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBell = db.prepare(
    "INSERT INTO doorbells (house_number_id, label, floor, sort_order) VALUES (?, ?, '', ?)",
  );

  interface Door { territory: number; street: number; number: string; bell: number | null }
  const doorsBySeller = new Map<number, Door[]>();
  for (let t = 0; t < TERRITORIES; t += 1) {
    const owner = sellers[t % sellers.length];
    const territory = Number(
      insertTerritory.run(team, `Gebiet ${t + 1}`, String(44100 + t), owner, t % 7 === 0 ? "DONE" : "ACTIVE", leader).lastInsertRowid,
    );
    const doors = doorsBySeller.get(owner) ?? [];
    for (let s = 0; s < STREETS_PER_TERRITORY; s += 1) {
      const lat = 51.45 + t * 0.01 + s * 0.0008;
      const lng = 7.4 + t * 0.01;
      const street = Number(
        insertStreet.run(territory, `Strasse ${t + 1}-${s + 1}`, `1-${HOUSES_PER_STREET}`, HOUSES_PER_STREET, s + 1, lat, lng).lastInsertRowid,
      );
      for (let h = 1; h <= HOUSES_PER_STREET; h += 1) {
        const mfh = random() < 0.25;
        const house = Number(
          insertHouse.run(street, String(h), mfh ? 6 : 1, lat + h * 0.00005, lng, h, mfh ? "MFH" : "EFH").lastInsertRowid,
        );
        if (mfh) {
          for (let b = 1; b <= 6; b += 1) {
            const bell = Number(insertBell.run(house, `Klingel ${b}`, b).lastInsertRowid);
            doors.push({ territory, street, number: String(h), bell });
          }
        } else {
          doors.push({ territory, street, number: String(h), bell: null });
        }
      }
    }
    doorsBySeller.set(owner, doors);
  }

  // Besuche ueber ein halbes Jahr, tagsueber und abends.
  const insertVisit = db.prepare(
    `INSERT INTO visits (team_id, user_id, territory_id, street_id, house_number, doorbell_id, outcome,
                         reason_id, energy_type, follow_up_at, follow_up_utc, follow_up_done_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertPost = db.prepare(
    "INSERT INTO posts (team_id, user_id, kind, visit_id, created_at) VALUES (?, ?, 'SALE', ?, ?)",
  );
  const owners = [...doorsBySeller.keys()];
  for (let i = 0; i < VISITS; i += 1) {
    const user = pick(owners);
    const door = pick(doorsBySeller.get(user)!);
    const at = now - Math.floor(random() * DAYS) * 864e5 - Math.floor((9 + random() * 11) * 36e5);
    const roll = random();
    const outcome = roll < 0.55 ? "NOT_HOME" : roll < 0.9 ? "MET_NO_SALE" : roll < 0.96 ? "APPOINTMENT" : "SALE";
    const followUp = outcome === "APPOINTMENT" ? sql(at + 2 * 864e5).slice(0, 16) : null;
    const id = Number(
      insertVisit.run(
        team, user, door.territory, door.street, door.number, door.bell, outcome,
        outcome === "MET_NO_SALE" ? pick(reasonIds) : null,
        outcome === "SALE" ? pick(["STROM", "GAS", "BEIDES"]) : "",
        followUp,
        followUp ? new Date(at + 2 * 864e5).toISOString() : null,
        followUp && at + 2 * 864e5 < now && random() < 0.8 ? sql(at + 2 * 864e5) : null,
        sql(at),
      ).lastInsertRowid,
    );
    if (outcome === "SALE") insertPost.run(team, user, id, sql(at));
  }

  // Ein bisschen Leben im Feed: Abos und Herzen.
  for (const follower of [leader, ...managers, ...sellers]) {
    for (let k = 0; k < 8; k += 1) {
      const followee = pick(sellers);
      if (followee !== follower) {
        db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)").run(follower, followee);
      }
    }
  }
  db.exec(`INSERT OR IGNORE INTO post_likes (post_id, user_id)
           SELECT p.id, u.id FROM posts p JOIN users u ON u.team_id = p.team_id
            WHERE (p.id * 7 + u.id * 13) % 11 = 0`);
})();

db.exec("ANALYZE");
const counts = db.prepare(`SELECT
  (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM territories) AS territories,
  (SELECT COUNT(*) FROM streets) AS streets, (SELECT COUNT(*) FROM house_numbers) AS houses,
  (SELECT COUNT(*) FROM doorbells) AS bells, (SELECT COUNT(*) FROM visits) AS visits,
  (SELECT COUNT(*) FROM posts) AS posts`).get();
console.log(`Lastdaten angelegt in ${((Date.now() - started) / 1000).toFixed(1)} s:`, counts);
