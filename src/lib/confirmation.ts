/**
 * Terminbestaetigung per WhatsApp oder SMS.
 *
 * Ein Termin an der Tuer ist schnell zugesagt und genauso schnell vergessen.
 * Eine kurze Nachricht mit Tag, Uhrzeit und Namen - am besten noch an der
 * Tuer geschickt - macht aus der Zusage eine Verabredung: der Kunde hat die
 * Nummer, kann absagen statt nicht aufzumachen, und erkennt beim zweiten
 * Besuch das Gesicht von der Visitenkarte wieder.
 *
 * Die App verschickt nichts selbst: die Links oeffnen WhatsApp bzw. die
 * Nachrichten-App des Handys mit fertigem Text, gesendet wird von dort. Das
 * kostet nichts, braucht keinen Dienst und funktioniert auch im Funkloch
 * (WhatsApp und SMS senden nach, sobald wieder Netz da ist).
 *
 * Bewusst ohne Datenbankbezug - Tuer, Terminliste und Tests rechnen gleich.
 */

import { parseSlot } from "./appointments";

/** Laendervorwahl fuer Nummern, die mit 0 beginnen. Die App ist fuer Teams in Deutschland gebaut. */
export const DEFAULT_COUNTRY_CODE = "49";

/**
 * Rufnummer international ohne "+" - so verlangt sie WhatsApp ("491711234567").
 * Leer, wenn es keine Rufnummer sein kann (zu kurz, zu lang, Buchstaben).
 */
export function internationalPhone(raw: string, country = DEFAULT_COUNTRY_CODE): string {
  // "+49 (0)171 …" - die eingeklammerte Null gehoert nicht zur internationalen Nummer.
  const text = raw.trim().replace(/\(0\)/g, "");
  if (!text || /[a-z]/i.test(text)) return "";
  let digits = text.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = country + digits.slice(1);
  if (digits.includes("+")) return "";
  // E.164: hoechstens 15 Ziffern; unter 8 ist es keine erreichbare Nummer.
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

/** Link, der WhatsApp mit fertigem Text an diese Nummer oeffnet - leer ohne gueltige Nummer. */
export function whatsappHref(phone: string, text: string): string {
  const number = internationalPhone(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : "";
}

/**
 * Link in die Nachrichten-App. "?&body=" verstehen iPhone und Android
 * gleichermassen - "?body=" allein kennt iOS nicht ueberall, "&body=" allein
 * Android nicht.
 */
export function smsHref(phone: string, text: string): string {
  const number = internationalPhone(phone);
  return number ? `sms:+${number}?&body=${encodeURIComponent(text)}` : "";
}

/**
 * Anrede aus dem Namen am Termin. Steht dort nur ein Wort - meist der
 * Nachname vom Klingelschild ("Müller") -, waere "Guten Tag Müller" schroff;
 * dann ohne Namen. "Frau Müller", "Familie Schmidt" oder "Anna Müller"
 * bleiben stehen.
 */
export function greeting(contactName: string): string {
  const name = contactName.trim().replace(/\s+/g, " ");
  return name.includes(" ") ? `Guten Tag ${name},` : "Guten Tag,";
}

/**
 * Wann, in Worten fuer den Kunden: "heute um 18:00 Uhr" oder "am Mittwoch,
 * 28.10., um 18:00 Uhr". "Morgen" bewusst nicht - wer die Nachricht erst am
 * naechsten Tag liest, kaeme einen Tag zu spaet.
 */
export function slotPhrase(slot: string, now: Date = new Date()): string {
  const date = parseSlot(slot);
  if (!date) return "";
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} Uhr`;
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return `heute um ${time}`;
  const weekday = date.toLocaleDateString("de-DE", { weekday: "long" });
  const day = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `am ${weekday}, ${day}, um ${time}`;
}

export interface ConfirmationInput {
  contactName: string;
  /** Ortszeit des Termins ("2026-10-28 18:00"). */
  slot: string;
  /** Wer kommt - unterschreibt die Nachricht. */
  senderName: string;
  teamName: string;
  /** Adresse der eigenen Visitenkarte; leer, solange sie ausgeschaltet ist. */
  cardUrl?: string;
  now?: Date;
}

/** Der Text der Bestaetigung - in WhatsApp bzw. SMS vor dem Senden noch aenderbar. */
export function confirmationText(input: ConfirmationInput): string {
  const when = slotPhrase(input.slot, input.now);
  const lines = [
    greeting(input.contactName),
    "",
    `wie besprochen komme ich ${when || "zum vereinbarten Termin"} wieder bei Ihnen vorbei – zur Beratung zu Strom und Gas.`,
    "Passt es doch nicht? Dann antworten Sie einfach auf diese Nachricht.",
    "",
    "Viele Grüße",
    input.senderName.trim(),
    input.teamName.trim(),
  ];
  if (input.cardUrl) lines.push("", `Meine Visitenkarte: ${input.cardUrl}`);
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim();
}
