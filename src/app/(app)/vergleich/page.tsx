import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { teamTotals, type PersonTotals } from "@/lib/community";
import {
  METRICS,
  bestValue,
  chaseLine,
  firstName,
  formatMetric,
  metricByKey,
  metricValue,
  rank,
  teamAverage,
  type Metric,
  type RankEntry,
} from "@/lib/ranking";
import { Avatar, EmptyState, Note, PageHeader, Pill, SectionHeader } from "@/components/ui";
import { IconCheck, IconTrendDown, IconTrendUp, IconTrophy } from "@/components/icons";
import { RangePicker } from "../auswertung/RangePicker";
import { parseRange, previousRange, rangeToSince, type RangeKey } from "../auswertung/ranges";
import { OpponentPicker } from "./OpponentPicker";

export const dynamic = "force-dynamic";

const RANGE_TITLE: Record<RangeKey, string> = {
  "1": "Heute",
  "7": "Letzte 7 Tage",
  "30": "Letzte 30 Tage",
  all: "Gesamter Zeitraum",
};

const COMPARED_TO: Record<RangeKey, string> = {
  "1": "ggü. gestern",
  "7": "ggü. Vorwoche",
  "30": "ggü. Vormonat",
  all: "",
};

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Wo stehe ich im Team? Rangliste je Kennzahl, der eigene Platz mit dem
 * Abstand zum naechsten, der Vergleich mit Team-Schnitt und Bestwert - und
 * ein Direktvergleich mit einer Kollegin oder einem Kollegen.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; kennzahl?: string; mit?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const key = parseRange(params.range, "7");
  const metric = metricByKey(params.kennzahl);

  const totals = teamTotals(user.team_id, { since: rangeToSince(key) });
  const board = rank(metric, totals);
  const ranked = board.filter((e) => e.rank !== null);

  // Plaetze im Zeitraum davor - fuer "zwei Plaetze gutgemacht".
  const previous = previousRange(key);
  const previousRank = new Map(
    previous
      ? rank(metric, teamTotals(user.team_id, previous)).map((e) => [e.user_id, e.rank])
      : [],
  );
  const delta = (entry: RankEntry): number | null => {
    const before = previousRank.get(entry.user_id);
    if (entry.rank === null || before === null || before === undefined) return null;
    return before - entry.rank;
  };

  const me = board.find((e) => e.user_id === user.id) ?? null;
  const best = bestValue(board);
  const average = teamAverage(metric, totals);

  // Direktvergleich: gewaehlt oder - naheliegend - wer direkt vor mir steht.
  const others = board.filter((e) => e.user_id !== user.id);
  const chosen = others.find((e) => String(e.user_id) === params.mit);
  const ahead = me?.rank ? [...ranked].reverse().find((e) => e.rank! < me.rank!) : undefined;
  const opponent = chosen ?? ahead ?? ranked.find((e) => e.user_id !== user.id) ?? others[0];

  const keep = { kennzahl: metric.key, ...(params.mit ? { mit: params.mit } : {}) };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Vergleich"
        subtitle={`${RANGE_TITLE[key]} · ${metric.label}`}
        action={<RangePicker current={key} keep={keep} />}
      />

      {/* Kennzahl - als Leiste, die sich auf dem Handy seitlich schieben laesst */}
      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" aria-label="Kennzahl">
        {METRICS.map((m) => (
          <Link
            key={m.key}
            href={`/vergleich?${new URLSearchParams({ ...keep, range: key, kennzahl: m.key })}`}
            className={`map-filter ${m.key === metric.key ? "is-active" : ""}`}
            aria-current={m.key === metric.key ? "page" : undefined}
            scroll={false}
          >
            {m.label}
          </Link>
        ))}
      </nav>

      {board.length === 0 ? (
        <EmptyState
          icon={<IconTrophy className="h-7 w-7" />}
          title="Noch niemand in der Wertung"
          text="Sobald das Team Türen erfasst, steht hier, wer wo steht."
        />
      ) : (
        <>
          {me ? (
            <MyPlace
              me={me}
              of={ranked.length}
              metric={metric}
              line={chaseLine(metric, board, user.id)}
              delta={delta(me)}
              comparedTo={COMPARED_TO[key]}
              avatar={user.avatar}
            />
          ) : (
            <div className="mb-4">
              <Note>
                Du warst im Zeitraum nicht selbst an Türen – deshalb stehst du nicht in der Wertung.
              </Note>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-5">
            {/* ----------------------------- Rangliste ----------------------------- */}
            <section className="lg:col-span-3">
              {best !== null && best > 0 && ranked.length >= 2 && (
                <Podium entries={ranked.slice(0, 3)} metric={metric} meId={user.id} />
              )}
              <div className="list" style={{ overflow: "visible" }}>
                {board.map((entry) => (
                  <RankRow
                    key={entry.user_id}
                    entry={entry}
                    metric={metric}
                    best={best}
                    isMe={entry.user_id === user.id}
                    delta={delta(entry)}
                  />
                ))}
              </div>
              <p className="muted mt-2 px-1 text-[12px] leading-snug">
                {metric.rate
                  ? `Eine Quote zählt ab ${metric.rate.min} ${metric.rate.basis}. Team-Schnitt: ${formatMetric(metric, average)}.`
                  : `Team-Schnitt: ${average === null ? "–" : average.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${metric.many}.`}
                {" "}Die Teamleitung zählt mit, sobald sie selbst an Türen war.
              </p>
            </section>

            <div className="space-y-4 lg:col-span-2">
              {/* ------------------------- Du im Vergleich ------------------------- */}
              {me && <MeVersusTeam me={me} totals={totals} />}

              {/* --------------------------- Direktvergleich ------------------------ */}
              {me && opponent && (
                <HeadToHead
                  me={me}
                  meAvatar={user.avatar}
                  other={opponent}
                  options={others.map((o) => ({ id: o.user_id, name: o.user_name }))}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function MyPlace({
  me,
  of,
  metric,
  line,
  delta,
  comparedTo,
  avatar,
}: {
  me: RankEntry;
  of: number;
  metric: Metric;
  line: string | null;
  delta: number | null;
  comparedTo: string;
  avatar: string;
}) {
  return (
    <section className="card mb-4 overflow-hidden">
      <div
        className="flex items-center gap-4 p-5 text-white"
        style={{ background: "linear-gradient(135deg, var(--brand-900), var(--brand-600))" }}
      >
        <Avatar name={me.user_name} src={avatar} size={56} tone="light" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-white/70">Dein Platz</p>
          <p className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
            {me.rank !== null ? (
              <>
                {me.rank}.
                <span className="ml-1.5 text-[15px] font-semibold text-white/65">von {of}</span>
              </>
            ) : (
              "–"
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[28px] font-bold leading-none tabular-nums">{formatMetric(metric, me.value)}</p>
          <p className="mt-1 text-[12px] text-white/70">{metric.label}</p>
          {delta !== null && delta !== 0 && comparedTo && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11.5px] font-semibold">
              {delta > 0 ? <IconTrendUp className="h-3 w-3" /> : <IconTrendDown className="h-3 w-3" />}
              {Math.abs(delta)} {Math.abs(delta) === 1 ? "Platz" : "Plätze"} {comparedTo}
            </p>
          )}
        </div>
      </div>
      <p className="px-5 py-3.5 text-[14px] font-medium leading-snug">
        {me.rank === null && metric.rate
          ? `Für eine ${metric.label} fehlen noch ${metric.rate.basis} – sie zählt ab ${metric.rate.min}.`
          : line}
      </p>
    </section>
  );
}

function Podium({ entries, metric, meId }: { entries: RankEntry[]; metric: Metric; meId: number }) {
  // Klassisch angeordnet: Zweiter links, Erster in der Mitte, Dritter rechts.
  const order = [entries[1], entries[0], entries[2]].filter(Boolean);
  const height: Record<number, string> = { 1: "h-20", 2: "h-14", 3: "h-10" };
  return (
    <div className="card mb-3 grid grid-cols-3 items-end gap-2 px-3 pb-0 pt-4">
      {order.map((entry) => (
        <Link key={entry.user_id} href={`/profil/${entry.user_id}`} className="flex min-w-0 flex-col items-center">
          <Avatar name={entry.user_name} src={entry.avatar} size={entry.rank === 1 ? 56 : 46} />
          <p className="mt-1.5 w-full truncate text-center text-[13px] font-semibold">
            {entry.user_id === meId ? "Du" : firstName(entry.user_name)}
          </p>
          <p className="text-[15px] font-bold tabular-nums">{formatMetric(metric, entry.value)}</p>
          <div
            className={`mt-1.5 grid w-full place-items-center rounded-t-[var(--r-sm)] text-[22px] ${height[entry.rank ?? 3] ?? "h-10"}`}
            style={{ background: "var(--card-inset)" }}
            aria-label={`Platz ${entry.rank}`}
          >
            {MEDAL[(entry.rank ?? 3) - 1] ?? entry.rank}
          </div>
        </Link>
      ))}
    </div>
  );
}

function RankRow({
  entry,
  metric,
  best,
  isMe,
  delta,
}: {
  entry: RankEntry;
  metric: Metric;
  best: number | null;
  isMe: boolean;
  delta: number | null;
}) {
  const share = entry.value !== null && best ? Math.max(entry.value > 0 ? 3 : 0, (entry.value / best) * 100) : 0;
  return (
    <Link
      href={`/profil/${entry.user_id}`}
      className="list-row"
      style={isMe ? { background: "color-mix(in srgb, var(--brand-500) 9%, transparent)" } : undefined}
    >
      <span className="w-7 shrink-0 text-center text-[15px] font-bold tabular-nums">
        {entry.rank === null ? (
          <span className="muted">–</span>
        ) : entry.rank <= 3 && best ? (
          <span aria-label={`Platz ${entry.rank}`}>{MEDAL[entry.rank - 1]}</span>
        ) : (
          entry.rank
        )}
      </span>
      <Avatar name={entry.user_name} src={entry.avatar} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-semibold">{entry.user_name}</span>
          {isMe && <Pill tone="brand">Du</Pill>}
        </span>
        <span
          className="mt-1 block h-1.5 overflow-hidden rounded-full"
          style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}
          title={`${entry.user_name}: ${formatMetric(metric, entry.value)} ${metric.label}`}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${share}%`,
              background: metric.key === "sales" ? "var(--chart-sales)" : "var(--chart-doors)",
            }}
          />
        </span>
        <span className="muted mt-1 block truncate text-[12px] tabular-nums">
          {entry.rank === null && metric.rate
            ? `zu wenig ${metric.rate.basis} (${entry[metric.rate.den]} von ${metric.rate.min})`
            : `${entry.doors} Türen · ${entry.met} Gespräche · ${entry.sales} Abschl.`}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[18px] font-bold tabular-nums">{formatMetric(metric, entry.value)}</span>
        {delta !== null && delta !== 0 && (
          <span
            className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold"
            style={{ color: delta > 0 ? "var(--ok-ink)" : "var(--danger-ink)" }}
            title={delta > 0 ? `${delta} Plätze gewonnen` : `${-delta} Plätze verloren`}
          >
            {delta > 0 ? <IconTrendUp className="h-3 w-3" /> : <IconTrendDown className="h-3 w-3" />}
            {Math.abs(delta)}
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * Jede Kennzahl als Balken: der eigene Wert als Flaeche, der Team-Schnitt als
 * Strich darueber. Eine Farbe plus Markierung - lesbar auch ohne Farbsehen.
 */
function MeVersusTeam({ me, totals }: { me: RankEntry; totals: PersonTotals[] }) {
  return (
    <section className="card p-5">
      <SectionHeader title="Du im Vergleich" />
      <p className="muted -mt-1.5 mb-3 flex items-center gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ background: "var(--chart-doors)" }} aria-hidden />
          Du
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-[3px] rounded-full" style={{ background: "var(--ink)" }} aria-hidden />
          Team-Schnitt
        </span>
      </p>
      <ul className="space-y-3.5">
        {METRICS.map((m) => {
          const mine = metricValue(m, me);
          const avg = teamAverage(m, totals);
          const place = rank(m, totals);
          const top = bestValue(place);
          const myPlace = place.find((e) => e.user_id === me.user_id)?.rank ?? null;
          const scale = Math.max(top ?? 0, mine ?? 0, avg ?? 0) || 1;
          return (
            <li key={m.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate">
                  {m.label}
                  {myPlace !== null && (
                    <span className="muted ml-1.5 text-[12px]">
                      {myPlace === 1 ? "🥇 Platz 1" : `Platz ${myPlace}`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatMetric(m, mine)}</span>
                  <span className="muted text-[12px]"> · Ø {formatAverage(m, avg)} · Top {formatMetric(m, top)}</span>
                </span>
              </div>
              <div
                className="relative h-2 rounded-full"
                style={{ background: "color-mix(in srgb, var(--ink) 8%, transparent)" }}
                title={`Du: ${formatMetric(m, mine)} · Team-Schnitt: ${formatAverage(m, avg)} · Bestwert: ${formatMetric(m, top)}`}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${mine ? Math.max(3, (mine / scale) * 100) : 0}%`,
                    background: "var(--chart-doors)",
                  }}
                />
                {avg !== null && (
                  <span
                    className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full"
                    style={{
                      left: `${(avg / scale) * 100}%`,
                      background: "var(--ink)",
                      boxShadow: "0 0 0 2px var(--card)",
                    }}
                    aria-hidden
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatAverage(metric: Metric, value: number | null): string {
  if (value === null) return "–";
  if (metric.rate) return `${Math.round(value)} %`;
  return value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/** Zwei Personen nebeneinander, Kennzahl fuer Kennzahl - wer vorn liegt, steht fett. */
function HeadToHead({
  me,
  meAvatar,
  other,
  options,
}: {
  me: RankEntry;
  meAvatar: string;
  other: RankEntry;
  options: Array<{ id: number; name: string }>;
}) {
  let mine = 0;
  let theirs = 0;
  const rows = METRICS.map((m) => {
    const a = metricValue(m, me);
    const b = metricValue(m, other);
    const lead = a === null || b === null || a === b ? 0 : a > b ? 1 : -1;
    if (lead > 0) mine += 1;
    if (lead < 0) theirs += 1;
    return { metric: m, a, b, lead };
  });
  const name = firstName(other.user_name);
  const verdict =
    mine === theirs
      ? `Unentschieden ${mine} : ${theirs}`
      : mine > theirs
        ? `Du liegst ${mine} : ${theirs} vorn`
        : `${name} liegt ${theirs} : ${mine} vorn`;

  return (
    <section className="card p-5">
      <SectionHeader
        title="Direktvergleich"
        action={<OpponentPicker options={options} current={other.user_id} />}
      />
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={me.user_name} src={meAvatar} size={32} />
          <span className="truncate text-[13.5px] font-semibold">Du</span>
        </span>
        <span className="muted text-[12px] font-semibold">vs.</span>
        <Link href={`/profil/${other.user_id}`} className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-[13.5px] font-semibold">{name}</span>
          <Avatar name={other.user_name} src={other.avatar} size={32} />
        </Link>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.metric.key}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t py-2 text-[14px] tabular-nums"
            style={{ borderColor: "var(--line)" }}
          >
            <Value value={formatMetric(row.metric, row.a)} lead={row.lead > 0} />
            <span className="muted text-center text-[12px]">{row.metric.label}</span>
            <Value value={formatMetric(row.metric, row.b)} lead={row.lead < 0} right />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[13.5px] font-semibold">{verdict}</p>
    </section>
  );
}

function Value({ value, lead, right = false }: { value: string; lead: boolean; right?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 ${right ? "justify-end" : ""} ${lead ? "font-bold" : "muted"}`}
      style={lead ? { color: "var(--ok-ink)" } : undefined}
    >
      {lead && !right && <IconCheck className="h-3.5 w-3.5" />}
      {value}
      {lead && right && <IconCheck className="h-3.5 w-3.5" />}
    </span>
  );
}
