import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Zentrale SQLite-Verbindung.
 *
 * SQLite laeuft ohne eigenen Datenbankserver und ist fuer ein Vertriebsteam
 * (einige Dutzend Nutzer, ein paar hunderttausend Besuche) mehr als ausreichend.
 * Der Pfad laesst sich ueber DATABASE_PATH umstellen.
 */

declare global {
  // eslint-disable-next-line no-var
  var __d2dDb: Database.Database | undefined;
}

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH ?? "./data/d2d.db";
  // Der Pfad kommt bewusst aus der Konfiguration; der Hinweis unterbindet nur,
  // dass der Bundler daraufhin das gesamte Projekt in die Ausgabe kopiert.
  const abs = path.isAbsolute(configured)
    ? configured
    : path.join(/* turbopackIgnore: true */ process.cwd(), configured);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

function createDb(): Database.Database {
  const db = new Database(resolveDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id       INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('LEADER','MEMBER')),
      phone         TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS territories (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id          INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      city             TEXT NOT NULL DEFAULT '',
      postal_code      TEXT NOT NULL DEFAULT '',
      assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status           TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','ACTIVE','DONE','PAUSED')),
      note             TEXT NOT NULL DEFAULT '',
      due_date         TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS streets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      territory_id  INTEGER NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      house_numbers TEXT NOT NULL DEFAULT '',
      units         INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','ACTIVE','DONE')),
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* Einzelne Hausnummern einer Strasse - aus OpenStreetMap uebernommen.
       Damit weiss die App an der Tuer, welche Haeuser es ueberhaupt gibt,
       und kann abhaken statt raten. */
    CREATE TABLE IF NOT EXISTS house_numbers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      street_id  INTEGER NOT NULL REFERENCES streets(id) ON DELETE CASCADE,
      number     TEXT NOT NULL,
      units      INTEGER NOT NULL DEFAULT 0,
      lat        REAL,
      lng        REAL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (street_id, number)
    );

    /* Klingelschilder eines Mehrfamilienhauses. Der Name auf dem Schild ist
       der Schluessel: so laesst sich eine Klingel auch ohne Netz eindeutig
       benennen, ohne dass der Server vorher eine ID vergeben musste. */
    CREATE TABLE IF NOT EXISTS doorbells (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      house_number_id INTEGER NOT NULL REFERENCES house_numbers(id) ON DELETE CASCADE,
      label           TEXT NOT NULL,
      floor           TEXT NOT NULL DEFAULT '',
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (house_number_id, label)
    );

    CREATE TABLE IF NOT EXISTS rejection_reasons (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      label      TEXT NOT NULL,
      emoji      TEXT NOT NULL DEFAULT '',
      hint       TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active     INTEGER NOT NULL DEFAULT 1,
      UNIQUE (team_id, code)
    );

    CREATE TABLE IF NOT EXISTS visits (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id      INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      territory_id INTEGER REFERENCES territories(id) ON DELETE SET NULL,
      street_id    INTEGER REFERENCES streets(id) ON DELETE SET NULL,
      house_number TEXT NOT NULL DEFAULT '',
      outcome      TEXT NOT NULL
                   CHECK (outcome IN ('NOT_HOME','MET_NO_SALE','APPOINTMENT','SALE')),
      reason_id    INTEGER REFERENCES rejection_reasons(id) ON DELETE SET NULL,
      reason_note  TEXT NOT NULL DEFAULT '',
      energy_type  TEXT NOT NULL DEFAULT ''
                   CHECK (energy_type IN ('','STROM','GAS','BEIDES')),
      follow_up_at TEXT,
      lat          REAL,
      lng          REAL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_visits_team_created ON visits (team_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_visits_user_created ON visits (user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_visits_street       ON visits (street_id);
    CREATE INDEX IF NOT EXISTS idx_streets_territory   ON streets (territory_id);
    CREATE INDEX IF NOT EXISTS idx_numbers_street      ON house_numbers (street_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_doorbells_house     ON doorbells (house_number_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_territories_team    ON territories (team_id);

    /* Hier stand einmal eine Tabelle "orders" fuer Auftraege samt
       Unterschrift. Aufgenommen wird der Auftrag im Tarifrechner des
       Partners - die App fuehrt ihn nicht ein zweites Mal. Angelegt wird sie
       deshalb nicht mehr; in aelteren Datenbanken bleibt sie unangetastet
       stehen und kann von Hand geloescht werden. */

    CREATE TABLE IF NOT EXISTS energy_prices (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      postal_code       TEXT NOT NULL,
      city              TEXT NOT NULL,
      state             TEXT NOT NULL DEFAULT '',
      provider          TEXT NOT NULL DEFAULT '',
      lat               REAL NOT NULL,
      lng               REAL NOT NULL,
      strom_ct_kwh      REAL,
      strom_base_eur    REAL,
      gas_ct_kwh        REAL,
      gas_base_eur      REAL,
      households        INTEGER NOT NULL DEFAULT 0,
      source            TEXT NOT NULL DEFAULT '',
      is_demo           INTEGER NOT NULL DEFAULT 0,
      valid_from        TEXT,
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (postal_code)
    );

    CREATE TABLE IF NOT EXISTS energy_refresh_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      status      TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT '',
      row_count   INTEGER NOT NULL DEFAULT 0,
      message     TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Nachtraeglich ergaenzte Spalten: aeltere Datenbanken kennen sie noch nicht,
  // CREATE TABLE IF NOT EXISTS aendert eine vorhandene Tabelle aber nicht mehr.
  addColumn(db, "territories", "area_json", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "streets", "lat", "REAL");
  addColumn(db, "streets", "lng", "REAL");
  addColumn(
    db,
    "house_numbers",
    "building_type",
    "TEXT NOT NULL DEFAULT '' CHECK (building_type IN ('','EFH','MFH'))",
  );
  addColumn(db, "visits", "doorbell_id", "INTEGER REFERENCES doorbells(id) ON DELETE SET NULL");

  // Termine: wer wann nochmal aufmacht, steht am Eintrag selbst. Die Uhrzeit
  // ist bewusst Ortszeit ("2026-09-21 18:00") - vor der Tuer zaehlt die Uhr an
  // der Wand, nicht die Zeitzone des Servers.
  addColumn(db, "visits", "contact_name", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "visits", "contact_phone", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "visits", "follow_up_done_at", "TEXT");

  // Gesperrte Tueren: hier wurde ausdruecklich widersprochen. Gilt fuers ganze
  // Team - wer nach uns in die Strasse geht, soll dort nicht mehr klingeln.
  for (const table of ["house_numbers", "doorbells"]) {
    addColumn(db, table, "blocked_at", "TEXT");
    addColumn(db, table, "blocked_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
    addColumn(db, table, "blocked_note", "TEXT NOT NULL DEFAULT ''");
  }

  // Erst hier, denn vor addColumn gibt es die Spalte in alten Datenbanken nicht.
  db.exec("CREATE INDEX IF NOT EXISTS idx_visits_doorbell ON visits (doorbell_id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_visits_follow_up ON visits (team_id, follow_up_at)",
  );
}

/** Fuegt eine Spalte hinzu, falls sie noch fehlt. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function getDb(): Database.Database {
  if (!global.__d2dDb) global.__d2dDb = createDb();
  return global.__d2dDb;
}

export function getSetting(key: string, fallback = ""): string {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}
