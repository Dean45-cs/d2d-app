import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getLevelDashboard } from "@/lib/level-queries";
import { sqlDateTime } from "@/lib/format";
import { Achievements } from "@/components/levels/Achievements";
import { ActivityRings, LevelBadge, LevelSummary } from "@/components/levels/LevelCard";
import { Avatar, Cell, EmptyState, ListLabel, PageHeader, SegmentedLinks } from "@/components/ui";
import { ShowMore } from "@/components/ShowMore";
import { IconBolt } from "@/components/icons";
import { TEAM_VIEWS } from "../views";
import { LevelInfo } from "./LevelInfo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Erfolge" };

const number = (value: number) => value.toLocaleString("de-DE");

/**
 * Erfolge: heute (Ringe), das Level, die Abzeichen, das Team nach XP.
 * Regeln und Titel stehen im Info-Blatt oben rechts - nicht auf der Seite.
 */
export default async function AchievementsPage() {
  const user = await requireUser();
  const dashboard = getLevelDashboard(user.team_id, user.id);
  const { progress, goals, achievements, history, leaderboard } = dashboard;
  const me = leaderboard.find((entry) => entry.userId === user.id);
  const top = leaderboard.slice(0, 10);
  const ownOutsideTop = me && !top.some((entry) => entry.userId === user.id) ? me : null;
  const done = goals.filter((goal) => goal.completed).length;

  return (
    <div className="page">
      <PageHeader
        title="Erfolge"
        subtitle={me ? `Platz ${me.rank} im Team · ${number(progress.totalXp)} XP` : `${number(progress.totalXp)} XP`}
        actions={<LevelInfo progress={progress} />}
      >
        <SegmentedLinks ariaLabel="Team" current="erfolge" options={TEAM_VIEWS} className="max-w-md" />
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section aria-labelledby="today-heading" className="rounded-xl bg-surface p-4">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 id="today-heading" className="text-headline">
                  Heute
                </h2>
                <span className="kpi text-subhead font-semibold text-accent-ink">+{number(dashboard.todayXp)} XP</span>
              </div>
              <ActivityRings goals={goals} />
              <p className="mt-4 text-footnote text-muted">
                {done === goals.length ? "Alle Tagesziele geschafft" : `${done} von ${goals.length} Zielen`}
              </p>
            </section>
            <LevelSummary progress={progress} label="Dein Level" />
          </div>

          <Achievements achievements={achievements} />
        </div>

        <div className="space-y-8">
          <section>
            <ListLabel>Team nach XP</ListLabel>
            {leaderboard.length === 0 ? (
              <div className="surface">
                <EmptyState title="Noch niemand in der Wertung" />
              </div>
            ) : (
              <ol className="list list-icons">
                {top.map((entry) => (
                  <TeamRow key={entry.userId} entry={entry} isMe={entry.userId === user.id} />
                ))}
                {ownOutsideTop && <TeamRow entry={ownOutsideTop} isMe />}
              </ol>
            )}
          </section>

          <section>
            <ListLabel>Zuletzt gesammelt</ListLabel>
            {history.length === 0 ? (
              <div className="surface">
                <EmptyState
                  icon={<IconBolt className="h-5 w-5" />}
                  title="Noch keine XP"
                  action={
                    <Link href="/tour" className="btn btn-primary btn-sm">
                      Klinken
                    </Link>
                  }
                />
              </div>
            ) : (
              <ShowMore initial={5} className="list">
                {history.map((item) => (
                  <li key={item.id}>
                    <Cell
                      title={item.label}
                      subtitle={sqlDateTime(item.createdAt)}
                      detail={<span className="kpi font-semibold text-accent-ink">+{number(item.xp)} XP</span>}
                    />
                  </li>
                ))}
              </ShowMore>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  entry,
  isMe,
}: {
  entry: ReturnType<typeof getLevelDashboard>["leaderboard"][number];
  isMe: boolean;
}) {
  return (
    <li>
      <Cell
        href={`/profil/${entry.userId}`}
        icon={
          <span className="flex items-center gap-2">
            <span className="kpi w-5 text-right text-subhead font-semibold text-muted">{entry.rank}</span>
            <Avatar name={entry.name} src={entry.avatar} size={32} />
          </span>
        }
        title={isMe ? `${entry.name} (du)` : entry.name}
        subtitle={`${number(entry.progress.totalXp)} XP`}
        trailing={<LevelBadge progress={entry.progress} />}
        className={isMe ? "bg-accent-tint" : ""}
      />
    </li>
  );
}
