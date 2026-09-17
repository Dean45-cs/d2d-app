import { NextResponse } from "next/server";
import { AuthError } from "./auth";

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
