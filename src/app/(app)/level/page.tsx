import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLevelDashboard } from "@/lib/level-queries";
import { LEVEL_TITLES, XP_RULES, xpForLevel } from "@/lib/levels";
import { sqlDateTime } from "@/lib/format";
import { Achievements } from "@/components/levels/Achievements";
import { LevelBadge, LevelCard } from "@/components/levels/LevelCard";
import { Avatar, EmptyState, PageHeader, Pill, SectionHeader, StatTile } from "@/components/ui";
import { IconBolt, IconCheck, IconDoor, IconTarget } from "@/components/icons";

export const dynamic = "force-dynamic";

const number = (value: number) => value.toLocaleString("de-DE");

export default async function LevelPage() {
  const user = await requireUser();
  const dashboard = getLevelDashboard(user.team_id, user.id);
  const { progress, goals, achievements, history, leaderboard } = dashboard;
  const me = leaderboard.find((entry) => entry.userId === user.id);
  const completedGoals = goals.filter((goal) => goal.completed).length;
  const top = leaderboard.slice(0, 10);
  const ownOutsideTop = me && !top.some((entry) => entry.userId === user.id) ? me : null;
  const nextTitle = LEVEL_TITLES.find((title) => title.level > progress.level);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Dein Level"
        subtitle="Jede erfasste Tür bringt dich weiter."
        action={<Link href="/tour" className="btn btn-primary"><IconDoor className="h-4 w-4" />Klinken starten</Link>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><LevelCard progress={progress} /></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <StatTile label="Heute gesammelt" value={`+${number(dashboard.todayXp)} XP`} hint="Seit 00:00 Uhr · Berlin" tone="success" />
          <StatTile label="Dein Teamplatz" value={me ? `${me.rank}.` : "–"} hint={me ? `von ${number(leaderboard.length)} · Gesamt-XP` : "Noch keine Wertung"} tone="brand" />
        </div>
      </div>

      <nav className="my-5 flex flex-wrap gap-2" aria-label="Level-Bereiche">
        <a href="#tagesziele" className="map-filter">Tagesziele</a>
        <a href="#abzeichen" className="map-filter">Abzeichen</a>
        <a href="#rangliste" className="map-filter">Teamrangliste</a>
        <a href="#xp-regeln" className="map-filter">XP sammeln</a>
      </nav>

      <section id="tagesziele" className="card scroll-mt-5 p-5">
        <SectionHeader title="Deine Tagesziele" action={<Pill tone={completedGoals === goals.length ? "success" : "neutral"}>{completedGoals} / {goals.length} geschafft</Pill>} />
        <div className="grid gap-3 sm:grid-cols-3">
          {goals.map((goal) => (
            <div key={goal.id} className="inset p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className={goal.completed ? "text-ok" : "text-tint"} aria-hidden>
                  {goal.completed ? <IconCheck className="h-5 w-5" /> : <IconTarget className="h-5 w-5" />}
                </span>
                <span className={`text-[11.5px] font-semibold ${goal.completed ? "text-ok" : "muted"}`}>{goal.completed ? "Geschafft" : "Noch offen"}</span>
              </div>
              <h3 className="text-[14px] font-semibold">{goal.title}</h3>
              <p className="mb-2 mt-1 text-[22px] font-bold tabular-nums">{number(goal.current)} <span className="muted text-[13px] font-medium">/ {number(goal.target)}</span></p>
              <Meter label={goal.title} current={goal.current} target={goal.target} completed={goal.completed} />
            </div>
          ))}
        </div>
        <p className="muted mt-3 text-[12px] leading-relaxed">Neue Ziele jeden Tag um 00:00 Uhr in Berlin. Die XP deiner Besuche zählen wie gewohnt; für Tagesziele gibt es keine zusätzlichen XP.</p>
      </section>

      <section className="card mt-4 p-5">
        <SectionHeader title="Dein Weg nach oben" />
        <p className="muted mb-4 text-[13px]">
          {nextTitle ? <>Noch {number(xpForLevel(nextTitle.level) - progress.totalXp)} XP bis zum Titel <strong className="font-semibold text-[var(--ink)]">{nextTitle.title}</strong>.</> : "Du hast den höchsten Titel erreicht. Dein Level wächst mit jeder weiteren Tour."}
        </p>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {LEVEL_TITLES.map((title, index) => {
            const reached = progress.level >= title.level;
            const current = reached && (!LEVEL_TITLES[index + 1] || progress.level < LEVEL_TITLES[index + 1].level);
            return (
              <li key={title.level} className="rounded-[var(--r-sm)] border p-3" style={{ background: current ? "color-mix(in srgb, var(--tint) 8%, var(--card))" : "var(--card-inset)", borderColor: current ? "var(--tint)" : "transparent" }}>
                <p className={`flex items-center justify-between text-[11px] font-semibold ${reached ? "text-tint" : "muted"}`}>Level {title.level}{reached && <IconCheck className="h-3.5 w-3.5" />}</p>
                <p className="mt-2 break-words text-[13px] font-semibold">{title.title}</p>
                <p className="muted mt-1 text-[11px] tabular-nums">{number(xpForLevel(title.level))} XP</p>
                <p className={`mt-2 text-[10.5px] font-medium ${current ? "text-tint" : "muted"}`}>{current ? "Dein Titel" : reached ? "Erreicht" : "Noch offen"}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <Achievements achievements={achievements} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <section id="rangliste" className="card scroll-mt-5 overflow-hidden">
          <div className="p-5 pb-3">
            <SectionHeader title="Teamrangliste" href="/vergleich" linkLabel="Kennzahlen" />
            <p className="muted text-[12px]">Aktive Teammitglieder nach Gesamt-XP. Die Teamleitung zählt ab dem ersten Besuch mit. Gleiche XP bedeuten denselben Platz.</p>
          </div>
          {leaderboard.length === 0 ? <EmptyState bare title="Noch niemand in der Wertung" text="Mit deinem ersten erfassten Besuch startet auch dein Platz im Team." /> : (
            <ol>
              {top.map((entry) => <TeamRow key={entry.userId} entry={entry} isMe={entry.userId === user.id} />)}
              {ownOutsideTop && <><li className="muted border-t px-5 py-2 text-[12px]" style={{ borderColor: "var(--line)" }}>Dein Platz außerhalb der Top 10</li><TeamRow entry={ownOutsideTop} isMe /></>}
            </ol>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="p-5 pb-2"><SectionHeader title="Zuletzt gesammelt" /><p className="muted text-[12px]">{history.length > 0 ? `Deine letzten ${history.length} erfassten Besuche · Berliner Zeit` : "Deine erfassten Besuche erscheinen hier."}</p></div>
          {history.length === 0 ? (
            <EmptyState bare icon={<IconBolt className="h-6 w-6" />} title="Deine ersten XP warten" text="Erfasse einen Besuch beim Klinken. Auch eine Tür ohne Antwort bringt dir Erfahrung." action={<Link href="/tour" className="btn btn-tinted btn-sm">Erste Tour starten</Link>} />
          ) : (
            <ul className="px-5 pb-3">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 border-b py-3 last:border-0" style={{ borderColor: "var(--line)" }}>
                  <div className="min-w-0"><p className="text-[13px] font-medium">{item.label}</p><p className="muted mt-0.5 text-[11.5px]">{sqlDateTime(item.createdAt)}</p></div>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ok">+{number(item.xp)} XP</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section id="xp-regeln" className="card mt-4 scroll-mt-5 p-5">
        <SectionHeader title="So sammelst du Erfahrung" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {XP_RULES.map((rule) => (
            <div key={rule.outcome} className="inset p-4">
              <p className="text-[24px] font-bold tabular-nums text-tint">+{rule.xp} <span className="text-[13px]">XP</span></p>
              <h3 className="mt-2 text-[13px] font-semibold">{rule.label}</h3>
              <p className="muted mt-1 text-[12px] leading-relaxed">{rule.description}</p>
            </div>
          ))}
        </div>
        <p className="muted mt-4 text-[12px] leading-relaxed">Pro Besuch zählt der XP-Wert seines Ergebnisses. Deine bisherigen Besuche sind bereits berücksichtigt. Wird ein Besuch gelöscht, werden seine XP und die dazugehörigen Fortschritte wieder abgezogen. Gesamt-XP und Level werden nicht täglich zurückgesetzt.</p>
      </section>
    </div>
  );
}

function Meter({ label, current, target, completed }: { label: string; current: number; target: number; completed: boolean }) {
  const value = Math.max(0, Math.min(current, target));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value} aria-valuetext={`${number(value)} von ${number(target)}`} className="h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink) 10%, transparent)" }}>
      <div className="h-full rounded-full" style={{ width: `${target > 0 ? value / target * 100 : 0}%`, background: completed ? "var(--energy-500)" : "var(--brand-500)" }} />
    </div>
  );
}

function TeamRow({ entry, isMe }: { entry: ReturnType<typeof getLevelDashboard>["leaderboard"][number]; isMe: boolean }) {
  return (
    <li style={{ background: isMe ? "color-mix(in srgb, var(--tint) 6%, transparent)" : undefined }}>
      <Link href={`/profil/${entry.userId}`} className="flex items-center gap-2.5 border-t px-4 py-3 hover:bg-[var(--hover)] sm:px-5" style={{ borderColor: "var(--line)" }}>
        <span className="muted w-7 shrink-0 text-center text-[13px] font-semibold tabular-nums">{entry.rank}.</span>
        <Avatar name={entry.name} src={entry.avatar} size={32} />
        <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold">{entry.name}{isMe && <span className="ml-1 text-tint">(Du)</span>}</p><p className="muted mt-0.5 text-[11.5px] tabular-nums">{number(entry.progress.totalXp)} XP</p></div>
        <LevelBadge progress={entry.progress} />
      </Link>
    </li>
  );
}
