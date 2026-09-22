import { NextResponse } from "next/server";
import { AuthError } from "./auth";
import {
  MAX_BELLS_PER_HOUSE,
  normalizeFloor,
  normalizeLabel,
  type DoorbellInput,
} from "./doorbells";
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

/**
 * Groesse des Profilbilds in Zeichen der Data-URL. 200.000 Zeichen sind rund
 * 150 KB Bild - fuer ein Gesicht in einer Liste weit mehr als genug, und die
 * Datenbank bleibt klein genug fuer den Offline-Abgleich.
 */
export const MAX_AVATAR_CHARS = 200_000;

/** Profilbild pruefen: nur echte Bild-Data-URLs, und klein genug. */
export function optionalAvatar(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(text)) {
    throw new ValidationError("Das Profilbild muss ein Bild sein (PNG, JPEG oder WebP).");
  }
  if (text.length > MAX_AVATAR_CHARS) {
    throw new ValidationError("Das Profilbild ist zu groß – bitte ein kleineres Bild wählen.");
  }
  return text;
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
