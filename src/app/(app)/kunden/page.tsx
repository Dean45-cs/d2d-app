import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { listMembers } from "@/lib/queries";
import { countCustomers, listCustomers, type CustomerCounts, type CustomerView } from "@/lib/customers";
import { berlinToday } from "@/lib/contracts";
import { CustomerList } from "./CustomerList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kunden" };

/** So viele Abschluesse zeigt eine Ansicht - die Suche grenzt "Alle" weiter ein. */
const LIMIT = 300;

/**
 * Ohne Wahl die Ansicht, in der gerade etwas zu tun ist: erst die faelligen
 * Anrufe, dann die Abschluesse ohne Kunde.
 */
function pickView(value: string | undefined, counts: CustomerCounts): CustomerView {
  if (value === "faellig" || value === "offen" || value === "alle") return value;
  if (counts.due > 0) return "faellig";
  if (counts.open > 0) return "offen";
  return "alle";
}

/**
 * Kundenliste: jedem Abschluss den Kunden aus dem Buchungsportal zuordnen
 * und nach Vertragsende wieder anrufen.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, "customers.manage")) redirect("/profil");
  const params = await searchParams;
  const today = berlinToday();
  const counts = countCustomers(user.team_id, today);
  const view = pickView(params.ansicht, counts);
  const query = view === "alle" ? (params.q ?? "").trim().slice(0, 80) : "";
  const faces = Object.fromEntries(listMembers(user.team_id).map((member) => [member.id, member.avatar]));

  return (
    <CustomerList
      rows={listCustomers(user.team_id, { view, today, query, limit: LIMIT })}
      counts={counts}
      view={view}
      query={query}
      today={today}
      faces={faces}
      limit={LIMIT}
    />
  );
}
