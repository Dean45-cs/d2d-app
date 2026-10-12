import { getDb } from "./db";
import { appointmentUtc } from "./appointment-time";
import { pushToUsers, type PushMessage } from "./push";

interface Reminder {
  id: number;
  owner_id: number;
  follow_up_at: string;
  follow_up_timezone: string;
  follow_up_utc: string | null;
}

/** DB leases prevent concurrent workers sending the same reminder at once. */
export async function sendAppointmentReminders(now = new Date(), send = pushToUsers): Promise<number> {
  const db = getDb();
  const rows = db.prepare(`SELECT v.id, COALESCE(v.follow_up_user_id, v.user_id) AS owner_id,
      v.follow_up_at, v.follow_up_timezone, v.follow_up_utc
    FROM visits v JOIN users u ON u.id = COALESCE(v.follow_up_user_id, v.user_id)
    WHERE v.outcome = 'APPOINTMENT' AND v.follow_up_done_at IS NULL AND v.follow_up_at IS NOT NULL
      AND u.active = 1 AND u.team_id = v.team_id
      AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`)
    .all() as Reminder[];
  let delivered = 0;
  for (const row of rows) {
    let start: number;
    try { start = Date.parse(row.follow_up_utc ?? appointmentUtc(row.follow_up_at, row.follow_up_timezone)); }
    catch { continue; }
    const remaining = start - now.getTime();
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 15 * 60_000) continue;
    const key = [row.id, row.owner_id, row.follow_up_at, row.follow_up_timezone];
    const claim = db.prepare(`INSERT INTO appointment_reminders(visit_id, user_id, slot, timezone, lease_until)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(visit_id, user_id, slot, timezone)
      DO UPDATE SET lease_until = excluded.lease_until
      WHERE appointment_reminders.sent_at IS NULL AND appointment_reminders.lease_until <= ?`)
      .run(...key, now.getTime() + 120_000, now.getTime());
    if (!claim.changes) continue;
    // No customer names or addresses on a potentially locked phone.
    const message: PushMessage = { title: "Terminerinnerung", body: `Dein nächster Termin beginnt um ${row.follow_up_at.slice(11)} Uhr.`,
      url: `/termine?termin=${row.id}`, tag: `appointment-${row.id}`, ttl: Math.max(1, Math.floor(remaining / 1000)) };
    try {
      if (await send([row.owner_id], message) > 0) {
        db.prepare("UPDATE appointment_reminders SET sent_at = datetime('now') WHERE visit_id = ? AND user_id = ? AND slot = ? AND timezone = ?")
          .run(...key);
        delivered++;
      } else {
        db.prepare("UPDATE appointment_reminders SET lease_until = ? WHERE visit_id = ? AND user_id = ? AND slot = ? AND timezone = ?")
          .run(now.getTime() + 60_000, ...key);
      }
    } catch (error) { console.warn("[appointment-reminders]", error); }
  }
  return delivered;
}

declare global {
  var __d2dReminderWorker: ReturnType<typeof setInterval> | undefined;
}

export function startAppointmentReminderWorker() {
  if (global.__d2dReminderWorker || process.env.NEXT_PHASE === "phase-production-build") return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await sendAppointmentReminders(); }
    catch (error) { console.warn("[appointment-reminders]", error); }
    finally { running = false; }
  };
  global.__d2dReminderWorker = setInterval(() => { void tick(); }, 30_000);
  global.__d2dReminderWorker.unref();
  void tick();
}
