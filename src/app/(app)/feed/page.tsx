import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { followSuggestions, listFeed, teamTotals } from "@/lib/community";
import { chaseLine, metricByKey, rank } from "@/lib/ranking";
import { Feed } from "@/components/community/Feed";
import { FollowButton } from "@/components/community/FollowButton";
import { PushToggle } from "@/components/community/PushToggle";
import { Avatar, PageHeader, SectionHeader } from "@/components/ui";
import { IconChevronRight, IconTrophy } from "@/components/icons";
import { rangeToSince } from "../auswertung/ranges";

export const dynamic = "force-dynamic";

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Was im Team passiert: Abschluesse erscheinen von selbst, dazu Beitraege,
 * Kommentare und Herzen. "Abonniert" zeigt nur die Leute, denen man folgt.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const user = await requireUser();
  const { ansicht } = await searchParams;
  const following = ansicht === "abonniert";

  const posts = listFeed(user.team_id, user.id, {
    scope: following ? { kind: "following" } : { kind: "all" },
    limit: 20,
  });

  // Die Woche als kleine Rangliste daneben - der Feed soll anspornen.
  const sales = metricByKey("sales");
  const week = rank(sales, teamTotals(user.team_id, { since: rangeToSince("7") }));
  const top = week.filter((e) => e.rank !== null && e.sales > 0).slice(0, 5);
  const me = week.find((e) => e.user_id === user.id);
  const chase = chaseLine(sales, week, user.id);
  const suggestions = followSuggestions(user.team_id, user.id, 3);

  const viewer = {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    isLeader: user.role === "LEADER",
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <PageHeader
          title="Feed"
          subtitle="Abschlüsse und Neuigkeiten aus dem Team"
          action={
            <nav className="seg" aria-label="Ansicht">
              <Link href="/feed" aria-current={following ? undefined : "page"} scroll={false}>
                Alle
              </Link>
              <Link href="/feed?ansicht=abonniert" aria-current={following ? "page" : undefined} scroll={false}>
                Abonniert
              </Link>
            </nav>
          }
        />

        {/* Auf dem Handy statt der Seitenspalte: der eigene Platz in einer Zeile. */}
        {me?.rank && (
          <Link href="/vergleich" className="card mb-4 flex items-center gap-3 p-3.5 lg:hidden">
            <span className="tile-icon h-9 w-9 shrink-0 text-white" style={{ background: "var(--gas-500)" }}>
              <IconTrophy className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                Platz {me.rank} diese Woche · {me.sales} {me.sales === 1 ? "Abschluss" : "Abschlüsse"}
              </span>
              {chase && <span className="muted block truncate text-[12.5px]">{chase}</span>}
            </span>
            <IconChevronRight className="muted h-4 w-4 shrink-0 opacity-60" />
          </Link>
        )}

        <PushToggle variant="banner" />

        <Feed
          key={following ? "following" : "all"}
          initial={posts}
          hasMore={posts.length === 20}
          query={following ? "scope=following" : ""}
          viewer={viewer}
          composer
          empty={
            following
              ? {
                  title: "Noch niemand abonniert",
                  text: "Abonniere Kollegen über ihr Profil – dann stehen ihre Abschlüsse hier und kommen als Push aufs Handy.",
                }
              : {
                  title: "Noch nichts los",
                  text: "Sobald jemand einen Vertrag macht, steht er hier. Oder schreib den ersten Beitrag.",
                }
          }
        />
      </div>

      {/* ------------------------------ Seitenspalte ------------------------------ */}
      <aside className="hidden space-y-4 lg:block">
        <section className="card p-5">
          <SectionHeader title="Top der Woche" href="/vergleich" linkLabel="Vergleich" />
          {top.length === 0 ? (
            <p className="muted text-[13px]">Diese Woche noch kein Abschluss – der erste Platz ist frei.</p>
          ) : (
            <ol className="space-y-2.5">
              {top.map((entry) => (
                <li key={entry.user_id}>
                  <Link href={`/profil/${entry.user_id}`} className="flex items-center gap-2.5">
                    <span className="w-6 text-center text-[14px] font-bold tabular-nums">
                      {MEDAL[(entry.rank ?? 0) - 1] ?? entry.rank}
                    </span>
                    <Avatar name={entry.user_name} src={entry.avatar} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {entry.user_id === user.id ? "Du" : entry.user_name}
                    </span>
                    <span className="text-[14px] font-bold tabular-nums">{entry.sales}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {chase && <p className="muted mt-3 text-[12.5px] leading-snug">{chase}</p>}
        </section>

        {suggestions.length > 0 && (
          <section className="card p-5">
            <SectionHeader title="Abonnieren?" />
            <ul className="space-y-3">
              {suggestions.map((person) => (
                <li key={person.id} className="flex items-center gap-2.5">
                  <Link href={`/profil/${person.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar name={person.name} src={person.avatar} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{person.name}</span>
                      <span className="muted block truncate text-[12px]">
                        {person.bio || (person.role === "LEADER" ? "Teamleitung" : "Vertrieb")}
                      </span>
                    </span>
                  </Link>
                  <FollowButton userId={person.id} name={person.name} initial={false} size="sm" />
                </li>
              ))}
            </ul>
            <p className="muted mt-3 text-[12px] leading-snug">
              Wen du abonnierst, dessen Verträge kommen als Push-Nachricht aufs Handy.
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
