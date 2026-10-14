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
import { Avatar, EmptyState, ListLabel, Notice, PageHeader, SegmentedLinks } from "@/components/ui";
import { IconCheck, IconTrendDown, IconTrendUp, IconTrophy } from "@/components/icons";
import { RangePicker } from "@/components/RangePicker";
import { parseRange, previousRange, rangeToSince, type RangeKey } from "@/lib/ranges";
import { OpponentPicker } from "./OpponentPicker";
import { TEAM_VIEWS } from "../views";

export const dynamic = "force-dynamic";

const RANGE_TITLE: Record<RangeKey, string> = {
  "1": "Heute",
  "7": "Letzte 7 Tage",
  "30": "Letzte 30 Tage",
  all: "Gesamt",
};

const COMPARED_TO: Record<RangeKey, string> = {
  "1": "ggü. gestern",
  "7": "ggü. Vorwoche",
  "30": "ggü. Vormonat",
  all: "",
};

/**
 * Wo stehe ich im Team? Der eigene Platz gross oben, darunter die Liste je
 * Kennzahl; daneben (auf dem Handy darunter) der Vergleich mit dem Team-
 * Schnitt und ein Direktvergleich mit einer Person.
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
    <div className="page">
      <PageHeader title="Rangliste" subtitle={`${RANGE_TITLE[key]} · ${metric.label}`}>
        <SegmentedLinks ariaLabel="Team" current="rangliste" options={TEAM_VIEWS} className="max-w-md" />
      </PageHeader>

      <RangePicker current={key} keep={keep} className="mb-3 max-w-md" />
      <nav className="chips mb-6" aria-label="Kennzahl">
        {METRICS.map((m) => (
          <Link
            key={m.key}
            href={`/team/rangliste?${new URLSearchParams({ ...keep, range: key, kennzahl: m.key })}`}
            className="chip"
            aria-current={m.key === metric.key ? "page" : undefined}
            scroll={false}
          >
            {m.label}
          </Link>
        ))}
      </nav>

      {board.length === 0 ? (
        <EmptyState boxed icon={<IconTrophy className="h-6 w-6" />} title="Noch niemand in der Wertung" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
          <div>
            {me ? (
              <MyPlace
                me={me}
                of={ranked.length}
                metric={metric}
                line={chaseLine(metric, board, user.id)}
                delta={delta(me)}
                comparedTo={COMPARED_TO[key]}
              />
            ) : (
              <div className="mb-6">
                <Notice>Im Zeitraum nicht selbst an Türen – deshalb nicht in der Wertung.</Notice>
              </div>
            )}

            <ol className="list list-icons">
              {board.map((entry) => (
                <RankRow
                  key={entry.user_id}
                  entry={entry}
                  metric={metric}
                  isMe={entry.user_id === user.id}
                  delta={delta(entry)}
                />
              ))}
            </ol>
            <p className="list-footer">
              {metric.rate
                ? `Quote ab ${metric.rate.min} ${metric.rate.basis} · Ø ${formatMetric(metric, average)}`
                : `Ø ${average === null ? "–" : average.toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${metric.many}`}
            </p>
          </div>

          <div className="space-y-8">
            {me && <MeVersusTeam me={me} totals={totals} />}
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
}: {
  me: RankEntry;
  of: number;
  metric: Metric;
  line: string | null;
  delta: number | null;
  comparedTo: string;
}) {
  return (
    <section className="mb-6 rounded-xl bg-surface p-4" aria-label="Dein Platz">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-footnote font-semibold text-ink-2">Dein Platz</p>
          <p className="kpi text-large-title">
            {me.rank !== null ? `${me.rank}.` : "–"}
            <span className="ml-2 text-subhead font-semibold text-muted">von {of}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-footnote font-semibold text-ink-2">{metric.label}</p>
          <p className={`kpi text-large-title ${metric.key === "sales" && (me.value ?? 0) > 0 ? "text-accent-ink" : ""}`}>
            {formatMetric(metric, me.value)}
          </p>
        </div>
      </div>
      {delta !== null && delta !== 0 && comparedTo && (
        <p className="mt-2 inline-flex items-center gap-1 text-footnote font-semibold text-ink-2">
          {delta > 0 ? <IconTrendUp className="h-4 w-4" /> : <IconTrendDown className="h-4 w-4" />}
          {delta > 0 ? "+" : "−"}
          {Math.abs(delta)} {Math.abs(delta) === 1 ? "Platz" : "Plätze"} {comparedTo}
        </p>
      )}
      {(line || (me.rank === null && metric.rate)) && (
        <p className="mt-3 border-t border-separator pt-3 text-subhead">
          {me.rank === null && metric.rate ? `Zählt ab ${metric.rate.min} ${metric.rate.basis}` : line}
        </p>
      )}
    </section>
  );
}

function RankRow({
  entry,
  metric,
  isMe,
  delta,
}: {
  entry: RankEntry;
  metric: Metric;
  isMe: boolean;
  delta: number | null;
}) {
  return (
    <li>
      <Link href={`/profil/${entry.user_id}`} className={`cell cell-tap ${isMe ? "bg-accent-tint" : ""}`}>
        <span className="flex shrink-0 items-center gap-2">
          <span className="kpi w-5 text-right text-subhead font-semibold text-muted">{entry.rank ?? "–"}</span>
          <Avatar name={entry.user_name} src={entry.avatar} size={32} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body">{isMe ? `${entry.user_name} (du)` : entry.user_name}</span>
          <span className="kpi block truncate text-footnote text-muted">
            {entry.rank === null && metric.rate
              ? `${entry[metric.rate.den]} von ${metric.rate.min} ${metric.rate.basis}`
              : `${entry.doors} Türen · ${entry.met} Gespräche · ${entry.sales} Abschl.`}
          </span>
        </span>
        {delta !== null && delta !== 0 && (
          <span
            className="flex shrink-0 items-center text-caption font-semibold text-muted"
            aria-label={delta > 0 ? `${delta} Plätze gewonnen` : `${-delta} Plätze verloren`}
          >
            {delta > 0 ? <IconTrendUp className="h-3.5 w-3.5" /> : <IconTrendDown className="h-3.5 w-3.5" />}
            {Math.abs(delta)}
          </span>
        )}
        <span className={`kpi shrink-0 text-title-3 ${metric.key === "sales" && (entry.value ?? 0) > 0 ? "text-accent-ink" : ""}`}>
          {formatMetric(metric, entry.value)}
        </span>
      </Link>
    </li>
  );
}

/**
 * Jede Kennzahl als Balken: der eigene Wert als Flaeche, der Team-Schnitt als
 * Strich darueber. Eine Farbe plus Markierung - lesbar auch ohne Farbsehen.
 */
