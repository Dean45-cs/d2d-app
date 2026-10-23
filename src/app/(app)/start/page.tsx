import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser, requireUser } from "@/lib/auth";
import {
  dailySeries,
  listAccessibleTerritories,
  countAppointments,
  listAppointments,
  listMembers,
  listVisits,
  memberStats,
  profileCounts,
  reasonStats,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars, fillDays } from "@/components/charts";
import {
  Avatar,
  Cell,
  EmptyState,
  OutcomeGlyph,
  PageHeader,
  ProgressRing,
  SectionHeader,
  percent,
  plural,
} from "@/components/ui";
import { PendingSales } from "@/components/PendingSales";
import { HeroStats } from "@/components/HeroStats";
import { ProfileRadar, type ProfileSubject } from "@/components/ProfileRadar";
import { ContractEndBlock } from "@/components/ContractEnd";
import { countCustomers, listCustomers } from "@/lib/customers";
import { berlinToday, contractStatus } from "@/lib/contracts";
import { PriceBadge, ProviderSummary } from "@/components/ProviderRating";
import { providerLookup, type ProviderInfo } from "@/lib/energy/provider";
import { readArea } from "@/lib/geo/area";
import { RangePicker } from "@/components/RangePicker";
import { ShowMore } from "@/components/ShowMore";
import { IconCalendar, IconChart, IconMap } from "@/components/icons";
import { normalizeSlot, parseSlot } from "@/lib/appointments";
import { berlinSlot, greeting, sqlDateTime, todayLong } from "@/lib/format";
import { parseRange, previousRange, rangeToSince, type RangeKey } from "@/lib/ranges";
import { addProfiles, EMPTY_PROFILE } from "@/lib/profile";
import { progressShare, territoryProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return { title: user && hasPermission(user, "reports.team") ? "Übersicht" : "Meine Zahlen" };
}

const RANGE_TITLE: Record<RangeKey, string> = {
  "1": "Heute",
  "7": "Letzte 7 Tage",
  "30": "Letzte 30 Tage",
  all: "Gesamt",
};

/** Womit das Profil vergleicht - bei "Gesamt" gibt es nichts davor. */
const PREVIOUS_TITLE: Record<RangeKey, string | null> = {
  "1": "Gestern",
  "7": "7 Tage davor",
  "30": "30 Tage davor",
  all: null,
};

/**
 * Uebersicht: Zahlen des Zeitraums, Verlauf, wer im Team wo steht, offene
 * Termine und Gebiete - die frueheren Seiten "Übersicht" und "Auswertung"
 * in einer. Ohne Teamrecht dieselbe Seite fuer die eigenen Zahlen.
 */
