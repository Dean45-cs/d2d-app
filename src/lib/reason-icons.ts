/**
 * Zeichen der Ablehnungsgruende.
 *
 * Frueher trug jeder Grund ein Emoji - je nach Geraet anders gezeichnet und
 * neben den eigenen Zeichen der App ein Fremdkoerper. Jetzt waehlt die
 * Teamleitung eines dieser Zeichen; gezeichnet werden sie in
 * src/components/ReasonIcon.tsx (gleiche Familie wie icons.tsx), getoent auf
 * einer Kachel in einem der Symboltoene aus brand.css.
 *
 * Ohne React, damit auch Datenbank-Migration und API die Liste kennen.
 */

export const REASON_TONES = ["blue", "indigo", "purple", "magenta", "teal", "slate", "brown"] as const;
export type ReasonTone = (typeof REASON_TONES)[number];

export const REASON_ICONS = [
  { key: "smile", label: "Zufrieden", tone: "teal" },
  { key: "hand", label: "Abwehrende Hand", tone: "slate" },
  { key: "stopwatch", label: "Stoppuhr", tone: "indigo" },
  { key: "couple", label: "Zwei Personen", tone: "purple" },
  { key: "contract", label: "Vertrag mit Uhr", tone: "blue" },
  { key: "switch", label: "Wechselpfeile", tone: "teal" },
  { key: "euro", label: "Euro", tone: "brown" },
  { key: "door-slash", label: "Durchgestrichene Tür", tone: "slate" },
  { key: "document", label: "Unterlagen", tone: "blue" },
  { key: "key", label: "Schlüssel", tone: "brown" },
  { key: "frown", label: "Verärgert", tone: "magenta" },
  { key: "speech", label: "Sprechblasen", tone: "indigo" },
  { key: "pencil", label: "Stift", tone: "slate" },
  { key: "chat", label: "Sprechblase", tone: "slate" },
  { key: "phone", label: "Telefon", tone: "teal" },
  { key: "calendar", label: "Kalender", tone: "indigo" },
  { key: "hourglass", label: "Sanduhr", tone: "purple" },
  { key: "house", label: "Haus", tone: "teal" },
  { key: "lock", label: "Schloss", tone: "slate" },
  { key: "box", label: "Umzugskarton", tone: "brown" },
  { key: "shield", label: "Schild", tone: "blue" },
  { key: "bolt", label: "Strom", tone: "brown" },
  { key: "flame", label: "Gas", tone: "magenta" },
  { key: "sun", label: "Sonne", tone: "brown" },
  { key: "ban", label: "Verbot", tone: "slate" },
  { key: "alert", label: "Achtung", tone: "magenta" },
  { key: "question", label: "Unentschlossen", tone: "purple" },
] as const satisfies ReadonlyArray<{ key: string; label: string; tone: ReasonTone }>;

export type ReasonIconKey = (typeof REASON_ICONS)[number]["key"];

/** Fuer neue Gruende ohne Auswahl und fuer Unbekanntes. */
export const DEFAULT_REASON_ICON: ReasonIconKey = "chat";

const BY_KEY = new Map<string, (typeof REASON_ICONS)[number]>(REASON_ICONS.map((icon) => [icon.key, icon]));

export function isReasonIcon(value: unknown): value is ReasonIconKey {
  return typeof value === "string" && BY_KEY.has(value);
}

export function reasonIcon(key: string | null | undefined) {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get(DEFAULT_REASON_ICON)!;
}

/** Die mitgelieferten Gruende (DEFAULT_REASONS in queries.ts). */
const BY_CODE: Record<string, ReasonIconKey> = {
  ZUFRIEDEN: "smile",
  KEIN_INTERESSE: "hand",
  KEINE_ZEIT: "stopwatch",
  PARTNER: "couple",
  VERTRAG_LAEUFT: "contract",
  SCHON_GEWECHSELT: "switch",
  ZU_TEUER: "euro",
  KEINE_HAUSTUER: "door-slash",
  UNTERLAGEN: "document",
  MIETER: "key",
  SCHLECHTE_ERFAHRUNG: "frown",
  SPRACHE: "speech",
  SONSTIGES: "pencil",
};

/** Emoji eigener Gruende aus der Zeit davor - das naechstliegende Zeichen. */
const BY_EMOJI: Array<[ReasonIconKey, string]> = [
  ["smile", "🙂😀😃😄😊☺👍"],
  ["hand", "✋🖐🤚🙅"],
  ["stopwatch", "⏱⏰🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛"],
  ["hourglass", "⌛⏳"],
  ["couple", "👫👬👭👪💑👥"],
  ["calendar", "📆📅🗓"],
  ["switch", "🔁🔄🔀↔"],
  ["euro", "💶💰💸💵€"],
  ["door-slash", "🚪"],
  ["document", "📄📃📋📑🗂📁"],
  ["key", "🔑🗝"],
  ["frown", "😠😡😤🙁☹😞👎"],
  ["speech", "🗣🌍🌐"],
  ["chat", "💬🗨"],
  ["pencil", "✏✍📝🖊"],
  ["phone", "📞☎📱"],
  ["house", "🏠🏡🏢🏘"],
  ["lock", "🔒🔐"],
  ["box", "📦🚚"],
  ["shield", "🛡"],
  ["bolt", "⚡🔌"],
  ["flame", "🔥"],
  ["sun", "☀🌞"],
  ["ban", "🚫⛔❌"],
  ["alert", "⚠❗"],
  ["question", "❓❔🤔🤷"],
];

/** Zeichen fuer einen bestehenden Grund: nach Code, sonst nach seinem Emoji. */
export function reasonIconFor(code: string, emoji = ""): ReasonIconKey {
  if (BY_CODE[code]) return BY_CODE[code];
  const plain = emoji.replace(/[︎️‍]/g, "");
  if (plain) {
    for (const [key, emojis] of BY_EMOJI) {
      if ([...plain].some((char) => emojis.includes(char))) return key;
    }
  }
  return DEFAULT_REASON_ICON;
}
