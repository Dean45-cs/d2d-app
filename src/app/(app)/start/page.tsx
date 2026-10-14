import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listAccessibleTerritories,
  listAppointments,
  listMembers,
  listVisits,
  memberStats,
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
  StatGrid,
  percent,
  plural,
} from "@/components/ui";
import { PendingSales } from "@/components/PendingSales";
import { RangePicker } from "@/components/RangePicker";
import { ShowMore } from "@/components/ShowMore";
import { IconCalendar, IconChart, IconMap } from "@/components/icons";
import { parseSlot } from "@/lib/appointments";
import { greeting, sqlDateTime, todayLong } from "@/lib/format";
import { parseRange, rangeToSince, type RangeKey } from "@/lib/ranges";
import { territoryProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

const RANGE_TITLE: Record<RangeKey, string> = {
  "1": "Heute",
  "7": "Letzte 7 Tage",
  "30": "Letzte 30 Tage",
  all: "Gesamt",
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
  const appointments = listAppointments(user.team_id, {
    userId: hasPermission(user, "appointments.team") ? undefined : user.id,
    limit: 100,
  });
  const territories = team ? listAccessibleTerritories(user) : [];
  const recent = listVisits(user.team_id, { ...scope, since, limit: 40 });

  const doors = sum.doors ?? 0;
  const met = sum.met ?? 0;
  const sales = sum.sales ?? 0;
  const unassigned = territories.filter((t) => !t.assigned_user_id).length;
  const activeTerritories = territories.filter((t) => t.status !== "DONE");

  return (
    <div className="page">
      <PageHeader
        title={team ? `${greeting()}, ${user.name.split(" ")[0]}` : "Meine Zahlen"}
        subtitle={team ? todayLong() : RANGE_TITLE[key]}
      >
        <RangePicker current={key} className="max-w-md" />
      </PageHeader>

      <PendingSales userId={user.id} />

      <StatGrid
        size="lg"
        items={[
          { label: "Türen", value: doors, hint: `${sum.not_home ?? 0} nicht da` },
          { label: "Gespräche", value: met, hint: `${percent(met, doors)} angetroffen` },
          { label: "Termine", value: sum.appointments ?? 0, hint: `${percent(sum.appointments ?? 0, met)} der Gespräche` },
          { label: "Abschlüsse", value: sales, accent: sales > 0, hint: `${percent(sales, met)} Quote` },
        ]}
      />

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionHeader title="Verlauf" />
          <div className="surface p-4">
            <DailyBars data={series} height={184} />
          </div>
        </section>

        <section>
          <SectionHeader title="Termine" count={appointments.length} href="/termine" />
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

        {team && (
          <section className="lg:col-span-2">
            <SectionHeader title="Team" href="/team/rangliste" linkLabel="Rangliste" />
            {members.length === 0 ? (
              <div className="surface">
                <EmptyState title="Noch niemand im Team" />
              </div>
            ) : (
              <>
                <ul className="list list-icons md:hidden">
                  {members.map((m) => (
                    <li key={m.user_id}>
                      <Cell
                        href={`/profil/${m.user_id}`}
                        icon={<Avatar name={m.user_name} src={faces.get(m.user_id)} size={32} />}
                        title={m.user_name}
                        subtitle={`${m.doors} Türen · ${m.met} Gespräche · ${percent(m.sales, m.met)}`}
                        trailing={
                          <span className={`kpi text-title-3 ${m.sales > 0 ? "text-accent-ink" : "text-muted"}`}>
                            {m.sales}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
                <div className="surface hidden overflow-hidden md:block">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th className="num">Türen</th>
                        <th className="num">Gespräche</th>
                        <th className="num">Termine</th>
                        <th className="num">Abschlüsse</th>
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
                  title="Noch keine Gebiete"
                  action={
                    <Link href="/gebiete" className="btn btn-primary btn-sm">
                      Gebiet anlegen
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="list list-icons">
                {activeTerritories.slice(0, 5).map((t) => (
                  <li key={t.id}>
                    <Cell
                      href={`/gebiete/${t.id}`}
                      icon={
                        <ProgressRing value={territoryProgress(t).done} max={Math.max(territoryProgress(t).total, 1)} size={32} stroke={4} />
                      }
                      title={t.name}
                      subtitle={[
                        t.assignee_name ?? "Nicht zugeteilt",
                        territoryProgress(t).label,
                      ].join(" · ")}
                      detail={t.sale_count > 0 ? plural(t.sale_count, "Abschluss", "Abschlüsse") : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className={team ? "" : "lg:col-span-2"}>
          <SectionHeader title="Kontakte" count={recent.length || undefined} />
          {recent.length === 0 ? (
            <div className="surface">
              <EmptyState icon={<IconChart className="h-5 w-5" />} title="Keine Kontakte im Zeitraum" />
            </div>
          ) : (
            <ShowMore initial={6} className="list list-icons">
              {recent.map((v) => (
                <li key={v.id} className="cell">
                  <OutcomeGlyph outcome={v.outcome} emoji={v.reason_emoji} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">
                      {v.street_name ?? "–"} {v.house_number}
                    </span>
                    <span className="block truncate text-footnote text-muted">
                      {[team ? v.user_name : null, v.reason_label, productLabel(v.energy_type), sqlDateTime(v.created_at)]
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

/** Tag und Uhrzeit eines Termins als kleiner Block links in der Zeile. */
function SlotBadge({ slot }: { slot: string }) {
  const date = parseSlot(slot);
  if (!date) return <span className="glyph" />;
  return (
    <span className="glyph glyph-lg flex-col gap-0 leading-none">
      <span className="text-caption-2 text-muted">
        {date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
      </span>
      <span className="text-caption font-bold text-ink">
        {String(date.getHours()).padStart(2, "0")}:{String(date.getMinutes()).padStart(2, "0")}
      </span>
    </span>
  );
}

function productLabel(value: string): string | null {
  if (value === "BEIDES") return "Strom + Gas";
  if (value === "STROM") return "Strom";
  if (value === "GAS") return "Gas";
  return null;
}
