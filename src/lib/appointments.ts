/**
 * Termine an der Tuer - Regeln, die Oberflaeche und Server teilen.
 *
 * Ein vereinbarter Termin ist die zweitbeste Sache nach dem Abschluss: er
 * kostet den Weg zurueck, bringt aber die Tuer, die sonst dreimal "nicht
 * angetroffen" waere. Damit er nicht verfaellt, braucht er eine Uhrzeit und
 * einen Platz in der Tagesliste.
 *
 * Gespeichert wird bewusst die ORTSZEIT als Text ("2026-09-21 18:00"): vor
 * der Tuer zaehlt die Uhr an der Wand. Als Text laesst sich die Liste
 * ausserdem direkt in SQL sortieren und filtern.
 */

const SLOT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

/** Bringt eine Eingabe auf "YYYY-MM-DD HH:MM" - leer, wenn sie nicht passt. */
export function normalizeSlot(raw: unknown): string {
  const match = SLOT.exec(String(raw ?? "").trim());
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  if (h > 23 || mi > 59) return "";
  // Ueber den Kalender gegengepruefte Tage: der 31. Februar faellt hier raus.
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return "";
  }
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** Ortszeit zurueck in ein Datum - null, wenn der Text nicht passt. */
export function parseSlot(value: string | null): Date | null {
  const normalized = normalizeSlot(value);
  if (!normalized) return null;
  const [date, time] = normalized.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

/** Ortszeit eines Datums im gespeicherten Format. */
export function toSlot(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Der Termin ist vorbei, aber noch nicht abgehakt. */
export function slotOverdue(value: string | null, now: Date = new Date()): boolean {
  const date = parseSlot(value);
  return date !== null && date.getTime() < now.getTime();
}

/** Faellt der Termin auf heute? */
export function slotToday(value: string | null, now: Date = new Date()): boolean {
  const date = parseSlot(value);
  return date !== null && dayKey(date) === dayKey(now);
}

/** "Heute 18:00", "Morgen 09:30", "Di, 23.09. · 17:00". */
export function slotLabel(value: string | null, now: Date = new Date()): string {
  const date = parseSlot(value);
  if (!date) return "ohne Uhrzeit";
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (days === 0) return `Heute ${time}`;
  if (days === 1) return `Morgen ${time}`;
  if (days === -1) return `Gestern ${time}`;
  const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
  const dayMonth = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${weekday}, ${dayMonth} · ${time}`;
}

/**
 * Vorschlaege fuer den schnellen Tipp an der Tuer.
 *
 * Abends wird am haeufigsten jemand angetroffen, deshalb steht der Abend
 * vorn. Was schon vorbei ist, faellt weg - ein Vorschlag in der
 * Vergangenheit waere an der Tuer nur ein Fehltipp.
 */
export function quickSlots(now: Date = new Date()): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const add = (label: string, date: Date) => {
    if (date.getTime() > now.getTime()) out.push({ label, value: toSlot(date) });
  };

  add("Heute 18:00", at(now, 0, 18, 0));
  add("Heute 19:30", at(now, 0, 19, 30));
  add("Morgen 10:00", at(now, 1, 10, 0));
  add("Morgen 18:00", at(now, 1, 18, 0));

  // Samstagvormittag: der Klassiker fuer Berufstaetige.
  const toSaturday = (6 - now.getDay() + 7) % 7 || 7;
  add("Samstag 11:00", at(now, toSaturday, 11, 0));

  return out.slice(0, 4);
}

/** Datumsteil fuer <input type="date">. */
export function slotDate(value: string | null): string {
  const normalized = normalizeSlot(value);
  return normalized ? normalized.slice(0, 10) : "";
}

/** Uhrzeitteil fuer <input type="time">. */
export function slotTime(value: string | null): string {
  const normalized = normalizeSlot(value);
  return normalized ? normalized.slice(11, 16) : "";
}

function at(now: Date, plusDays: number, hour: number, minute: number): Date {
  const date = new Date(now);
  date.setDate(date.getDate() + plusDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
