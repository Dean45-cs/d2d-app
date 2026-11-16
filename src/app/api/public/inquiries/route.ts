import { NextResponse } from "next/server";
import { clientAddress } from "@/lib/login-throttle";
import {
  InquiryFieldError,
  PayloadError,
  RateLimitError,
  isAllowedOrigin,
  parseBody,
  readLimitedBody,
  receiveInquiry,
  requestId,
} from "@/lib/inquiries";

export const dynamic = "force-dynamic";

/*
 * Kontaktformular der Website - die einzige Stelle der App, die ohne
 * Anmeldung schreibt. Reihenfolge der Pruefungen:
 *
 *   1. Herkunft: nur freigegebene Seiten (INQUIRY_ALLOWED_ORIGINS)
 *   2. Format und Groesse: JSON oder Formular, hoechstens 32 KB
 *   3. Bremse je Absender und insgesamt
 *   4. Honigtopf und Mindestzeit, dann jedes Feld einzeln
 *
 * Mit JavaScript schickt die Website JSON und bekommt JSON zurueck. Ohne
 * JavaScript schickt der Browser das Formular selbst; dann geht es per
 * Weiterleitung auf die Dankes- oder Fehlerseite der Website zurueck - nur
 * auf eine freigegebene Herkunft, damit niemand die App als Umleitung nutzt.
 */

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

const NO_STORE = { "cache-control": "no-store" };

function json(body: object, status: number, origin: string | null, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...(origin ? corsHeaders(origin) : { vary: "Origin" }), ...extra },
  });
}

function wantsRedirect(contentType: string): boolean {
  return contentType.split(";")[0].trim().toLowerCase() === "application/x-www-form-urlencoded";
}

function redirectTo(origin: string, page: "danke" | "fehler") {
  return new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE, location: `${origin}/${page}.html` },
  });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.headers)) return new NextResponse(null, { status: 403, headers: { vary: "Origin" } });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin!) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.headers)) {
    return json({ error: "Anfragen werden nur über die Website angenommen." }, 403, null);
  }
  const allowed = origin!;
  const contentType = request.headers.get("content-type") ?? "";
  const redirect = wantsRedirect(contentType);
  const id = requestId();

  try {
    const text = await readLimitedBody(request);
    const body = parseBody(text, contentType);
    const result = receiveInquiry(body, { client: clientAddress(request.headers), source: allowed });
    if (result.kind === "stored") console.log(`[anfragen] ${id} angenommen (#${result.id}${result.status === "SPAM" ? ", Spam" : ""})`);
    else console.log(`[anfragen] ${id} ${result.kind === "duplicate" ? "doppelt" : "verworfen"}`);
    // Roboter und Doppelte bekommen dieselbe Antwort wie alle - nichts verraet, was erkannt wurde.
    if (redirect) return redirectTo(allowed, "danke");
    return json({ ok: true }, 201, allowed);
  } catch (error) {
    if (redirect) return redirectTo(allowed, "fehler");
    if (error instanceof RateLimitError) {
      return json({ error: error.message }, 429, allowed, { "retry-after": String(Math.ceil(error.retryAfterMs / 1000)) });
    }
    if (error instanceof InquiryFieldError) return json({ error: error.message, field: error.field }, 422, allowed);
    if (error instanceof PayloadError) return json({ error: error.message }, error.status, allowed);
    // Interne Fehler nie nach aussen geben - nur die Kennung, um sie im Protokoll zu finden.
    console.error(`[anfragen] ${id}`, error instanceof Error ? error.message : error);
    return json({ error: "Die Anfrage konnte gerade nicht gespeichert werden. Bitte versuchen Sie es später erneut.", ref: id }, 503, allowed);
  }
}
