import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import {
  MAX_BELLS_PER_HOUSE,
  normalizeFloor,
  normalizeLabel,
  type DoorbellInput,
} from "./doorbells";
import { orderProblems, signatureValid, SIGNATURE_MAX_CHARS } from "./orders";
import type { HouseNumberInput, StreetInput } from "./queries";

/** Einheitliche Fehlerbehandlung fuer alle API-Routen. */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    console.error("[api]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export class ValidationError extends Error {}

export function requireText(value: unknown, field: string, max = 300): string {
  const text = String(value ?? "").trim();
  if (!text) throw new ValidationError(`${field} darf nicht leer sein.`);
  return text.slice(0, max);
}

export function optionalText(value: unknown, max = 2000): string {
  return String(value ?? "").trim().slice(0, max);
}

export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Strassenliste aus der Kartenauswahl pruefen.
 * Erwartet [{ name, houseNumbers, units, lat, lng }, ...].
 */
export function parseStreetList(value: unknown): StreetInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 500)
    .map((entry): StreetInput | null => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const name = optionalText(item.name, 120);
      if (!name) return null;
      const units = Math.max(0, Math.min(9999, Math.round(optionalNumber(item.units) ?? 0)));
      return {
        name,
        houseNumbers: optionalText(item.houseNumbers, 60),
        units,
        lat: coordinate(item.lat, 90),
        lng: coordinate(item.lng, 180),
        numbers: parseHouseNumbers(item.numbers),
      };
    })
    .filter((entry): entry is StreetInput => entry !== null);
}

function coordinate(value: unknown, limit: number): number | null {
  const n = optionalNumber(value);
  return n !== null && Math.abs(n) <= limit ? n : null;
}

/**
 * Klingelschilder eines Hauses pruefen.
 * Erwartet [{ label, floor }, ...]; doppelte Namen fallen weg.
 */
export function parseDoorbellList(value: unknown): DoorbellInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: DoorbellInput[] = [];
  for (const entry of value.slice(0, MAX_BELLS_PER_HOUSE)) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const label = normalizeLabel(item.label);
    if (!label) continue;
    const key = label.toLocaleLowerCase("de-DE");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, floor: normalizeFloor(item.floor) });
  }
  return out;
}

/** Einzelne Hausnummern einer Strasse pruefen. */
function parseHouseNumbers(value: unknown): HouseNumberInput[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: HouseNumberInput[] = [];
  for (const entry of value.slice(0, 1000)) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const number = optionalText(item.number, 12);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    out.push({
      number,
      units: Math.max(0, Math.min(999, Math.round(optionalNumber(item.units) ?? 0))),
      lat: coordinate(item.lat, 90),
      lng: coordinate(item.lng, 180),
    });
  }
  return out;
}

/* ================================ Auftrag =============================== */

/** Die Felder, die das Geraet zu einem Auftrag schickt. */
export interface OrderPayload {
  clientRef: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  energyType: "STROM" | "GAS" | "BEIDES";
  tariff: string;
  previousProvider: string;
  meterStrom: string;
  meterGas: string;
  usageStrom: number;
  usageGas: number;
  startDate: string | null;
  note: string;
  signature: string;
  withdrawalGiven: boolean;
  privacyGiven: boolean;
}

/**
 * Auftragsdaten pruefen.
 *
 * Unterschrift, Widerrufsbelehrung und Datenschutzhinweis werden hier hart
 * verlangt - nicht nur in der Oberflaeche. Sonst haengt die Dokumentation des
 * Tuergespraechs daran, dass der Client sich benimmt.
 */
export function parseOrderPayload(value: unknown): OrderPayload {
  const item = (value ?? {}) as Record<string, unknown>;

  const clientRef = optionalText(item.clientRef, 64).replace(/[^A-Za-z0-9_-]/g, "");
  if (clientRef.length < 8) throw new ValidationError("Auftragskennung fehlt.");

  const signature = optionalText(item.signature, SIGNATURE_MAX_CHARS);
  if (signature && !signatureValid(signature)) {
    throw new ValidationError("Die Unterschrift konnte nicht gelesen werden.");
  }

  const energyType = optionalText(item.energyType, 10).toUpperCase();

  const payload: OrderPayload = {
    clientRef,
    customerName: optionalText(item.customerName, 120),
    customerPhone: optionalText(item.customerPhone, 40),
    customerEmail: optionalText(item.customerEmail, 120),
    energyType: (["STROM", "GAS", "BEIDES"].includes(energyType)
      ? energyType
      : "BEIDES") as OrderPayload["energyType"],
    tariff: optionalText(item.tariff, 120),
    previousProvider: optionalText(item.previousProvider, 120),
    meterStrom: optionalText(item.meterStrom, 40),
    meterGas: optionalText(item.meterGas, 40),
    usageStrom: kwh(item.usageStrom),
    usageGas: kwh(item.usageGas),
    startDate: isoDate(item.startDate),
    note: optionalText(item.note, 500),
    signature,
    withdrawalGiven: Boolean(item.withdrawalGiven),
    privacyGiven: Boolean(item.privacyGiven),
  };

  const problems = orderProblems({
    customerName: payload.customerName,
    customerPhone: payload.customerPhone,
    signature: payload.signature,
    withdrawalGiven: payload.withdrawalGiven,
    privacyGiven: payload.privacyGiven,
  });
  if (problems.length > 0) throw new ValidationError(`${problems.join(", ")}.`);

  return payload;
}

/** Jahresverbrauch in kWh - grosszuegig gedeckelt, damit kein Tippfehler durchrutscht. */
function kwh(value: unknown): number {
  const n = optionalNumber(value) ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(999_999, Math.round(n));
}

/** "2026-10-01" oder nichts. */
export function isoDate(value: unknown): string | null {
  const text = optionalText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