export default async function StartPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const team = hasPermission(user, "reports.team");
  const key = parseRange((await searchParams).range, "7");
  const since = rangeToSince(key);
  const scope = team ? {} : { userId: user.id };

  const sum = totals(user.team_id, { ...scope, since });
  const days = key === "all" ? 90 : key === "30" ? 30 : 14;
  const series = fillDays(dailySeries(user.team_id, days, team ? undefined : user.id), days);
  const reasons = reasonStats(user.team_id, since, team ? undefined : user.id);
  const members = team
    ? memberStats(user.team_id, since).sort((a, b) => b.sales - a.sales || b.doors - a.doors)
    : [];
  const faces = new Map(listMembers(user.team_id).map((m) => [m.id, m.avatar]));
  const appointmentScope = { userId: hasPermission(user, "appointments.team") ? undefined : user.id };
  const appointments = listAppointments(user.team_id, { ...appointmentScope, limit: 5 });
  const openAppointments = countAppointments(user.team_id, appointmentScope).open;
  const territories = team ? listAccessibleTerritories(user) : [];
  const recent = listVisits(user.team_id, { ...scope, since, limit: 40 });
  // Kundenliste: wessen Vertrag bald endet, steht hier, bis jemand umberaten hat.
  const today = berlinToday();
  const customers = hasPermission(user, "customers.manage");
  const dueCustomers = customers ? countCustomers(user.team_id, today).due : 0;
  const recalls = dueCustomers > 0 ? listCustomers(user.team_id, { view: "faellig", today, limit: 3 }) : [];
  // Profil: jede Achse gegen den gleich langen Zeitraum davor - Team gesamt und je Person.
  const before = previousRange(key);
  const profileNow = profileCounts(user.team_id, { userId: team ? undefined : user.id, since });
  const profileBefore = before ? profileCounts(user.team_id, { userId: team ? undefined : user.id, ...before }) : null;
  const profileOf = (id: number) => ({
    now: profileNow.get(id) ?? EMPTY_PROFILE,
    before: profileBefore ? (profileBefore.get(id) ?? EMPTY_PROFILE) : null,
  });
  const profiles: ProfileSubject[] = team
    ? [
        {
          id: 0,
          name: "Team",
          now: addProfiles(profileNow.values()),
          before: profileBefore ? addProfiles(profileBefore.values()) : null,
        },
        ...[...members]
          .sort((a, b) => a.user_name.localeCompare(b.user_name, "de"))
          .map((m) => ({ id: m.user_id, name: m.user_name, ...profileOf(m.user_id) })),
      ]
    : [{ id: user.id, name: user.name, ...profileOf(user.id) }];

  const doors = sum.doors ?? 0;
  const met = sum.met ?? 0;
  const sales = sum.sales ?? 0;
  const unassigned = territories.filter((t) => !t.assigned_user_id).length;
  // Wo der Grundversorger am teuersten ist, lohnt das Klingeln am meisten.
  const providers = team ? providerLookup(user.team_id) : null;
  const providerOf = new Map<number, ProviderInfo | null>(
    territories.map((t) => [
      t.id,
      providers?.find({ postal_code: t.postal_code, city: t.city, area: readArea(t.area_json) }) ?? null,
    ]),
  );
  const activeTerritories = territories
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => leadYear(providerOf.get(b.id)) - leadYear(providerOf.get(a.id)));
  const topPriced = activeTerritories.find((t) => providerOf.get(t.id)) ?? null;

  return (
    <div className="page">
      <PageHeader
        title={team ? `${greeting()}, ${user.name.split(" ")[0]}` : "Meine Zahlen"}
        subtitle={team ? todayLong() : RANGE_TITLE[key]}
      >
        <RangePicker current={key} className="max-w-md" />
      </PageHeader>

      <PendingSales userId={user.id} />

      <HeroStats
        lead={{ label: "Abschlüsse", value: sales, hint: `${percent(sales, met)} Quote` }}
        stats={[
          { label: "Türen", value: doors, hint: `${sum.not_home ?? 0} nicht da` },
          { label: "Gespräche", value: met, hint: `${percent(met, doors)} angetroffen` },
          { label: "Termine", value: sum.appointments ?? 0, hint: `${percent(sum.appointments ?? 0, met)} der Gespräche` },
        ]}
      />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Verlauf und Profil nebeneinander, sobald beide genug Breite haben. */}
        <div className="grid grid-cols-1 gap-8 lg:col-span-2 xl:grid-cols-2">
          <section className="flex flex-col">
            <SectionHeader title="Verlauf" />
            {/* Neben dem hoeheren Profil mittig statt oben mit Loch darunter. */}
            <div className="surface flex-1 p-4 xl:flex xl:flex-col xl:justify-center">
              <DailyBars data={series} height={184} />
            </div>
          </section>
          <ProfileRadar
            subjects={profiles}
            currentLabel={RANGE_TITLE[key]}
            previousLabel={PREVIOUS_TITLE[key]}
            className="flex flex-col"
          />
        </div>

        <div className="space-y-8">
          <section>
            <SectionHeader title="Termine" count={openAppointments} href="/termine" />
            {appointments.length === 0 ? (
              <div className="surface">
                <EmptyState icon={<IconCalendar className="h-5 w-5" />} title="Keine offenen Termine" />
              </div>
            ) : (
              <ul className="list list-icons">
                {appointments.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Cell
                      href={`/termine?termin=${item.id}`}
                      icon={<SlotBadge slot={item.follow_up_at} />}
                      title={item.contact_name || "Ohne Namen"}
                      subtitle={`${item.street_name ?? ""} ${item.house_number}`.trim()}
                      trailing={team ? <Avatar name={item.user_name} src={faces.get(item.user_id)} size={28} /> : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recalls.length > 0 && (
            <section>
              <SectionHeader title="Umberatung fällig" count={dueCustomers} href="/kunden?ansicht=faellig" />
              <ul className="list list-icons">
                {recalls.map((item) => (
                  <li key={item.visit_id}>
                    <Cell
                      href={`/kunden?ansicht=faellig&kunde=${item.visit_id}`}
                      icon={<ContractEndBlock end={item.contract_end} today={today} />}
                      title={item.name || "Ohne Namen"}
                      subtitle={[`${item.street_name ?? ""} ${item.house_number}`.trim(), contractStatus(item.contract_end, today).label]
                        .filter(Boolean)
                        .join(" · ")}
                      trailing={<Avatar name={item.user_name} src={faces.get(item.user_id)} size={28} />}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {team && (
          <section className="lg:col-span-2">
            <SectionHeader title="Team" href="/team/rangliste" linkLabel="Rangliste" />
            {members.length === 0 ? (
              <div className="surface">
                <EmptyState title="Noch niemand im Team" />
              </div>
            ) : (
              <>
                <ul className="list list-icons xl:hidden">
                  {members.map((m) => (
                    <li key={m.user_id}>
                      <Cell
                        href={`/profil/${m.user_id}`}
                        icon={<Avatar name={m.user_name} src={faces.get(m.user_id)} size={32} />}
                        title={m.user_name}
                        subtitle={`${m.doors} Türen · ${m.met} Gespräche · ${m.appointments} Termine`}
                        trailing={
                          <span className={`kpi text-title-3 ${m.sales > 0 ? "text-accent-ink" : "text-muted"}`}>
                            {m.sales}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
                <div className="surface hidden overflow-x-auto xl:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th className="num">Türen</th>
                        <th className="num">Gespräche</th>
                        <th className="num">Termine</th>
                        <th className="num">Abschlüsse</th>
                        <th className="num">Angetroffen</th>
                        <th className="num">Quote</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.user_id}>
                          <td>
                            <Link href={`/profil/${m.user_id}`} className="flex items-center gap-3">
                              <Avatar name={m.user_name} src={faces.get(m.user_id)} size={28} />
                              <span className="truncate font-semibold">{m.user_name}</span>
                            </Link>
                          </td>
                          <td className="num">{m.doors}</td>
                          <td className="num">{m.met}</td>
                          <td className="num">{m.appointments}</td>
                          <td className={`num font-semibold ${m.sales > 0 ? "text-accent-ink" : ""}`}>{m.sales}</td>
                          <td className="num text-muted">{percent(m.met, m.doors)}</td>
                          <td className="num text-muted">{percent(m.sales, m.met)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        <section className={team ? "" : "lg:col-span-1"}>
          <SectionHeader title="Ablehnungsgründe" />
          <ReasonBars data={reasons} limit={6} />
        </section>

        {team && (
          <section className="lg:col-span-2">
            <SectionHeader
              title="Gebiete"
              count={activeTerritories.length}
              href="/gebiete"
              linkLabel={unassigned > 0 ? `${unassigned} ohne Zuteilung` : "Alle"}
            />
            {activeTerritories.length === 0 ? (
              <div className="surface">
                <EmptyState
                  icon={<IconMap className="h-5 w-5" />}
                  title={territories.length === 0 ? "Noch keine Gebiete" : "Alle Gebiete abgeschlossen"}
                  action={
                    <Link href="/gebiete" className="btn btn-primary btn-sm">
                      {territories.length === 0 ? "Gebiet anlegen" : "Zur Karte"}
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="list list-icons">
                {activeTerritories.slice(0, 5).map((t) => {
                  const progress = territoryProgress(t);
                  const share = progressShare(progress);
                  const info = providerOf.get(t.id);
                  const lead = info?.strom ?? info?.gas ?? null;
                  return (
                    <li key={t.id}>
                      <Cell
                        href={`/gebiete/${t.id}`}
                        icon={
                          <ProgressRing value={progress.done} max={Math.max(progress.total, 1)} size={36} stroke={4}>
                            {share !== null ? share : ""}
                          </ProgressRing>
                        }
                        title={t.name}
                        wrap
                        subtitle={[
                          t.assignee_name ?? "Nicht zugeteilt",
                          progress.label,
                          t.sale_count > 0 ? plural(t.sale_count, "Abschluss", "Abschlüsse") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        trailing={lead ? <PriceBadge step={lead.step} size="sm" /> : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {team && topPriced && (
          <section>
            <SectionHeader title="Teuerster Grundversorger" />
            <p className="mb-2 px-1 text-footnote text-muted">{topPriced.name}</p>
            <ProviderSummary
              info={providerOf.get(topPriced.id) ?? null}
              editHref={hasPermission(user, "energy.manage") ? `/karte?gebiet=${topPriced.id}` : undefined}
            />
          </section>
        )}

        <section className={team ? "" : "lg:col-span-2"}>
          {/* Gezaehlt werden alle Tueren im Zeitraum - die Liste zeigt nur die letzten. */}
          <SectionHeader title="Kontakte" count={doors || undefined} />
          {recent.length === 0 ? (
            <div className="surface">
              <EmptyState icon={<IconChart className="h-5 w-5" />} title="Keine Kontakte im Zeitraum" />
            </div>
          ) : (
            <ShowMore initial={6} className="list list-icons">
              {recent.map((v) => (
                <li key={v.id} className="cell">
                  <OutcomeGlyph outcome={v.outcome} reason={v.reason_icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">
                      {v.street_name ?? "–"} {v.house_number}
                    </span>
                    <span className="block truncate text-footnote text-muted">
                      {[
                        team ? v.user_name : null,
                        v.reason_label,
                        v.reason_note ? `„${v.reason_note}“` : null,
                        productLabel(v.energy_type),
                        v.territory_name,
                        sqlDateTime(v.created_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ShowMore>
          )}
        </section>
      </div>
    </div>
  );
}

/** Tag und Uhrzeit eines Termins als kleiner Block links in der Zeile; ueberfaellig rot wie unter Termine. */
function SlotBadge({ slot }: { slot: string }) {
  const date = parseSlot(slot);
  if (!date) return <span className="glyph" />;
  // Termine stehen in Berliner Ortszeit - der Server rechnet in UTC.
  const late = normalizeSlot(slot) < berlinSlot();
  return (
    <span className={`glyph glyph-lg flex-col gap-0 leading-none ${late ? "bg-danger-tint text-danger" : ""}`}>
      <span className={`text-caption-2 ${late ? "" : "text-muted"}`}>
        {date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
      </span>
      <span className={`text-caption font-bold ${late ? "" : "text-ink"}`}>
        {String(date.getHours()).padStart(2, "0")}:{String(date.getMinutes()).padStart(2, "0")}
      </span>
    </span>
  );
}

/** Jahreskosten Strom (sonst Gas) - zum Sortieren; unbekannt landet hinten. */
function leadYear(info: ProviderInfo | null | undefined): number {
  return info?.strom?.year ?? info?.gas?.year ?? -1;
}

function productLabel(value: string): string | null {
  if (value === "BEIDES") return "Strom + Gas";
  if (value === "STROM") return "Strom";
  if (value === "GAS") return "Gas";
  return null;
}
