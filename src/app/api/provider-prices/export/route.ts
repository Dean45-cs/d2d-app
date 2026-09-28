import { NextResponse } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { listManualPrices, monthly } from "@/lib/energy/manual";
import { openPlaces } from "@/lib/energy/places";
import { TABLE_COLUMNS, tableNumber, toCsv } from "@/lib/energy/table";

export const dynamic = "force-dynamic";

/** "2026-01-01" -> "01.01.2026" - so schreibt Excel in Deutschland ein Datum. */
function germanDate(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : value;
}

/**
 * Vorlage und Sicherung in einem: oben die eigenen Gebiete ohne Preis (PLZ,
 * Ort und Namensvorschlag schon eingetragen), darunter alle gepflegten Preise.
 * In Excel oder Google Tabellen ausfuellen und auf der Energiekarte wieder
 * einfuegen.
 */
export async function GET() {
  let teamId: number;
  try {
    teamId = (await requireRole("LEADER")).team_id;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const rows: string[][] = [TABLE_COLUMNS.map((column) => column.label)];
  for (const place of openPlaces(teamId)) {
    rows.push([place.postal_code, place.city, place.provider, "", "", "", "", "", "", ""]);
  }
  for (const price of listManualPrices(teamId)) {
    rows.push([
      price.postal_code,
      price.city,
      price.provider,
      tableNumber(price.strom_ct_kwh),
      tableNumber(monthly(price.strom_base_eur), 2),
      price.gas_provider,
      tableNumber(price.gas_ct_kwh),
      tableNumber(monthly(price.gas_base_eur), 2),
      price.valid_from ? germanDate(price.valid_from) : "",
      price.source_url,
    ]);
  }

  // Mit BOM, damit Excel die Umlaute richtig liest.
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="grundversorger-preise.csv"',
      "cache-control": "no-store",
    },
  });
}
