/** Convert wall-clock appointment time using its IANA zone, independent of server TZ. */
export function appointmentTimeZone(value: unknown): string {
  const zone = value === undefined ? "Europe/Berlin" : String(value);
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); }
  catch { throw new Error("Ungültige Terminzeitzone."); }
  return zone;
}

export function appointmentUtc(slot: string, zone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(slot);
  if (!match) throw new Error("Bitte Datum und Uhrzeit angeben.");
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: appointmentTimeZone(zone),
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  let instant = wall;
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    if (observed === wall) return new Date(instant).toISOString();
    instant += wall - observed;
  }
  throw new Error("Diese Uhrzeit existiert wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.");
}
