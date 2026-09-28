import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listMembers,
  listVisits,
  memberStats,
  reasonStats,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars, fillDays } from "@/components/charts";
import {
  Avatar,
  EmptyState,
  OutcomeIcon,
  PageHeader,
  SectionHeader,
  StatTile,
  percent,
} from "@/components/ui";
import { ShowMore } from "@/components/ShowMore";
import { IconChart } from "@/components/icons";
import { sqlDateTime } from "@/lib/format";
import { RangePicker } from "./RangePicker";
import { RANGES, rangeToSince, type RangeKey } from "./ranges";

export const dynamic = "force-dynamic";

const RANGE_TITLE: Record<RangeKey, string> = {
  "1": "Heute",
  "7": "Letzte 7 Tage",
  "30": "Letzte 30 Tage",
  all: "Gesamter Zeitraum",
};

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const isLeader = user.role === "LEADER";
  const { range } = await searchParams;
  const key: RangeKey = (RANGES.some((r) => r.key === range) ? range : "7") as RangeKey;
  const since = rangeToSince(key);

  const scope = isLeader ? {} : { userId: user.id };
  const sum = totals(user.team_id, { ...scope, since });
  // "Gesamt" zeigt im Verlauf die letzten 90 Tage, zu Wochen gebuendelt.
  const days = key === "all" ? 90 : Number(key);
  const series = fillDays(dailySeries(user.team_id, days, isLeader ? undefined : user.id), days);
  const reasons = reasonStats(user.team_id, since);
  const members = isLeader
    ? memberStats(user.team_id, since).sort((a, b) => b.sales - a.sales || b.doors - a.doors)
    : [];
  const faces = new Map(isLeader ? listMembers(user.team_id).map((m) => [m.id, m.avatar]) : []);
  const recent = listVisits(user.team_id, { ...scope, since, limit: 40 });

  const doors = sum.doors ?? 0;
  const met = sum.met ?? 0;
  const sales = sum.sales ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isLeader ? "Auswertung" : "Meine Zahlen"}
        subtitle={RANGE_TITLE[key]}
        action={<RangePicker current={key} />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Türen"
          value={doors}
          tone="brand"
          hint={`${sum.not_home ?? 0} nicht angetroffen`}
        />
        <StatTile label="Angetroffen" value={met} hint={`${percent(met, doors)} Antreffquote`} />
        <StatTile
          label="Termine"
          value={sum.appointments ?? 0}
          tone="warn"
          hint={`${percent(sum.appointments ?? 0, met)} der Gespräche`}
        />
        <StatTile
          label="Abschlüsse"
          value={sales}
          tone="success"
          hint={`${percent(sales, met)} der Gespräche`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <SectionHeader title={key === "all" ? "Verlauf · 90 Tage nach Wochen" : "Verlauf"} />
          <DailyBars data={series} height={220} />
        </section>

        <section className="card p-5">
          <SectionHeader title="Ablehnungsgründe" />
          <ReasonBars data={reasons} limit={7} />
        </section>
      </div>

      {isLeader && members.length > 0 && (
        <section className="card mt-4 p-5">
          <SectionHeader title="Nach Mitarbeiter" />
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="data-table min-w-[36rem]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Türen</th>
                  <th className="num">Angetroffen</th>
                  <th className="num">Antreffquote</th>
                  <th className="num">Termine</th>
                  <th className="num">Abschlüsse</th>
                  <th className="num">Abschlussquote</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <Link href={`/profil/${m.user_id}`} className="flex items-center gap-2.5 hover:underline">
                        <Avatar name={m.user_name} src={faces.get(m.user_id)} size={28} />
                        <span className="truncate font-medium">{m.user_name}</span>
                      </Link>
                    </td>
                    <td className="num">{m.doors}</td>
                    <td className="num">{m.met}</td>
                    <td className="num muted">{percent(m.met, m.doors)}</td>
                    <td className="num">{m.appointments}</td>
                    <td
                      className="num font-semibold"
                      style={{ color: m.sales ? "var(--ok-ink)" : undefined }}
                    >
                      {m.sales}
                    </td>
                    <td className="num muted">{percent(m.sales, m.met)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card mt-4 p-5">
        <SectionHeader title="Kontakte" count={recent.length || undefined} className="mb-1" />
        {recent.length === 0 ? (
          <EmptyState
            bare
            icon={<IconChart className="h-5 w-5" />}
            title="Keine Kontakte im Zeitraum"
          />
        ) : (
          <ShowMore initial={10}>
            {recent.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 border-t py-2.5 first:border-t-0"
                style={{ borderColor: "var(--line)" }}
              >
                <OutcomeIcon outcome={v.outcome} />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <span className="block truncate">
                    <span className="font-medium">
                      {v.street_name ?? "–"} {v.house_number}
                    </span>
                    {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
                    {v.energy_type && (
                      <span className="muted"> · {productLabel(v.energy_type)}</span>
                    )}
                    {v.reason_note && <span className="muted"> · „{v.reason_note}“</span>}
                  </span>
                  <span className="muted block truncate text-[12px]">
                    {[isLeader ? v.user_name : null, v.territory_name].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="muted shrink-0 text-[12px] tabular-nums">
                  {sqlDateTime(v.created_at)}
                </span>
              </li>
            ))}
          </ShowMore>
        )}
      </section>
    </div>
  );
}

function productLabel(value: string): string {
  if (value === "BEIDES") return "Strom + Gas";
  if (value === "STROM") return "Strom";
  if (value === "GAS") return "Gas";
  return value;
}
