import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { exportCustomers } from "@/lib/customers";
import { berlinToday, dayLabel, productLabel } from "@/lib/contracts";
import { sqlDay } from "@/lib/format";
import { toCsv } from "@/lib/energy/table";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "Abschluss",
  "Verkauft von",
  "Straße",
  "Hausnummer",
  "Klingel",
  "PLZ",
  "Ort",
  "Gebiet",
  "Produkt",
  "Kunde",
  "Telefon",
  "Kundennummer",
  "Lieferbeginn",
  "Laufzeit (Monate)",
  "Vertragsende",
  "Umberaten am",
  "Notiz",
];

/**
 * Die Kundenliste als Datei fuer Excel: jeder Abschluss des Teams mit
 * Kunde, Rufnummer und Vertragslaufzeit - auch die noch ohne Kunde.
 */
export async function GET() {
  let teamId: number;
  try {
    teamId = (await requirePermission("customers.manage")).team_id;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const rows: string[][] = [COLUMNS];
  for (const row of exportCustomers(teamId)) {
    rows.push([
      dayLabel(sqlDay(row.sold_at)),
      plain(row.user_name),
      plain(row.street_name ?? ""),
      plain(row.house_number),
      plain(row.doorbell_label ?? ""),
      row.postal_code,
      plain(row.city),
      plain(row.territory_name ?? ""),
      productLabel(row.energy_type),
      plain(row.name),
      // Als Text, sonst macht Excel aus "0171 …" eine Zahl ohne fuehrende Null und aus "+49 …" eine Formel.
      row.phone ? `="${row.phone}"` : "",
      plain(row.customer_number),
      dayLabel(row.contract_start),
      row.contract_months ? String(row.contract_months) : "",
      dayLabel(row.contract_end),
      row.recontacted_at ? dayLabel(sqlDay(row.recontacted_at)) : "",
      plain(row.note),
    ]);
  }

  // Mit BOM, damit Excel die Umlaute richtig liest.
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kundenliste-${berlinToday()}.csv"`,
      "cache-control": "no-store",
    },
  });
}

/** Freitext beginnt nie mit einem Formelzeichen - Excel wuerde ihn sonst ausrechnen. */
function plain(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}
