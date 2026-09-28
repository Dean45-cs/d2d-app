import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dailySeries, totals } from "@/lib/queries";
import { activeDays, bestDay, getProfile, listFeed, teamTotals, type FeedScope } from "@/lib/community";
import { firstName, metricByKey, milestoneProgress, rank, saleStreak } from "@/lib/ranking";
import { monthYear } from "@/lib/format";
import { DailyBars, fillDays } from "@/components/charts";
import { Feed } from "@/components/community/Feed";
import { FollowButton } from "@/components/community/FollowButton";
import { ProfileEditor } from "@/components/community/ProfileEditor";
import { PushToggle } from "@/components/community/PushToggle";
import {
  Avatar,
  GroupLabel,
  Pill,
  ProgressBar,
  SectionHeader,
  StatTile,
  percent,
} from "@/components/ui";
import { IconCalendar, IconTrophy } from "@/components/icons";
import { rangeToSince } from "../../auswertung/ranges";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "beitraege", label: "Beiträge" },
  { key: "abschluesse", label: "Abschlüsse" },
  { key: "gefaellt", label: "Gefällt mir" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Profil im Stil von Twitter: Titelbild, Bild, Name, ein Satz ueber sich,
 * Abonnenten - und dazu, was Twitter nicht hat: die eigenen Zahlen. Wer ein
 * Profil oeffnet, sieht, was die Person leistet. Das soll anspornen.
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

  /* ------------------------------- Zahlen -------------------------------- */
  const all = totals(teamId, { userId: profile.id });
  const month = totals(teamId, { userId: profile.id, since: rangeToSince("30") });
  const week = totals(teamId, { userId: profile.id, since: rangeToSince("7") });
  const sales = all.sales ?? 0;

  const board = rank(metricByKey("sales"), teamTotals(teamId, { since: rangeToSince("30") }));
  const place = board.find((e) => e.user_id === profile.id)?.rank ?? null;
  const rankedCount = board.filter((e) => e.rank !== null).length;
  const hasSalesThisMonth = (month.sales ?? 0) > 0;

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
    <div className="mx-auto max-w-2xl">
      {/* ------------------------------- Kopf -------------------------------- */}
      <section className="card overflow-hidden">
        <div
          className="h-28 md:h-36"
          style={{
            background:
              "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--energy-500) 55%, transparent), transparent 55%), linear-gradient(135deg, var(--brand-900), var(--brand-600))",
          }}
          aria-hidden
        />
        <div className="px-4 pb-4 md:px-5">
          <div className="flex items-start justify-between gap-3">
            {/* Deckender Grund: das Kuerzel-Bild ist durchscheinend und laege sonst auf dem Titelbild. */}
            <div
              className="-mt-12 shrink-0 rounded-full"
              style={{ background: "var(--card)", boxShadow: "0 0 0 4px var(--card)" }}
            >
              <Avatar name={profile.name} src={profile.avatar} size={96} />
            </div>
            <div className="pt-3">
              {isMe ? (
                <ProfileEditor name={profile.name} avatar={profile.avatar} bio={profile.bio} />
              ) : profile.active ? (
                <FollowButton
                  userId={profile.id}
                  name={profile.name}
                  initial={profile.followed_by_me}
                  size="sm"
                  refresh
                />
              ) : null}
            </div>
          </div>

          <h1 className="mt-3 text-[22px] font-bold leading-tight">{profile.name}</h1>
          <p className="muted mt-0.5 flex flex-wrap items-center gap-2 text-[13.5px]">
            {roleLabel}
            {profile.follows_me && <Pill>Hat dich abonniert</Pill>}
            {!profile.active && <Pill tone="danger">Deaktiviert</Pill>}
          </p>

          {profile.bio ? (
            <p className="mt-2.5 break-words text-[15px] leading-snug">{profile.bio}</p>
          ) : (
            isMe && (
              <p className="muted mt-2.5 text-[14px]">
                Noch kein Text über dich – ein Satz unter „Profil bearbeiten“ reicht.
              </p>
            )
          )}

          <p className="muted mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1">
              <IconCalendar className="h-4 w-4" />
              Dabei seit {monthYear(profile.created_at)}
            </span>
            {place !== null && hasSalesThisMonth && (
              <Link href="/vergleich?range=30" className="inline-flex items-center gap-1 hover:underline">
                <IconTrophy className="h-4 w-4" />
                Platz {place} im Team · 30 Tage
              </Link>
            )}
          </p>

          <p className="mt-2.5 flex gap-4 text-[14px]">
            <Link href={`/profil/${profile.id}/abos?liste=abonniert`} className="hover:underline">
              <span className="font-bold tabular-nums">{profile.following_count}</span>{" "}
              <span className="muted">Abonniert</span>
            </Link>
            <Link href={`/profil/${profile.id}/abos?liste=abonnenten`} className="hover:underline">
              <span className="font-bold tabular-nums">{profile.follower_count}</span>{" "}
              <span className="muted">{profile.follower_count === 1 ? "Abonnent" : "Abonnenten"}</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ------------------------------ Leistung ------------------------------ */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Abschlüsse"
          value={sales}
          tone="success"
          hint={`${week.sales ?? 0} in 7 Tagen`}
        />
        <StatTile
          label="Letzte 30 Tage"
          value={month.sales ?? 0}
          tone="brand"
          hint={place !== null && hasSalesThisMonth ? `Platz ${place} von ${rankedCount}` : "Abschlüsse"}
        />
        <StatTile
          label="Abschlussquote"
          value={percent(sales, all.met ?? 0)}
          hint={`aus ${all.met ?? 0} Gesprächen`}
        />
        <StatTile
          label="Antreffquote"
          value={percent(all.met ?? 0, all.doors ?? 0)}
          hint={`${all.doors ?? 0} Türen`}
        />
      </div>

      <section className="card mt-4 p-5">
        <SectionHeader title="Erfolge" href="/vergleich" linkLabel="Vergleich" />
        <div className="grid grid-cols-3 gap-2">
          <Highlight
            icon="🔥"
            value={streak}
            label={streak === 1 ? "Tag mit Abschluss" : "Tage in Folge"}
            hint="mit Abschluss"
          />
          <Highlight
            icon="⭐"
            value={best?.sales ?? 0}
            label="Bester Tag"
            hint={best ? shortDate(best.day) : "noch offen"}
          />
          <Highlight
            icon="📅"
            value={all.appointments ?? 0}
            label="Termine"
            hint="insgesamt"
          />
        </div>

        <div className="mt-5">
          {progress.next !== null ? (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
                <span>
                  Nächstes Abzeichen: <span className="font-semibold">🏅 {progress.next} Abschlüsse</span>
                </span>
                <span className="muted shrink-0 tabular-nums">
                  {sales} / {progress.next}
                </span>
              </div>
              <ProgressBar value={sales - progress.from} max={progress.next - progress.from} tone="success" />
              <p className="muted mt-1.5 text-[12.5px]">
                {isMe ? "Dir fehlen" : `${first} fehlen`} noch {progress.next - sales}{" "}
                {progress.next - sales === 1 ? "Abschluss" : "Abschlüsse"}.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] font-semibold">Alle Abzeichen erreicht – Legende. 🏆</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {progress.reached.length === 0 ? (
              <span className="muted text-[12.5px]">Das erste Abzeichen gibt es für den ersten Vertrag.</span>
            ) : (
              progress.reached.map((milestone) => (
                <Pill key={milestone} tone="warn">
                  🏅 {milestone === 1 ? "Erster Vertrag" : `${milestone} Abschlüsse`}
                </Pill>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card mt-4 p-5">
        <SectionHeader title="Letzte 14 Tage" />
        <DailyBars data={series} height={150} />
      </section>

      {isMe && (
        <section className="mt-6">
          <GroupLabel>Benachrichtigungen</GroupLabel>
          <PushToggle />
        </section>
      )}

      {/* ------------------------------ Beitraege ----------------------------- */}
      <nav className="mt-6 flex border-b" style={{ borderColor: "var(--line)" }} aria-label="Beiträge">
        {TABS.map((t) => {
          const active = t.key === tabKey;
          return (
            <Link
              key={t.key}
              href={t.key === "beitraege" ? `/profil/${profile.id}` : `/profil/${profile.id}?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              scroll={false}
              className={`relative flex-1 py-3 text-center text-[14px] font-semibold transition-colors hover:bg-[var(--hover)] ${
                active ? "" : "muted"
              }`}
            >
              {t.label}
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full"
                  style={{ background: "var(--brand-500)" }}
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <Feed
          key={tabKey}
          initial={posts}
          hasMore={posts.length === 20}
          query={query}
          viewer={{
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            isLeader: user.role === "LEADER",
          }}
          composer={isMe && tabKey === "beitraege"}
          empty={emptyText(tabKey, isMe, first)}
        />
      </div>
    </div>
  );
}

function Highlight({
  icon,
  value,
  label,
  hint,
}: {
  icon: string;
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="inset px-2 py-3 text-center">
      <p className="text-[20px] leading-none" aria-hidden>
        {icon}
      </p>
      <p className="mt-1.5 text-[22px] font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 truncate text-[12px] font-semibold">{label}</p>
      <p className="muted truncate text-[11px]">{hint}</p>
    </div>
  );
}

/** "12.09." aus "2026-09-12". */
function shortDate(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}.`;
}

function emptyText(tab: TabKey, isMe: boolean, first: string): { title: string; text?: string } {
  if (tab === "abschluesse") {
    return {
      title: "Noch kein Abschluss",
      text: isMe ? "Der erste Vertrag erscheint hier – und im Feed für das ganze Team." : undefined,
    };
  }
  if (tab === "gefaellt") {
    return { title: isMe ? "Noch nichts mit Herz markiert" : `${first} hat noch nichts mit Herz markiert` };
  }
  return {
    title: isMe ? "Noch keine Beiträge" : `${first} hat noch nichts gepostet`,
    text: isMe ? "Schreib oben etwas – oder mach einen Vertrag, der erscheint von selbst." : undefined,
  };
}
