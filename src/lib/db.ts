import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { avatarSrc } from "./avatar-src";

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
  // Profilbilder werden fuer die Anzeige als Adresse ausgeliefert, nicht als Data-URL.
  db.function("avatar_src", { deterministic: true }, (id, avatar) =>
    avatarSrc(Number(id), typeof avatar === "string" ? avatar : ""),
  );
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

    /* Indizes auf visits: jede Seite zaehlt Besuche - je Team, Person,
       Strasse, Haus, Klingel, Gebiet oder Grund. Die Spalten hinter dem
       Suchschluessel (outcome, created_at, ...) machen die Indizes
       "abdeckend": gezaehlt wird im Index, ohne jede Zeile der Tabelle zu
       lesen. Im Lasttest (300.000 Besuche) wurden Gebietsliste und
       Auswertungen damit von mehreren Sekunden auf Millisekunden schnell. */
    CREATE INDEX IF NOT EXISTS idx_visits_team_created_outcome ON visits (team_id, created_at, outcome, user_id);
    -- team_id hinten, sonst nimmt SQLite (ohne ANALYZE) fuer "Person im Team" den Teamindex
    -- und laeuft durch die Besuche des ganzen Teams.
    CREATE INDEX IF NOT EXISTS idx_visits_user_created_team    ON visits (user_id, created_at, outcome, team_id);
    CREATE INDEX IF NOT EXISTS idx_visits_user_team_outcome    ON visits (user_id, team_id, outcome);
    CREATE INDEX IF NOT EXISTS idx_visits_street_outcome       ON visits (street_id, outcome, created_at);
    -- Der Ausdruck muss exakt dem in HOUSE_MATCH (queries.ts) entsprechen, sonst greift der Index nicht.
    CREATE INDEX IF NOT EXISTS idx_visits_street_house         ON visits (street_id, lower(replace(house_number, ' ', '')));
    CREATE INDEX IF NOT EXISTS idx_visits_territory_outcome    ON visits (territory_id, outcome);
    CREATE INDEX IF NOT EXISTS idx_visits_reason               ON visits (reason_id, team_id, created_at, user_id);
    -- Abgeloest durch die Indizes oben (gleicher Anfang, mehr Spalten).
    DROP INDEX IF EXISTS idx_visits_team_created;
    DROP INDEX IF EXISTS idx_visits_user_created;
    DROP INDEX IF EXISTS idx_visits_user_created_outcome;
    DROP INDEX IF EXISTS idx_visits_street;
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

    /* Selbst gepflegte Grundversorger-Preise, abgetippt vom Preisblatt des
       Versorgers. Gehen fuer das Team allen Werten aus der Tagesquelle vor. */
    CREATE TABLE IF NOT EXISTS provider_prices (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      postal_code    TEXT NOT NULL,
      city           TEXT NOT NULL DEFAULT '',
      provider       TEXT NOT NULL,
      gas_provider   TEXT NOT NULL DEFAULT '',
      lat            REAL,
      lng            REAL,
      strom_ct_kwh   REAL,
      strom_base_eur REAL,
      gas_ct_kwh     REAL,
      gas_base_eur   REAL,
      valid_from     TEXT NOT NULL DEFAULT '',
      source_url     TEXT NOT NULL DEFAULT '',
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (team_id, postal_code)
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

  /* Profilbild des Mitarbeiters als Data-URL (kleines JPEG, von der
     Teamleitung beim Anlegen gesetzt). An der Tuer steht damit ein Gesicht
     neben "zuletzt hier war ..." - ein Name allein sagt im Treppenhaus
     weniger als das Bild des Kollegen. Als Text in der Datenbank, weil die
     App sonst keinen Ort fuer Dateien haette. */
  addColumn(db, "users", "avatar", "TEXT NOT NULL DEFAULT ''");

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

  // Frueher fuellte die App die Energiekarte ohne Quelle mit erfundenen
  // Beispielpreisen. Die fliegen raus - samt Protokoll und Merker, sonst
  // stuende in den Einstellungen weiter "Demo" als Quelle.
  if (hasColumn(db, "energy_prices", "is_demo")) {
    db.exec("DELETE FROM energy_prices WHERE is_demo = 1");
  }
  db.exec("DELETE FROM energy_refresh_log WHERE source LIKE 'Demo%'");
  const source = db.prepare("SELECT value FROM settings WHERE key = 'energy_source'").get() as
    | { value: string }
    | undefined;
  if (source?.value.startsWith("Demo")) {
    db.exec("DELETE FROM settings WHERE key IN ('energy_source', 'energy_last_success')");
  }
  db.exec("DELETE FROM settings WHERE key = 'energy_is_demo'");

  // Erst hier, denn vor addColumn gibt es die Spalte in alten Datenbanken nicht.
  // Mit outcome abdeckend fuer den Klingel-Stand; loest idx_visits_doorbell ab.
  db.exec("CREATE INDEX IF NOT EXISTS idx_visits_doorbell_outcome ON visits (doorbell_id, outcome)");
  db.exec("DROP INDEX IF EXISTS idx_visits_doorbell");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_visits_follow_up ON visits (team_id, follow_up_at)",
  );

  addColumn(db, "visits", "follow_up_user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
  /*
   * Termine: je Person (dem, dem der Termin gehoert - auch nach einer
   * Uebergabe) und teamweit getrennt nach offen und erledigt. Ohne diese
   * Indizes lief jede Terminliste durch alle Termine des Teams.
   */
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_visits_appt_owner ON visits
      (COALESCE(follow_up_user_id, user_id), follow_up_done_at, follow_up_at) WHERE outcome = 'APPOINTMENT';
    CREATE INDEX IF NOT EXISTS idx_visits_appt_open ON visits (team_id, follow_up_at)
      WHERE outcome = 'APPOINTMENT' AND follow_up_done_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_visits_appt_done ON visits (team_id, follow_up_at)
      WHERE outcome = 'APPOINTMENT' AND follow_up_done_at IS NOT NULL;
  `);
  addColumn(db, "visits", "follow_up_timezone", "TEXT NOT NULL DEFAULT 'Europe/Berlin'");
  addColumn(db, "visits", "follow_up_utc", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sale_drafts (
      draft_key TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CONFIRMED','ABORTED')),
      visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, draft_key)
    );
    CREATE TABLE IF NOT EXISTS appointment_reminders (
      visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot TEXT NOT NULL,
      timezone TEXT NOT NULL,
      lease_until INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      PRIMARY KEY(visit_id, user_id, slot, timezone)
    );
    CREATE TABLE IF NOT EXISTS territory_handovers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL DEFAULT '',
      appointment_policy TEXT NOT NULL CHECK(appointment_policy IN ('KEEP','TRANSFER')),
      appointments_transferred INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateCommunity(db);
  migrateInvitations(db);
  addColumn(db, "territories", "created_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_territories_creator ON territories(created_by);
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      allowed INTEGER NOT NULL CHECK(allowed IN (0, 1)),
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, permission)
    );
  `);
  // Nach einem Undo bleibt die Anfrage bekannt. Ein spaeter Offline-Retry
  // darf weder den Besuch wiederherstellen noch erneut XP vergeben.
  db.exec(`
    CREATE TABLE IF NOT EXISTS visit_requests (
      client_request_id TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
      PRIMARY KEY (user_id, client_request_id)
    );
    CREATE INDEX IF NOT EXISTS idx_visit_requests_visit ON visit_requests(visit_id);
  `);
}