function MeVersusTeam({ me, totals }: { me: RankEntry; totals: PersonTotals[] }) {
  return (
    <section>
      <ListLabel>Du und das Team</ListLabel>
      <div className="rounded-xl bg-surface p-4">
        <p className="mb-4 flex items-center gap-4 text-footnote text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-[var(--chart-doors)]" aria-hidden="true" />
            Du
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-0.75 rounded-full bg-ink" aria-hidden="true" />
            Team-Schnitt
          </span>
        </p>
        <ul className="space-y-4">
          {METRICS.map((m) => {
            const mine = metricValue(m, me);
            const avg = teamAverage(m, totals);
            const place = rank(m, totals);
            const top = bestValue(place);
            const myPlace = place.find((e) => e.user_id === me.user_id)?.rank ?? null;
            const scale = Math.max(top ?? 0, mine ?? 0, avg ?? 0) || 1;
            return (
              <li key={m.key}>
                <div className="mb-2 flex items-baseline justify-between gap-2 text-subhead">
                  <span className="min-w-0 truncate">
                    {m.label}
                    {myPlace !== null && <span className="ml-2 text-footnote text-muted">Platz {myPlace}</span>}
                  </span>
                  <span className="kpi shrink-0 font-semibold">{formatMetric(m, mine)}</span>
                </div>
                <div
                  className="relative h-2 rounded-full bg-fill-strong"
                  title={`Du: ${formatMetric(m, mine)} · Ø ${formatAverage(m, avg)} · Top ${formatMetric(m, top)}`}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-doors)]"
                    style={{ width: `${mine ? Math.max(3, (mine / scale) * 100) : 0}%` }}
                  />
                  {avg !== null && (
                    <span
                      className="absolute -top-1 h-4 w-0.75 -translate-x-1/2 rounded-full bg-ink ring-2 ring-[var(--surface)]"
                      style={{ left: `${(avg / scale) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="kpi mt-1 text-caption text-muted">
                  Ø {formatAverage(m, avg)} · Top {formatMetric(m, top)}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
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
    <section>
      <div className="mb-2 flex items-end justify-between gap-2">
        <ListLabel>Direktvergleich</ListLabel>
        <OpponentPicker options={options} current={other.user_id} />
      </div>
      <div className="rounded-xl bg-surface p-4">
        <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={me.user_name} src={meAvatar} size={32} />
            <span className="truncate text-headline">Du</span>
          </span>
          <span className="text-footnote font-semibold text-muted">vs.</span>
          <Link href={`/profil/${other.user_id}`} className="flex min-w-0 items-center justify-end gap-2">
            <span className="truncate text-headline">{name}</span>
            <Avatar name={other.user_name} src={other.avatar} size={32} />
          </Link>
        </div>
        <ul>
          {rows.map((row) => (
            <li
              key={row.metric.key}
              className="kpi grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-separator py-2 text-body"
            >
              <Value value={formatMetric(row.metric, row.a)} lead={row.lead > 0} />
              <span className="text-center text-footnote text-muted">{row.metric.label}</span>
              <Value value={formatMetric(row.metric, row.b)} lead={row.lead < 0} right />
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-separator pt-3 text-center text-headline">{verdict}</p>
      </div>
    </section>
  );
}

function Value({ value, lead, right = false }: { value: string; lead: boolean; right?: boolean }) {
  return (
    <span className={`flex items-center gap-1 ${right ? "justify-end" : ""} ${lead ? "font-bold text-ink" : "text-muted"}`}>
      {lead && !right && <IconCheck className="h-4 w-4 text-accent-ink" />}
      {value}
      {lead && right && <IconCheck className="h-4 w-4 text-accent-ink" />}
    </span>
  );
}
