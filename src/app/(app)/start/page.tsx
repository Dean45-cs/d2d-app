import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listAppointments,
  listTerritories,
  memberStats,
  orderTotals,
  reasonStats,
  salesWithoutOrder,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars } from "@/components/charts";
import { PageHeader, StatTile, StatusBadge, percent } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const today = new Date().toISOString().slice(0, 10);
  const todayTotals = totals(user.team_id, { since: today });
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const weekTotals = totals(user.team_id, { since: weekAgo });

  const series = dailySeries(user.team_id, 14);
  const members = memberStats(user.team_id, weekAgo);
  const reasons = reasonStats(user.team_id, weekAgo);
  const territories = listTerritories(user.team_id);

  // Nacharbeit: was an Auftraegen und Terminen offen ist, gehoert ins Dashboard -
  // ein Auftrag ohne Bestaetigungsanruf wird sonst schlicht vergessen.
  const orders = orderTotals(user.team_id, { since: weekAgo });
  const missingOrders = salesWithoutOrder(user.team_id, { since: weekAgo });
  const openAppointments = listAppointments(user.team_id, { limit: 100 }).length;

  const open = territories.filter((t) => t.status === "OPEN");
  const unassigned = territories.filter((t) => !t.assigned_user_id);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Hallo ${user.name.split(" ")[0]}`}
        subtitle="Der Stand deines Teams auf einen Blick"
      />

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Türen heute" value={todayTotals.doors ?? 0} />
        <StatTile
          label="Angetroffen heute"
          value={todayTotals.met ?? 0}
          tone="brand"
          hint={`${percent(todayTotals.met ?? 0, todayTotals.doors ?? 0)} Antreffquote`}
        />
        <StatTile
          label="Abschlüsse heute"
          value={todayTotals.sales ?? 0}
          tone="success"
          hint={`${percent(todayTotals.sales ?? 0, todayTotals.met ?? 0)} auf Kontakt`}
        />
        <StatTile
          label="Abschlüsse 7 Tage"
          value={weekTotals.sales ?? 0}
          tone="success"
          hint={`aus ${weekTotals.doors ?? 0} Türen`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-4">
          <h2 className="mb-1 text-sm font-semibold">Letzte 14 Tage</h2>
          <DailyBars data={series} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">
            Warum abgelehnt wurde (7 Tage)
          </h2>
          <ReasonBars data={reasons} />
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Team (7 Tage)</h2>
            <Link href="/auswertung" className="text-xs font-semibold text-brand-600">
              Alle Zahlen →
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="muted text-sm">Noch keine Mitarbeiter angelegt.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="muted text-left text-[11px] uppercase tracking-wider">
                  <th className="pb-2 font-semibold">Name</th>
                  <th className="pb-2 text-right font-semibold">Türen</th>
                  <th className="pb-2 text-right font-semibold">Angetr.</th>
                  <th className="pb-2 text-right font-semibold">Abschl.</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-t hairline">
                    <td className="py-2 font-medium">{m.user_name}</td>
                    <td className="py-2 text-right tabular-nums">{m.doors}</td>
                    <td className="py-2 text-right tabular-nums">{m.met}</td>
                    <td className="py-2 text-right font-semibold tabular-nums text-energy-600">
                      {m.sales}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Nacharbeit (7 Tage)</h2>
            <Link href="/auftraege" className="text-xs font-semibold text-brand-600">
              Aufträge →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {/* Ohne Zusatzzeile: auf 360 px stehen hier drei Kacheln nebeneinander. */}
            <StatTile label="Wartet auf Anruf" value={orders.waiting_call ?? 0} tone="warn" />
            <StatTile label="Bestätigt" value={orders.confirmed ?? 0} tone="success" />
            <StatTile label="Offene Termine" value={openAppointments} tone="brand" />
          </div>
          {missingOrders > 0 && (
            <p className="mt-3 text-xs font-medium" style={{ color: "var(--gas-600)" }}>
              {missingOrders === 1
                ? "1 Abschluss ohne Auftragsdaten"
                : `${missingOrders} Abschlüsse ohne Auftragsdaten`}{" "}
              – ohne Kundendaten und Unterschrift wird daraus kein Vertrag.
            </p>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Gebiete</h2>
            <Link href="/gebiete" className="text-xs font-semibold text-brand-600">
              Verwalten →
            </Link>
          </div>
          {territories.length === 0 ? (
            <p className="muted text-sm">
              Noch keine Gebiete angelegt. Lege das erste Gebiet an und teile es zu.
            </p>
          ) : (
            <>
              <p className="muted mb-3 text-xs">
                {territories.length} Gebiete · {open.length} offen ·{" "}
                {unassigned.length} ohne Zuteilung
              </p>
              <ul className="space-y-1.5">
                {territories.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/gebiete/${t.id}`}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-brand-500/8"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="muted shrink-0 text-xs">
                        {t.assignee_name ?? "frei"}
                      </span>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