function migrateInvitations(db: Database.Database) {
  const needsStructure = !hasColumn(db, "users", "manager_id");
  addColumn(db, "users", "manager_id", "INTEGER REFERENCES users(id) ON DELETE RESTRICT");
  // Nur eindeutige bestehende Teams automatisch zuordnen. Bei mehreren
  // Teamleitungen wird die tatsächliche Struktur in der Teamverwaltung gesetzt.
  if (needsStructure) {
    db.exec(`UPDATE users SET manager_id = (
      SELECT id FROM users leader WHERE leader.team_id = users.team_id AND leader.role = 'LEADER'
    ) WHERE role = 'MEMBER' AND (
      SELECT COUNT(*) FROM users leader WHERE leader.team_id = users.team_id AND leader.role = 'LEADER'
    ) = 1`);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);
    CREATE TABLE IF NOT EXISTS invitation_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      inviter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+7 days')),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invitation_owner ON invitation_links(inviter_id);
    CREATE TABLE IF NOT EXISTS join_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_id INTEGER NOT NULL UNIQUE REFERENCES invitation_links(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      decided_by INTEGER REFERENCES users(id),
      user_id INTEGER REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_join_pending_email ON join_requests(lower(email)) WHERE status = 'PENDING';
  `);
}

/**
 * Feed, Profil und Abos.
 *
 * Ein Abschluss erscheint als eigener Beitrag im Feed. Er haengt am Besuch:
 * wird der Eintrag an der Tuer rueckgaengig gemacht, verschwindet mit ihm
 * auch der Beitrag samt Kommentaren - niemand gratuliert zu einem Vertrag,
 * den es nicht gibt.
 */
function migrateCommunity(db: Database.Database) {
  // Kurzer Text ueber sich selbst, wie bei Twitter unter dem Namen.
  addColumn(db, "users", "bio", "TEXT NOT NULL DEFAULT ''");
  // Ohne Netz erfasste Tueren zaehlen fuer den Moment an der Tuer (created_at);
  // received_at haelt fest, wann sie ankamen - danach richtet sich "Rueckgaengig".
  addColumn(db, "visits", "received_at", "TEXT");
  // Zaehlt hoch, wenn alle Anmeldungen einer Person enden sollen (neues Passwort, Deaktivieren).
  addColumn(db, "users", "session_version", "INTEGER NOT NULL DEFAULT 0");

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK (kind IN ('TEXT','SALE')),
      body       TEXT NOT NULL DEFAULT '',
      visit_id   INTEGER REFERENCES visits(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_team_id  ON posts (team_id, id);
    CREATE INDEX IF NOT EXISTS idx_posts_user_id  ON posts (user_id, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_visit ON posts (visit_id);

    CREATE TABLE IF NOT EXISTS post_comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments (post_id, id);

    CREATE TABLE IF NOT EXISTS post_likes (
      post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_likes_user ON post_likes (user_id);

    /* Wer wen abonniert hat. Ein Abo bedeutet: Push aufs Handy, sobald die
       Person einen Vertrag macht - und ihre Beitraege unter "Abonniert". */
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, followee_id),
      CHECK (follower_id <> followee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows (followee_id);

    /* Geraete, die Push-Nachrichten empfangen. Ein Mensch kann mehrere haben
       (Handy und Tablet); die Adresse vergibt der Push-Dienst des Browsers. */
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint     TEXT NOT NULL UNIQUE,
      p256dh       TEXT NOT NULL,
      auth         TEXT NOT NULL,
      user_agent   TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_success TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);
  `);

  // Abschluesse von vor dem Feed nachtragen - sonst stuende er am ersten Tag
  // leer da, obwohl das Team schon Vertraege gemacht hat. Laeuft bei jedem
  // Start, fuegt aber nur hinzu, was fehlt.
  db.exec(`
    INSERT INTO posts (team_id, user_id, kind, visit_id, created_at)
    SELECT v.team_id, v.user_id, 'SALE', v.id, v.created_at
      FROM visits v
     WHERE v.outcome = 'SALE'
       AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.visit_id = v.id)
     ORDER BY v.id
  `);
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/** Fuegt eine Spalte hinzu, falls sie noch fehlt. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (hasColumn(db, table, column)) return;
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
