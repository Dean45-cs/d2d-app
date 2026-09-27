import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listAppointments,
  listMembers,
  listTerritories,
  memberStats,
  reasonStats,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars, fillDays } from "@/components/charts";
import { parseSlot } from "@/lib/appointments";
import {
  Avatar,
  EmptyState,
  PageHeader,
  ProgressBar,
  SectionHeader,
  StatTile,
  StatusBadge,
  percent,
} from "@/components/ui";
import { PriceBadge, ProviderCard } from "@/components/ProviderRating";
import { providerLookup, type ProviderInfo } from "@/lib/energy/provider";
import { readArea } from "@/lib/geo/area";
import { greeting, todayLong } from "@/lib/format";
import { IconCalendar, IconMap } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const today = new Date().toISOString().slice(0, 10);
  const todayTotals = totals(user.team_id, { since: today });
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const weekTotals = totals(user.team_id, { since: weekAgo });

  const series = fillDays(dailySeries(user.team_id, 14), 14);
  const faces = new Map(listMembers(user.team_id).map((m) => [m.id, m.avatar]));
  const members = memberStats(user.team_id, weekAgo).sort(
    (a, b) => b.sales - a.sales || b.doors - a.doors,
  );
  const reasons = reasonStats(user.team_id, weekAgo);
  const territories = listTerritories(user.team_id);

  // Termine gehoeren ins Dashboard: ein Termin, den niemand mehr sieht,
  // verfaellt - und mit ihm die beste Tuer der Woche.
  const appointments = listAppointments(user.team_id, { limit: 100 });

  // Grundversorger je Gebiet - teuerster zuerst: dort ist das Wechselargument am staerksten.
  const providers = providerLookup(user.team_id);
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
  const unassigned = territories.filter((t) => !t.assigned_user_id).length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        subtitle={todayLong()}
        action={
          <Link href="/tour" className="btn btn-primary hidden md:inline-flex">
            Klinken starten
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Türen heute"
          value={todayTotals.doors ?? 0}
          tone="brand"
          hint={`${weekTotals.doors ?? 0} in 7 Tagen`}
        />
        <StatTile
          label="Angetroffen heute"
          value={todayTotals.met ?? 0}
          hint={`${percent(todayTotals.met ?? 0, todayTotals.doors ?? 0)} Antreffquote`}
        />
        <StatTile
          label="Abschlüsse heute"
          value={todayTotals.sales ?? 0}
          tone="success"
          hint={`${percent(todayTotals.sales ?? 0, todayTotals.met ?? 0)} der Gespräche`}
        />
        <StatTile
          label="Abschlüsse 7 Tage"
          value={weekTotals.sales ?? 0}
          tone="success"
          hint={`${percent(weekTotals.sales ?? 0, weekTotals.met ?? 0)} der Gespräche`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------------------ Verlauf ------------------------------ */}
        <section className="card p-5 lg:col-span-2">
          <SectionHeader title="Letzte 14 Tage" href="/auswertung" linkLabel="Auswertung" />
          <DailyBars data={series} height={250} />
        </section>

        {/* ------------------------------ Termine ------------------------------ */}
        <section className="card flex flex-col p-5">
          <SectionHeader
            title="Offene Termine"
            count={appointments.length}
            href="/termine"
            linkLabel="Alle"
          />
          {appointments.length === 0 ? (
            <EmptyState
              bare
              icon={<IconCalendar className="h-5 w-5" />}
              title="Keine offenen Termine"
            />
          ) : (
            <ul className="-mx-1 space-y-0.5">
              {appointments.slice(0, 6).map((item) => {
                const slot = slotParts(item.follow_up_at);
                return (
                  <li key={item.id} className="flex items-center gap-3 rounded-[var(--r-sm)] px-1 py-1.5">
                    <span
                      className="grid w-12 shrink-0 place-items-center rounded-[var(--r-xs)] py-1 leading-tight"
                      style={{ background: "var(--card-inset)" }}
                    >
                      <span className="muted text-[10.5px] font-semibold">{slot.day}</span>
                      <span className="text-[13px] font-bold tabular-nums">{slot.time}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">
                        {item.contact_name || "Ohne Namen"}
                      </span>
                      <span className="muted block truncate text-[12px]">
                        {item.street_name ?? ""} {item.house_number}
                      </span>
                    </span>
                    <Avatar name={item.user_name} src={faces.get(item.user_id)} size={24} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ------------------------------- Team -------------------------------- */}
        <section className="card p-5 lg:col-span-2">
          <SectionHeader title="Team · 7 Tage" href="/team" linkLabel="Team" />
          {members.length === 0 ? (
            <EmptyState bare title="Noch keine Mitarbeiter" />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="data-table min-w-[26rem]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="num">Türen</th>
                    <th className="num">Angetroffen</th>
                    <th className="num">Abschlüsse</th>
                    <th className="num">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.user_id}>
                      <td>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={m.user_name} src={faces.get(m.user_id)} size={28} />
                          <span className="truncate font-medium">{m.user_name}</span>
                        </span>
                      </td>
                      <td className="num">{m.doors}</td>
                      <td className="num">{m.met}</td>
                      <td className="num font-semibold" style={{ color: m.sales ? "var(--ok-ink)" : undefined }}>
                        {m.sales}
                      </td>
                      <td className="num muted">{percent(m.sales, m.met)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ------------------------- Ablehnungsgruende ------------------------- */}
        <section className="card p-5">
          <SectionHeader title="Ablehnungsgründe · 7 Tage" />
          <ReasonBars data={reasons} limit={6} />
        </section>

        {/* ------------------------------ Gebiete ------------------------------ */}
        <section className="card p-5 lg:col-span-2">
          <SectionHeader
            title="Gebiete"
            count={territories.length}
            href="/gebiete"
            linkLabel="Verwalten"
          />
          {territories.length === 0 ? (
            <EmptyState
              bare
              icon={<IconMap className="h-5 w-5" />}
              title="Noch keine Gebiete"
              action={
                <Link href="/gebiete" className="btn btn-tinted btn-sm">
                  Gebiet anlegen
                </Link>
              }
            />
          ) : (
            <>
              {unassigned > 0 && (
                <p className="mb-2 text-[12.5px] font-medium text-warn">
                  {unassigned === 1 ? "1 Gebiet ist" : `${unassigned} Gebiete sind`} noch niemandem
                  zugeteilt.
                </p>
              )}
              <ul className="-mx-2">
                {[...byPrice, ...territories.filter((t) => t.status === "DONE")]
                  .slice(0, 6)
                  .map((t) => {
                    const info = providerOf.get(t.id);
                    const lead = info?.strom ?? info?.gas ?? null;
                    return (
                      <li key={t.id}>
                        <Link
                          href={`/gebiete/${t.id}`}
                          className="flex items-center gap-3 rounded-[var(--r-sm)] px-2 py-2.5 transition-colors hover:bg-[var(--hover)]"
                        >
                          <Avatar
                            name={t.assignee_name}
                            size={32}
                            tone={t.assignee_name ? "brand" : "muted"}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-[14px] font-medium">{t.name}</span>
                              <StatusBadge status={t.status} />
                            </span>
                            <span className="muted mt-0.5 block truncate text-[12px]">
                              {[t.postal_code, t.city].filter(Boolean).join(" ") || "Ohne Ort"} ·{" "}
                              {t.assignee_name ?? "nicht zugeteilt"}
                            </span>
                            {t.unit_count > 0 && (
                              <span className="mt-1.5 block max-w-48">
                                <ProgressBar
                                  value={t.visit_count}
                                  max={t.unit_count}
                                  size="sm"
                                  tone={t.status === "DONE" ? "success" : "brand"}
                                />
                              </span>
                            )}
                          </span>
                          {lead && (
                            <span className="hidden shrink-0 sm:block">
                              <PriceBadge step={lead.step} size="sm" />
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </section>

        {/* ---------------------------- Grundversorger ------------------------- */}
        <div>
          <ProviderCard
            info={top ? (providerOf.get(top.id) ?? null) : null}
            title={top ? `Größtes Potenzial · ${top.name}` : "Grundversorger"}
            editHref="/einstellungen#grundversorger"
          />
        </div>
      </div>
    </div>
  );
}

/** Jahreskosten Strom (sonst Gas) - zum Sortieren; unbekannt landet hinten. */
function leadYear(info: ProviderInfo | null | undefined): number {
  return info?.strom?.year ?? info?.gas?.year ?? -1;
}

/**
 * "Di 22.09." und "18:00" aus der gespeicherten Ortszeit.
 *
 * Bewusst ohne "heute"/"morgen": auf dem Server ist nicht sicher, welcher Tag
 * beim Team gerade ist - an der Tuer und auf der Terminseite macht das die
 * Uhr des Geraets.
 */
function slotParts(slot: string): { day: string; time: string } {
  const date = parseSlot(slot);
  if (!date) return { day: "", time: slot };
  const weekday = date.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
  const day = date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return { day: `${weekday} ${day}`, time };
}
