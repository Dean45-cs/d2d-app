import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { dailySeries, totals } from "@/lib/queries";
import { activeDays, bestDay, getProfile, listFeed, teamTotals, type FeedScope } from "@/lib/community";
import { firstName, metricByKey, milestoneProgress, rank, saleStreak } from "@/lib/ranking";
import { rangeToSince } from "@/lib/ranges";
import { monthYear } from "@/lib/format";
import { getLevelProgress } from "@/lib/level-queries";
import { DailyBars, fillDays } from "@/components/charts";
import { Feed } from "@/components/community/Feed";
import { FollowButton } from "@/components/community/FollowButton";
import { ProfileEditor } from "@/components/community/ProfileEditor";
import { LevelBadge, LevelSummary } from "@/components/levels/LevelCard";
import { Avatar, PageHeader, Pill, ProgressBar, SectionHeader, StatGrid, percent } from "@/components/ui";
import { IconCalendar, IconTrophy } from "@/components/icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  const profile = user ? getProfile(Number((await params).id), user.team_id, user.id) : null;
  return { title: profile?.name ?? "Profil" };
}

const TABS = [
  { key: "beitraege", label: "Beiträge" },
  { key: "abschluesse", label: "Abschlüsse" },
  { key: "gefaellt", label: "Gefällt mir" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Profil einer Person: wer sie ist (Bild, ein Satz, Abonnenten) und was sie
 * leistet - Zahlen, Level, Meilensteine, die letzten zwei Wochen. Daneben (auf
 * dem Handy darunter) ihre Beitraege. Wer ein Profil oeffnet, soll sehen,
 * was moeglich ist.
 */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const profile = getProfile(Number(id), user.team_id, user.id);
  if (!profile) notFound();

  const isMe = profile.id === user.id;
  const first = firstName(profile.name);
  const teamId = user.team_id;
  const level = getLevelProgress(teamId, profile.id);

  /* ------------------------------- Zahlen -------------------------------- */
  const all = totals(teamId, { userId: profile.id });
  const month = totals(teamId, { userId: profile.id, since: rangeToSince("30") });
  const week = totals(teamId, { userId: profile.id, since: rangeToSince("7") });
  const sales = all.sales ?? 0;
  const met = all.met ?? 0;
  const doors = all.doors ?? 0;

  const board = rank(metricByKey("sales"), teamTotals(teamId, { since: rangeToSince("30") }));
  const place = board.find((e) => e.user_id === profile.id)?.rank ?? null;
  const rankedCount = board.filter((e) => e.rank !== null).length;
  const showPlace = place !== null && (month.sales ?? 0) > 0;

  const today = new Date().toISOString().slice(0, 10);
  const streak = saleStreak(activeDays(profile.id), today);
  const best = bestDay(profile.id);
  const progress = milestoneProgress(sales);
  const series = fillDays(dailySeries(teamId, 14, profile.id), 14);

  /* ------------------------------ Beitraege ------------------------------ */
  const tabKey: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : "beitraege";
  const scope: FeedScope =
    tabKey === "abschluesse"
      ? { kind: "sales", userId: profile.id }
      : tabKey === "gefaellt"
        ? { kind: "liked", userId: profile.id }
        : { kind: "user", userId: profile.id };
  const posts = listFeed(teamId, user.id, { scope, limit: 20 });
  const query = new URLSearchParams({ scope: scope.kind, user: String(profile.id) }).toString();

  const roleLabel = profile.role === "LEADER" ? "Teamleitung" : "Vertrieb";

  return (
    <div className="page">
      <PageHeader
        title={profile.name}
        back={isMe ? { href: "/profil", label: "Profil" } : { href: "/team", label: "Team" }}
        hideLargeTitle
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-8">
          {/* ------------------------------ Person ------------------------------ */}
          <section className="flex flex-col items-center surface px-4 py-6 text-center">
            <Avatar name={profile.name} src={profile.avatar} size={88} />
            <p className="mt-3 max-w-full break-words text-title-1">{profile.name}</p>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-subhead text-muted">
              {roleLabel}
              <LevelBadge progress={level} />
              {profile.follows_me && <Pill>Hat dich abonniert</Pill>}
              {!profile.active && <Pill tone="danger">Deaktiviert</Pill>}
            </p>
            {profile.bio && <p className="mt-3 max-w-full break-words text-body">{profile.bio}</p>}
            <p className="mt-3 inline-flex items-center gap-1 text-footnote text-muted">
              <IconCalendar className="h-4 w-4" />
              Dabei seit {monthYear(profile.created_at)}
            </p>
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 text-subhead">
              <Link
                href={`/profil/${profile.id}/abos?liste=abonniert`}
                className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 hover:underline"
              >
                <span className="kpi font-semibold">{profile.following_count}</span>
                <span className="text-muted">Abonniert</span>
              </Link>
              <span className="text-muted" aria-hidden="true">
                ·
              </span>
              <Link
                href={`/profil/${profile.id}/abos?liste=abonnenten`}
                className="inline-flex min-h-11 items-center gap-1 rounded-sm px-1 hover:underline"
              >
                <span className="kpi font-semibold">{profile.follower_count}</span>
                <span className="text-muted">{profile.follower_count === 1 ? "Abonnent" : "Abonnenten"}</span>
              </Link>
            </p>
            {isMe ? (
              <div className="mt-2">
                <ProfileEditor name={profile.name} avatar={profile.avatar} bio={profile.bio} />
              </div>
            ) : profile.active ? (
              <div className="mt-2">
                <FollowButton userId={profile.id} name={profile.name} initial={profile.followed_by_me} refresh />
              </div>
            ) : null}
          </section>

          {/* ----------------------------- Leistung ----------------------------- */}
          <section>
            <SectionHeader title="Leistung" href="/team/rangliste?range=30" linkLabel="Rangliste" />
            <div className="space-y-4">
              <StatGrid
                columns={2}
                items={[
                  {
                    label: "Abschlüsse",
                    value: sales,
                    accent: sales > 0,
                    hint: `${week.sales ?? 0} in 7 Tagen`,
                  },
                  {
                    label: "30 Tage",
                    value: month.sales ?? 0,
                    hint: showPlace ? `Platz ${place} von ${rankedCount}` : "Abschlüsse",
                  },
                  { label: "Abschlussquote", value: percent(sales, met), hint: `aus ${met} Gesprächen` },
                  { label: "Antreffquote", value: percent(met, doors), hint: `${doors} Türen` },
                ]}
              />

              <LevelSummary
                progress={level}
                href={isMe ? "/team/erfolge" : undefined}
                label={isMe ? "Dein Level" : `Level von ${first}`}
              />

              <StatGrid
                columns={3}
                items={[
                  { label: "Serie", value: streak, hint: streak === 1 ? "Tag in Folge" : "Tage in Folge" },
                  { label: "Bester Tag", value: best?.sales ?? 0, hint: best ? shortDate(best.day) : "noch offen" },
                  { label: "Termine", value: all.appointments ?? 0, hint: "insgesamt" },
                ]}
              />

              <div className="surface p-4">
                <div className="flex items-center gap-3">
                  <span className="glyph">
                    <IconTrophy className="h-4 w-4" />
                  </span>
                  {progress.next !== null ? (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-footnote font-semibold text-ink-2">Nächster Meilenstein</span>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-headline">{milestoneLabel(progress.next)}</span>
                        <span className="kpi shrink-0 text-subhead text-muted">
                          {sales} / {progress.next}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 text-headline">Alle Meilensteine erreicht</span>
                  )}
                </div>
                {progress.next !== null && (
                  <ProgressBar
                    className="mt-3"
                    value={sales - progress.from}
                    max={progress.next - progress.from}
                    label={`${sales} von ${progress.next} Abschlüssen bis zum nächsten Meilenstein`}
                  />
                )}
                {progress.reached.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2" aria-label="Erreichte Meilensteine">
                    {progress.reached.map((milestone) => (
                      <li key={milestone}>
                        <Pill tone="accent">{milestoneLabel(milestone)}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <SectionHeader title="Letzte 14 Tage" />
            <div className="surface p-4">
              <DailyBars data={series} height={150} />
            </div>
          </section>
        </div>

        {/* ------------------------------ Beitraege ----------------------------- */}
        <section className="min-w-0" aria-labelledby="posts-heading">
          <h2 id="posts-heading" className="sr-only">
            Beiträge
          </h2>
          <nav className="chips mb-4" aria-label="Beiträge filtern">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={t.key === "beitraege" ? `/profil/${profile.id}` : `/profil/${profile.id}?tab=${t.key}`}
                className="chip"
                aria-current={t.key === tabKey ? "page" : undefined}
                scroll={false}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <Feed
            key={`${profile.id}-${tabKey}`}
            initial={posts}
            hasMore={posts.length === 20}
            query={query}
            viewer={{
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              isLeader: hasPermission(user, "community.moderate"),
            }}
            composer={isMe && tabKey === "beitraege"}
            empty={emptyText(tabKey, isMe, first)}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * "Erster Abschluss" bzw. "25 Abschlüsse". Meilensteine, nicht Abzeichen: die
 * Abzeichen mit Medaillen stehen unter Erfolge - zwei Dinge, zwei Namen.
 */
function milestoneLabel(milestone: number): string {
  return milestone === 1 ? "Erster Abschluss" : `${milestone} Abschlüsse`;
}

/** "12.09." aus "2026-09-12". */
function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}.`;
}

function emptyText(tab: TabKey, isMe: boolean, first: string): { title: string } {
  if (tab === "abschluesse") return { title: "Noch kein Abschluss" };
  if (tab === "gefaellt") {
    return { title: isMe ? "Noch nichts mit Herz markiert" : `${first} hat noch nichts mit Herz markiert` };
  }
  return { title: isMe ? "Noch keine Beiträge" : `${first} hat noch nichts gepostet` };
}
