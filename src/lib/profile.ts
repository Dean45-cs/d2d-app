/*
 * Profil der Uebersicht: sechs Achsen, die zusammen zeigen, wie jemand
 * arbeitet - vom Pensum ueber den Trichter bis zum Nachfassen. Reine
 * Rechnerei ohne Datenbank, damit das Netzdiagramm im Browser zwischen Team
 * und Person wechseln kann.
 *
 * Verglichen wird nur mit sich selbst: jede Achse mit dem gleich langen
 * Zeitraum davor. Wer Teilzeit arbeitet oder ein schwieriges Gebiet hat,
 * wird hier nicht an anderen gemessen.
 */

export interface ProfileCounts {
  doors: number;
  met: number;
  appointments: number;
  sales: number;
  /** Arbeitstage (Berliner Kalendertage mit mindestens einer Tuer) - im Team je Person gezaehlt. */
  days: number;
  /** Abschluesse mit bekanntem Produkt - nur die zaehlen fuer die Kombiquote. */
  knownSales: number;
  /** Davon Strom und Gas zusammen. */
  comboSales: number;
  /** Termine, deren Uhrzeit im Zeitraum lag und schon vorbei ist. */
  dueAppointments: number;
  /** Davon abgehakt. */
  doneAppointments: number;
}

export const EMPTY_PROFILE: ProfileCounts = {
  doors: 0,
  met: 0,
  appointments: 0,
  sales: 0,
  days: 0,
  knownSales: 0,
  comboSales: 0,
  dueAppointments: 0,
  doneAppointments: 0,
};

/** Team = Summe der Personen; Arbeitstage werden so zu Personentagen. */
export function addProfiles(list: Iterable<ProfileCounts>): ProfileCounts {
  const sum = { ...EMPTY_PROFILE };
  for (const counts of list) {
    for (const key of Object.keys(sum) as Array<keyof ProfileCounts>) sum[key] += counts[key];
  }
  return sum;
}

export type ProfileAxisKey = "pace" | "meet" | "appointment" | "close" | "combo" | "follow_up";

export interface ProfileAxis {
  key: ProfileAxisKey;
  label: string;
  /** null: zu wenig Daten fuer eine Aussage. */
  value: (counts: ProfileCounts) => number | null;
  format: (value: number) => string;
  /** Woraus der Wert besteht: "12 von 35 Türen". */
  basis: (counts: ProfileCounts) => string;
}

/** Quote in Prozent - erst ab einer Mindestzahl, sonst fuehrt, wer einmal Glueck hatte. */
function rate(part: number, total: number, min: number): number | null {
  return total >= min ? (part / total) * 100 : null;
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString("de-DE")} ${value === 1 ? one : many}`;
}

const percent = (value: number) => `${Math.round(value)} %`;

/**
 * Reihenfolge im Uhrzeigersinn ab oben: der Weg von der Tuer zum Vertrag,
 * dann was danach kommt. Mindestmengen wie in der Rangliste (ranking.ts).
 */
export const PROFILE_AXES: ProfileAxis[] = [
  {
    key: "pace",
    label: "Fleiß",
    value: (c) => (c.days > 0 ? c.doors / c.days : null),
    format: (value) => `${Math.round(value).toLocaleString("de-DE")} / Tag`,
    basis: (c) => `${count(c.doors, "Tür", "Türen")} an ${count(c.days, "Tag", "Tagen")}`,
  },
  {
    key: "meet",
    label: "Antreffen",
    value: (c) => rate(c.met, c.doors, 20),
    format: percent,
    basis: (c) => `${c.met} von ${count(c.doors, "Tür", "Türen")}`,
  },
  {
    key: "appointment",
    label: "Termine",
    value: (c) => rate(c.appointments, c.met, 5),
    format: percent,
    basis: (c) => `${c.appointments} von ${count(c.met, "Gespräch", "Gesprächen")}`,
  },
  {
    key: "close",
    label: "Abschluss",
    value: (c) => rate(c.sales, c.met, 5),
    format: percent,
    basis: (c) => `${c.sales} von ${count(c.met, "Gespräch", "Gesprächen")}`,
  },
  {
    key: "combo",
    label: "Kombi",
    value: (c) => rate(c.comboSales, c.knownSales, 3),
    format: percent,
    basis: (c) => `${c.comboSales} von ${count(c.knownSales, "Abschluss", "Abschlüssen")}`,
  },
  {
    key: "follow_up",
    label: "Nachfassen",
    value: (c) => rate(c.doneAppointments, c.dueAppointments, 3),
    format: percent,
    basis: (c) => `${c.doneAppointments} von ${count(c.dueAppointments, "fälligen Termin", "fälligen Terminen")}`,
  },
];

/** Aussenring des Diagramms: doppelt so viel wie vorher. Mehr wird am Rand gekappt. */
export const MAX_CHANGE = 2;

/**
 * Wo der Punkt einer Achse liegt: 1 = wie vorher (der gestrichelte Ring),
 * 0 = nichts mehr, MAX_CHANGE = doppelt so viel. null, wenn einer der beiden
 * Zeitraeume zu wenig Daten hat - dann gibt es keinen Vergleich.
 */
export function profileChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null;
  if (before === 0) return now === 0 ? 1 : MAX_CHANGE;
  return Math.min(now / before, MAX_CHANGE);
}

export interface ProfilePoint {
  axis: ProfileAxis;
  now: number | null;
  before: number | null;
  change: number | null;
}

export function profilePoints(now: ProfileCounts, before: ProfileCounts | null): ProfilePoint[] {
  return PROFILE_AXES.map((axis) => {
    const current = axis.value(now);
    const previous = before ? axis.value(before) : null;
    return { axis, now: current, before: previous, change: profileChange(current, previous) };
  });
}
