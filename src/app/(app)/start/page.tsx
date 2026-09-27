import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listAppointments,
  listTerritories,
  memberStats,
  reasonStats,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars } from "@/components/charts";
import { parseSlot } from "@/lib/appointments";
import { PageHeader, StatTile, StatusBadge, percent } from "@/components/ui";
import { ProviderCard, ProviderLine } from "@/components/ProviderRating";
import { providerLookup, type ProviderInfo } from "@/lib/energy/provider";
import { readArea } from "@/lib/geo/area";

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

  // Termine gehoeren ins Dashboard: ein Termin, den niemand mehr sieht,
  // verfaellt - und mit ihm die beste Tuer der Woche.
  const appointments = listAppointments(user.team_id, { limit: 100 });

  const open = territories.filter((t) => t.status === "OPEN");
  const unassigned = territories.filter((t) => !t.assigned_user_id);

  // Grundversorger je Gebiet - teuerster zuerst: dort ist das Wechselargument am staerksten.
  const providers = providerLookup();
  const providerOf = new Map<number, ProviderInfo | null>(
    territories.map((t) => [
      t.id,
      providers.find({ postal_code: t.postal_code, city: t.city, area: readArea(t.area_json) }),
    ]),
  );
  const active = territories.filter((t) => t.status !== "DONE");
  const byPrice = [...active].sort(
    (a, b) => leadYear(providerOf.get(b.id)) - leadYear(providerOf.get(a.id)),
  );
  const top = byPrice.find((t) => providerOf.get(t.id)) ?? null;

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

      {territories.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-sm font-semibold">Grundversorger in deinen Gebieten</h2>
            <Link href="/karte" className="text-xs font-semibold text-brand-600">
              Energiekarte →
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_1fr]">
            {top ? (
              <ProviderCard
                info={providerOf.get(top.id) ?? null}
                title={`Größtes Potenzial · ${top.name}`}
              />
            ) : (
              <ProviderCard info={null} />
            )}
            <div className="card p-2">
              {providers.size === 0 ? (
                <p className="muted p-2 text-sm">
                  Noch keine Preisdaten geladen – auf der Energiekarte „Jetzt aktualisieren“.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {byPrice.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/gebiete/${t.id}`}
                        className="block rounded-lg px-2 py-2 hover:bg-brand-500/8"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[13px] font-semibold">
                            {t.name}
                          </span>
                          <span className="muted shrink-0 text-[11px]">
                            {[t.postal_code, t.city].filter(Boolean).join(" ")}
                          </span>
                        </span>
                        <ProviderLine info={providerOf.get(t.id) ?? null} className="mt-1" />
                      </Link>
                    </li>
                  ))}
                  {byPrice.length === 0 && (
                    <li className="muted p-2 text-sm">Alle Gebiete sind abgeschlossen.</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

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
            <h2 className="text-sm font-semibold">Offene Termine ({appointments.length})</h2>
            <Link href="/termine" className="text-xs font-semibold text-brand-600">
              Alle Termine →
            </Link>
          </div>
          {appointments.length === 0 ? (
            <p className="muted text-sm">
              Kein offener Termin. Termine entstehen an der Tür über „Termin vereinbart“.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {appointments.slice(0, 6).map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <span className="muted w-28 shrink-0 text-xs tabular-nums">
                    {slotStamp(item.follow_up_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {item.contact_name || "Ohne Namen"}
                    <span className="muted">
                      {" · "}
                      {item.street_name ?? ""} {item.house_number}
                    </span>
                  </span>
                  <span className="muted shrink-0 truncate text-xs">{item.user_name}</span>
                </li>
              ))}
            </ul>
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

/** Jahreskosten Strom (sonst Gas) - zum Sortieren; unbekannt landet hinten. */
function leadYear(info: ProviderInfo | null | undefined): number {
  return info?.strom?.year ?? info?.gas?.year ?? -1;
}

/**
 * "Di, 22.09. · 18:00" aus der gespeicherten Ortszeit.
 *
 * Bewusst ohne "heute"/"morgen": auf dem Server ist nicht sicher, welcher Tag
 * beim Team gerade ist - an der Tuer und auf der Terminseite macht das die
 * Uhr des Geraets.
 */
function slotStamp(slot: string): string {
  const date = parseSlot(slot);
  if (!date) return slot;
  const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
  const day = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
  return `${weekday}, ${day} · ${time}`;
}
