import { fetchWithTimeout } from "@/lib/offline-queue";

/**
 * Aenderungen an Provisionen senden. Fehler kommen als Text zurueck - die
 * Oberflaeche zeigt sie als Toast oder unter dem Formular.
 */
export async function send(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  timeoutMs = 15_000,
): Promise<{ error: string | null; data: Record<string, unknown> }> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: body === undefined || body instanceof FormData ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      },
      timeoutMs,
    );
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.ok) return { error: null, data };
    return { error: typeof data.error === "string" ? data.error : "Nicht gespeichert.", data };
  } catch {
    return { error: "Keine Verbindung.", data: {} };
  }
}

/** "2026-11-08" -> "08.11." bzw. mit Jahr "08.11.2026". */
export function shortDay(day: string | null | undefined, withYear = false): string {
  if (!day) return "";
  const [y, m, d] = day.split("-");
  return withYear ? `${d}.${m}.${y}` : `${d}.${m}.`;
}

/** Eingabe "62,5" oder "62.5" -> 62.5; leer -> null; Unsinn -> NaN. */
export function parseInput(value: string): number | null {
  const text = value.trim().replace(/\s|%|€/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.NaN;
}
