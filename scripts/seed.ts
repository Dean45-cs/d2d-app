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
import { addStreets, ensureDefaultReasons } from "../src/lib/queries";
import { refreshEnergyPrices } from "../src/lib/energy/refresh";

async function main() {
  const db = getDb();

  const teamName = process.env.SEED_TEAM ?? "Door2Door Team";
  const leaderName = process.env.SEED_LEADER_NAME ?? "Teamleitung";
  const leaderEmail = (process.env.SEED_LEADER_EMAIL ?? "leitung@example.de").toLowerCase();
  const leaderPassword = process.env.SEED_LEADER_PASSWORD ?? "start1234";

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

  const result = await refreshEnergyPrices();
  console.log(
    result.status === "ok"
      ? `Energiekarte: ${result.rowCount} Postleitzahlen aus „${result.source}“`
      : `Energiekarte konnte nicht geladen werden: ${result.message}`,
  );

  console.log("\nFertig. Starten mit:  npm run dev");
}

function seedDemo(teamId: number) {
  const db = getDb();
  const members = [
    { name: "Alex Berger", email: "alex@example.de" },
    { name: "Sina Krause", email: "sina@example.de" },
  ];

  for (const member of members) {
    const exists = db
      .prepare("SELECT id FROM users WHERE lower(email) = ?")
      .get(member.email);
    if (exists) continue;
    db.prepare(
      `INSERT INTO users (team_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'MEMBER')`,
    ).run(teamId, member.name, member.email, hashPassword("start1234"));
    console.log(`Mitarbeiter angelegt: ${member.email} / start1234`);
  }

  const assignee = db
    .prepare("SELECT id FROM users WHERE team_id = ? AND role = 'MEMBER' ORDER BY id LIMIT 1")
    .get(teamId) as { id: number } | undefined;

  const demoTerritories = [
    {
      name: "Innenstadt Nord",
      city: "Dortmund",
      postal_code: "44135",
      streets: "Bahnhofstraße 1-45; 30 WE\nKampstraße 2-28; 24 WE\nLindenweg",
    },
    {
      name: "Südviertel",
      city: "Dortmund",
      postal_code: "44139",
      streets: "Hohe Straße 10-60; 40 WE\nMärkische Straße 1-33\nGartenweg 2-14",
    },
  ];

  for (const t of demoTerritories) {
    const exists = db
      .prepare("SELECT id FROM territories WHERE team_id = ? AND name = ?")
      .get(teamId, t.name);
    if (exists) continue;
    const id = db
      .prepare(
        `INSERT INTO territories (team_id, name, city, postal_code, assigned_user_id, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(teamId, t.name, t.city, t.postal_code, assignee?.id ?? null, assignee ? "ACTIVE" : "OPEN")
      .lastInsertRowid as number;
    addStreets(id, t.streets);
    console.log(`Gebiet angelegt: ${t.name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
