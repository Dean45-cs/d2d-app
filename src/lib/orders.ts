/**
 * Auftraege an der Tuer - Regeln, die Oberflaeche und Server teilen.
 *
 * Bewusst ohne Datenbank-Bezug, damit auch Client-Komponenten davon lesen
 * koennen: an der Tuer muss die App ohne Netz wissen, was ein vollstaendiger
 * Auftrag ist und wie lange die Widerrufsfrist noch laeuft.
 */

import type { OrderStatus } from "./types";

/** Gesetzliche Widerrufsfrist bei Haustuergeschaeften (§ 355 BGB). */
export const WITHDRAWAL_DAYS = 14;

/**
 * Die Nachbearbeitung eines Auftrags, in der Reihenfolge, in der sie laeuft:
 * an der Tuer unterschrieben, im Bestaetigungsanruf durchgesprochen, beim
 * Partner eingereicht, von dort bestaetigt.
 */
export const ORDER_FLOW: OrderStatus[] = [
  "ERFASST",
  "QUALITY_CALL",
  "EINGEREICHT",
  "BESTAETIGT",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  ERFASST: "An der Tür erfasst",
  QUALITY_CALL: "Bestätigungsanruf erledigt",
  EINGEREICHT: "Beim Partner eingereicht",
  BESTAETIGT: "Bestätigt",
  STORNIERT: "Storniert",
  WIDERRUFEN: "Widerrufen",
};

/** Kurzform fuer Plaketten - auf dem Handy ist die Spalte schmal. */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  ERFASST: "Erfasst",
  QUALITY_CALL: "Anruf ok",
  EINGEREICHT: "Eingereicht",
  BESTAETIGT: "Bestätigt",
  STORNIERT: "Storniert",
  WIDERRUFEN: "Widerrufen",
};

export const ORDER_STATUS_HINT: Record<OrderStatus, string> = {
  ERFASST: "Der Kunde hat unterschrieben. Jetzt fehlt der Bestätigungsanruf.",
  QUALITY_CALL: "Alle Auftragsbestandteile wurden mit dem Kunden durchgesprochen.",
  EINGEREICHT: "Der Auftrag liegt beim Partner und wird dort geprüft.",
  BESTAETIGT: "Der Vertrag ist zustande gekommen.",
  STORNIERT: "Der Auftrag wurde nicht weiterverfolgt.",
  WIDERRUFEN: "Der Kunde hat innerhalb der Frist widerrufen.",
};

/** Ein Auftrag, an dem noch etwas zu tun ist. */
export function orderOpen(status: OrderStatus): boolean {
  return status === "ERFASST" || status === "QUALITY_CALL" || status === "EINGEREICHT";
}

/** Zaehlt der Auftrag als Erfolg? Storno und Widerruf tun es nicht. */
export function orderLost(status: OrderStatus): boolean {
  return status === "STORNIERT" || status === "WIDERRUFEN";
}

/** Der naechste Schritt in der Kette, oder null am Ende. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_FLOW.indexOf(status);
  if (index < 0 || index >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[index + 1];
}

/* ----------------------------- Widerrufsfrist ---------------------------- */

/** Zeitpunkt, zu dem die Widerrufsfrist ablaeuft. */
export function withdrawalDeadline(createdAt: string): Date {
  return new Date(utc(createdAt).getTime() + WITHDRAWAL_DAYS * 86_400_000);
}

/**
 * Verbleibende Tage der Widerrufsfrist, aufgerundet.
 * 0 heisst: die Frist ist vorbei.
 */
export function withdrawalDaysLeft(createdAt: string, now: Date = new Date()): number {
  const rest = withdrawalDeadline(createdAt).getTime() - now.getTime();
  return rest <= 0 ? 0 : Math.ceil(rest / 86_400_000);
}

export function withdrawalLabel(createdAt: string, now: Date = new Date()): string {
  const days = withdrawalDaysLeft(createdAt, now);
  if (days === 0) return "Widerrufsfrist abgelaufen";
  return `Widerruf noch ${days} ${days === 1 ? "Tag" : "Tage"} möglich`;
}

/* ------------------------------ Pflichtfelder ---------------------------- */

export interface OrderDraft {
  customerName: string;
  customerPhone: string;
  signature: string;
  withdrawalGiven: boolean;
  privacyGiven: boolean;
}

/**
 * Was am Auftrag noch fehlt - dieselbe Liste an der Tuer und auf dem Server.
 *
 * Unterschrift und Widerrufsbelehrung sind keine Kuer: ohne sie ist der
 * Auftrag an der Haustuer nicht sauber dokumentiert.
 */
export function orderProblems(draft: OrderDraft): string[] {
  const problems: string[] = [];
  if (!draft.customerName.trim()) problems.push("Name des Kunden fehlt");
  if (!draft.signature) problems.push("Unterschrift fehlt");
  if (!draft.withdrawalGiven) problems.push("Widerrufsbelehrung ist nicht bestätigt");
  if (!draft.privacyGiven) problems.push("Datenschutzhinweis ist nicht bestätigt");
  return problems;
}

/** Nur echte PNG-Daten aus dem Unterschriftenfeld sind erlaubt. */
export const SIGNATURE_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Grosszuegig bemessen: eine gezeichnete Unterschrift liegt bei ~10 kB. */
export const SIGNATURE_MAX_CHARS = 400_000;

export function signatureValid(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= SIGNATURE_MAX_CHARS &&
    SIGNATURE_PATTERN.test(value)
  );
}

/* -------------------------------- Formate -------------------------------- */

export function orderAddress(order: {
  street_name: string;
  house_number: string;
  doorbell_label: string;
  postal_code: string;
  city: string;
}): string {
  const street = [order.street_name, order.house_number].filter(Boolean).join(" ");
  const place = [order.postal_code, order.city].filter(Boolean).join(" ");
  return [street, order.doorbell_label, place].filter(Boolean).join(" · ");
}

export function energyLabel(type: "STROM" | "GAS" | "BEIDES"): string {
  if (type === "STROM") return "Strom";
  if (type === "GAS") return "Gas";
  return "Strom + Gas";
}

/** "2026-09-20 08:15" aus der Datenbank ist UTC. */
function utc(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}
