import { NextResponse } from "next/server";
import { AuthError } from "./auth";
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
