import { requireUser } from "@/lib/auth";
import {
  dailySeries,
  listVisits,
  memberStats,
  reasonStats,
  totals,
} from "@/lib/queries";
import { DailyBars, ReasonBars } from "@/components/charts";
import { PageHeader, StatTile, percent } from "@/components/ui";
import { RangePicker } from "./RangePicker";
import { RANGES, rangeToSince, type RangeKey } from "./ranges";

export const dynamic = "force-dynamic";

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
  const series = dailySeries(user.team_id, key === "1" ? 1 : Number(key) || 90, isLeader ? undefined : user.id);
  const reasons = reasonStats(user.team_id, since);
  const members = isLeader ? memberStats(user.team_id, since) : [];
  const recent = listVisits(user.team_id, { ...scope, since, limit: 40 });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isLeader ? "Auswertung" : "Meine Zahlen"}
        subtitle="Türen, Antreffquote und Abschlüsse im Zeitraum"
        action={<RangePicker current={key} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label="Türen" value={sum.doors ?? 0} />
        <StatTile
          label="Angetroffen"
          value={sum.met ?? 0}
          tone="brand"
          hint={percent(sum.met ?? 0, sum.doors ?? 0)}
        />
        <StatTile label="Nicht angetroffen" value={sum.not_home ?? 0} />
        <StatTile label="Termine" value={sum.appointments ?? 0} tone="warn" />
        <StatTile
          label="Abschlüsse"
          value={sum.sales ?? 0}
          tone="success"
          hint={`${percent(sum.sales ?? 0, sum.met ?? 0)} auf Kontakt`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex flex-col p-4">
          <h2 className="mb-1 text-sm font-semibold">Verlauf</h2>
          <DailyBars data={series} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Ablehnungsgründe</h2>
          <ReasonBars data={reasons} />
        </section>
      </div>

      {isLeader && members.length > 0 && (
        <section className="card mt-4 overflow-x-auto p-4">
          <h2 className="mb-3 text-sm font-semibold">Nach Mitarbeiter</h2>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="muted text-left text-[11px] uppercase tracking-wider">
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 text-right font-semibold">Türen</th>
                <th className="pb-2 text-right font-semibold">Angetroffen</th>
                <th className="pb-2 text-right font-semibold">Quote</th>
                <th className="pb-2 text-right font-semibold">Termine</th>
                <th className="pb-2 text-right font-semibold">Abschlüsse</th>
                <th className="pb-2 text-right font-semibold">Abschlussquote</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t hairline">
                  <td className="py-2 font-medium">{m.user_name}</td>
                  <td className="py-2 text-right tabular-nums">{m.doors}</td>
                  <td className="py-2 text-right tabular-nums">{m.met}</td>
                  <td className="py-2 text-right tabular-nums">{percent(m.met, m.doors)}</td>
                  <td className="py-2 text-right tabular-nums">{m.appointments}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-energy-600">
                    {m.sales}
                  </td>
                  <td className="py-2 text-right tabular-nums">{percent(m.sales, m.met)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Einzelne Kontakte</h2>
        {recent.length === 0 ? (
          <p className="muted text-sm">Im gewählten Zeitraum wurde nichts erfasst.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((v) => (
              <li key={v.id} className="flex items-start gap-2 text-sm">
                <span className="w-6 shrink-0 text-center">
                  {v.outcome === "SALE"
                    ? "✅"
                    : v.outcome === "APPOINTMENT"
                      ? "📅"
                      : v.outcome === "NOT_HOME"
                        ? "🚪"
                        : (v.reason_emoji || "🙋")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {v.street_name ?? "–"} {v.house_number}
                  </span>
                  {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
                  {v.reason_note && <span className="muted"> · „{v.reason_note}“</span>}
                  {v.energy_type && (
                    <span className="muted"> · {productLabel(v.energy_type)}</span>
                  )}
                  <span className="muted block text-xs">
                    {v.user_name}
                    {v.territory_name ? ` · ${v.territory_name}` : ""} ·{" "}
                    {new Date(`${v.created_at.replace(" ", "T")}Z`).toLocaleString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
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
