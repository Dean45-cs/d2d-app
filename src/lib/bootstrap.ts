import { getDb, getSetting } from "./db";
import { hashPassword } from "./auth";
import { ensureDefaultReasons } from "./queries";
import { refreshEnergyPrices } from "./energy/refresh";

/**
 * Ersteinrichtung beim Serverstart.
 *
 * Damit nach dem Deployen kein zusätzlicher Schritt über die Kommandozeile
 * nötig ist: Ist die Datenbank noch leer und sind Zugangsdaten hinterlegt,
 * werden Team und Teamleitung angelegt und die Energiekarte einmal befüllt.
 *
 * Läuft bewusst nur bei komplett leerer Nutzertabelle – ein versehentlicher
 * zweiter Durchlauf kann also niemandem das Passwort überschreiben.
 */
export async function bootstrap(): Promise<void> {
  const db = getDb();

  const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };

  if (count === 0) {
    const email = process.env.SEED_LEADER_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_LEADER_PASSWORD;

    if (!email || !password) {
      console.warn(
        "[Start] Die Datenbank ist leer und es wurde noch keine Teamleitung angelegt.\n" +
          "        Setze SEED_LEADER_EMAIL und SEED_LEADER_PASSWORD und starte neu.\n" +
          '        Bei Fly.io:  fly secrets set SEED_LEADER_EMAIL="..." SEED_LEADER_PASSWORD="..."',
      );
      return;
    }

    if (password.length < 8) {
      console.warn("[Start] SEED_LEADER_PASSWORD braucht mindestens 8 Zeichen – übersprungen.");
      return;
    }

    const teamName = process.env.SEED_TEAM?.trim() || "Door2Door Team";
    const leaderName = process.env.SEED_LEADER_NAME?.trim() || "Teamleitung";

    const teamId = db.prepare("INSERT INTO teams (name) VALUES (?)").run(teamName)
      .lastInsertRowid as number;
    db.prepare(
      `INSERT INTO users (team_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'LEADER')`,
    ).run(teamId, leaderName, email, hashPassword(password));
    ensureDefaultReasons(teamId);

    console.log(`[Start] Team „${teamName}“ und Teamleitung ${email} angelegt.`);
  }

  // Energiekarte einmalig befüllen, damit sie nicht leer bleibt.
  const prices = db.prepare("SELECT COUNT(*) AS count FROM energy_prices").get() as {
    count: number;
  };
  if (prices.count === 0) {
    const result = await refreshEnergyPrices();
    console.log(`[Start] Energiekarte: ${result.message}`);
  }

  scheduleDailyRefresh();
}

/**
 * Hält die Energiekarte aktuell, ohne dass ein externer Cron-Dienst nötig ist.
 *
 * Stündlich wird geprüft, wie lange der letzte erfolgreiche Abruf her ist –
 * so wird auch nach einem Neustart zuverlässig nachgeholt, statt stur alle
 * 24 Stunden ab Prozessstart zu laufen. Abschaltbar über ENERGY_AUTO_REFRESH=0.
 */
function scheduleDailyRefresh(): void {
  if (process.env.ENERGY_AUTO_REFRESH === "0") return;

  const HOUR = 60 * 60 * 1000;
  const MAX_AGE = 20 * HOUR;

  const check = async () => {
    try {
      const last = getSetting("energy_last_success");
      const age = last ? Date.now() - new Date(last).getTime() : Infinity;
      if (age < MAX_AGE) return;
      const result = await refreshEnergyPrices();
      console.log(`[Energiekarte] ${result.status}: ${result.message}`);
    } catch (error) {
      console.error("[Energiekarte] Abruf fehlgeschlagen:", error);
    }
  };

  const timer = setInterval(check, HOUR);
  // Der Zeitgeber soll den Prozess beim Herunterfahren nicht offen halten.
  timer.unref?.();
}
