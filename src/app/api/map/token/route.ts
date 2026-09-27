import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { mapkitToken } from "@/lib/mapkit-token";

export const dynamic = "force-dynamic";

/**
 * Liefert MapKit JS das Token. Nur fuer angemeldete Nutzer: das Kontingent
 * der Kartenaufrufe gehoert dem Team, nicht dem Rest des Internets.
 */
export async function GET() {
  try {
    await requireUser();
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 401;
    return new NextResponse("Nicht angemeldet", { status });
  }

  let token: string | null = null;
  try {
    token = mapkitToken();
  } catch (error) {
    console.error("[mapkit]", error instanceof Error ? error.message : error);
    return new NextResponse("Apple-Karten-Schlüssel ist fehlerhaft", { status: 500 });
  }
  if (!token) return new NextResponse("Apple Karten ist nicht eingerichtet", { status: 404 });

  return new NextResponse(token, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
