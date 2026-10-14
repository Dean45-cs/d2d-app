import Link from "next/link";
import { hasPermission, permissionsFor } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { followSuggestions, listFeed, teamTotals } from "@/lib/community";
import { chaseLine, metricByKey, rank } from "@/lib/ranking";
import { rangeToSince } from "@/lib/ranges";
import { Feed } from "@/components/community/Feed";
import { FollowButton } from "@/components/community/FollowButton";
import { PushBanner } from "@/components/community/PushToggle";
import { Avatar, Cell, ListLabel, PageHeader, SegmentedLinks } from "@/components/ui";
import { IconUsers } from "@/components/icons";
import { TEAM_VIEWS } from "./views";

export const dynamic = "force-dynamic";

/**
 * Team: was passiert - Abschluesse erscheinen von selbst, dazu Beitraege,
 * Kommentare und Herzen. Daneben die Woche und Vorschlaege zum Abonnieren.
 */
export default async function TeamPage({
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
  const rights = permissionsFor(user);
  const canManage = rights["team.manage"] || rights["structure.manage"] || rights["team.roles"];

  const viewer = {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    isLeader: hasPermission(user, "community.moderate"),
  };

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle={me?.rank ? `Platz ${me.rank} diese Woche` : undefined}
        actions={
          canManage ? (
            <Link href="/einstellungen/mitglieder" className="icon-btn" aria-label="Mitglieder">
              <IconUsers className="h-5 w-5" />
            </Link>
          ) : undefined
        }
      >
        <SegmentedLinks ariaLabel="Team" current="feed" options={TEAM_VIEWS} className="max-w-md" />
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
        <div className="min-w-0">
          {/* Auf dem Handy statt der Seitenspalte: der eigene Platz in einer Zeile. */}
          {me?.rank && (
            <ul className="list list-icons mb-4 lg:hidden">
              <li>
                <Cell
                  href="/team/rangliste"
                  icon={<span className="glyph glyph-round kpi text-subhead">{me.rank}</span>}
                  title={`${me.sales} ${me.sales === 1 ? "Abschluss" : "Abschlüsse"} diese Woche`}
                  subtitle={chase ?? undefined}
                />
              </li>
            </ul>
          )}

          <PushBanner />

          <div className="chips mb-4" role="group" aria-label="Beiträge">
            <Link href="/team" className="chip" aria-current={following ? undefined : "page"} scroll={false}>
              Alle
            </Link>
            <Link href="/team?ansicht=abonniert" className="chip" aria-current={following ? "page" : undefined} scroll={false}>
              Abonniert
            </Link>
          </div>

          <Feed
            key={following ? "following" : "all"}
            initial={posts}
            hasMore={posts.length === 20}
            query={following ? "scope=following" : ""}
            viewer={viewer}
            composer
            empty={
              following
                ? { title: "Noch niemand abonniert", text: "Im Profil einer Person auf „Abonnieren“ tippen." }
                : { title: "Noch nichts los" }
            }
          />
        </div>

        <aside className="hidden space-y-8 lg:block">
          <section>
            <ListLabel>Diese Woche</ListLabel>
            {top.length === 0 ? (
              <p className="list rounded-xl px-4 py-4 text-subhead text-muted">Noch kein Abschluss</p>
            ) : (
              <ol className="list list-icons">
                {top.map((entry) => (
                  <li key={entry.user_id}>
                    <Cell
                      href={`/profil/${entry.user_id}`}
                      icon={
                        <span className="flex items-center gap-2">
                          <span className="kpi w-4 text-right text-subhead font-semibold text-muted">{entry.rank}</span>
                          <Avatar name={entry.user_name} src={entry.avatar} size={28} />
                        </span>
                      }
                      title={entry.user_id === user.id ? "Du" : entry.user_name}
                      detail={<span className="kpi font-semibold text-ink">{entry.sales}</span>}
                    />
                  </li>
                ))}
              </ol>
            )}
            {chase && <p className="list-footer">{chase}</p>}
          </section>

          {suggestions.length > 0 && (
            <section>
              <ListLabel>Abonnieren</ListLabel>
              <ul className="list list-icons">
                {suggestions.map((person) => (
                  <li key={person.id} className="cell">
                    <Link href={`/profil/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={person.name} src={person.avatar} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-body">{person.name}</span>
                        <span className="block truncate text-footnote text-muted">
                          {person.bio || (person.role === "LEADER" ? "Teamleitung" : "Vertrieb")}
                        </span>
                      </span>
                    </Link>
                    <FollowButton userId={person.id} name={person.name} initial={false} size="sm" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
