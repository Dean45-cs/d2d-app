/**
 * Digitale Visitenkarte - eine oeffentliche Seite je Mitarbeiter.
 *
 * An der Haustuer zaehlt Vertrauen: "Wer sind Sie, und fuer wen kommen
 * Sie?" Ein Papierausweis laesst sich nachmachen, eine Seite auf der Adresse
 * der App nicht so leicht. Der Kunde scannt den QR-Code vom Handy des
 * Mitarbeiters (oder tippt den Link in der Terminbestaetigung) und sieht
 * Bild, Name, Team und Ausweisnummer - live vom Server, mit Uhrzeit des
 * Abrufs, damit ein Bildschirmfoto nicht als Beleg durchgeht. Wer nicht mehr
 * im Team ist, hat keine Karte mehr: die Seite meldet dann "nicht gueltig".
 *
 * Die Karte ist freiwillig: jede Person schaltet sie selbst ein (Profil ›
 * Visitenkarte). Ihre Adresse ist ein Zufallswert, keine laufende Nummer -
 * so laesst sich das Team nicht von aussen durchzaehlen. Ein neuer Link macht
 * den alten (und damit gedruckte oder weitergegebene QR-Codes) ungueltig.
 *
 * Hier stehen die Regeln ohne Datenbank; Abfragen in card-queries.ts.
 */

/** Laenge des Zufallswerts in Zeichen (base64url, 72 Bit) - kurz genug fuer einen gut lesbaren QR-Code. */
export const CARD_TOKEN_LENGTH = 12;

/** Woran die Seite einen Kartenlink erkennt - alles andere fragt die Datenbank gar nicht erst. */
export function isCardToken(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[A-Za-z0-9_-]{${CARD_TOKEN_LENGTH}}$`).test(value);
}

/** Pfad der Karte - kurz, weil er im QR-Code und in jeder Bestaetigung steht. */
export function cardPath(token: string): string {
  return `/k/${token}`;
}

/** Was auf der Karte unter dem Namen steht. */
export const CARD_ROLE = "Beratung Strom & Gas";

/** Die Daten einer Karte, wie die oeffentliche Seite sie zeigt. */
export interface PublicCard {
  name: string;
  team_name: string;
  /** Profilbild als Data-URL, "" ohne Bild. */
  avatar: string;
  /** Nur gesetzt, wenn die Person ihre Nummer zeigen will. */
  phone: string;
  badge_number: string;
  created_at: string;
}

/** "Dabei seit Oktober 2026" - der Monat, in dem das Konto angelegt wurde. */
export function memberSince(createdAt: string): string {
  const date = new Date(`${createdAt.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "Europe/Berlin" });
}

/** Zeitpunkt des Abrufs in deutscher Zeit: "24.10.2026, 14:32 Uhr". */
export function checkedAt(now: Date = new Date()): string {
  const text = now.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  return `${text} Uhr`;
}

/* ------------------------------- vCard ---------------------------------- */

/** Sonderzeichen eines vCard-Werts (RFC 6350, 3.4). */
function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/**
 * Lange Zeilen nach 75 Bytes umbrechen (RFC 6350, 3.2) - ohne ein
 * Umlaut-Zeichen mitten in seinen Bytes zu teilen.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Folgezeilen beginnen mit einem Leerzeichen - das zaehlt mit.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** "Anna Maria Müller" -> Nachname "Müller", Vorname "Anna Maria". */
function splitName(name: string): { family: string; given: string } {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { family: words[0] ?? "", given: "" };
  return { family: words[words.length - 1], given: words.slice(0, -1).join(" ") };
}

/**
 * Kontakt zum Speichern ("Kontakt sichern" auf der Karte) - vCard 3.0, die
 * iPhone und Android ohne Rueckfrage lesen. Das Profilbild kommt mit.
 */
export function cardVcard(card: PublicCard, url: string): string {
  const { family, given } = splitName(card.name);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeValue(family)};${escapeValue(given)};;;`,
    `FN:${escapeValue(card.name.trim())}`,
  ];
  if (card.team_name) lines.push(`ORG:${escapeValue(card.team_name)}`);
  lines.push(`TITLE:${escapeValue(CARD_ROLE)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${escapeValue(card.phone)}`);
  lines.push(`URL:${url}`);
  if (card.badge_number) lines.push(`NOTE:${escapeValue(`Ausweis-Nr. ${card.badge_number}`)}`);
  const photo = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(card.avatar);
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=${photo[1].toUpperCase()}:${photo[2]}`);
  lines.push("END:VCARD");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Dateiname fuer den Kontakt: "Anna-Mueller.vcf" - ohne Zeichen, an denen ein Browser scheitert. */
export function vcardFilename(name: string): string {
  const plain = name
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${plain || "Kontakt"}.vcf`;
}
