import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProfile, listConnections } from "@/lib/community";
import { firstName } from "@/lib/ranking";
import { FollowButton } from "@/components/community/FollowButton";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Wen jemand abonniert hat - und wer ihn oder sie abonniert hat. */
export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ liste?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { liste } = await searchParams;
  const profile = getProfile(Number(id), user.team_id, user.id);
  if (!profile) notFound();

  const followers = liste === "abonnenten";
  const people = listConnections(profile.id, user.id, followers ? "followers" : "following");
  const isMe = profile.id === user.id;
  const first = firstName(profile.name);
  const base = `/profil/${profile.id}/abos`;

  return (
    <div className="page-narrow">
      <PageHeader
        title={followers ? "Abonnenten" : "Abonniert"}
        subtitle={profile.name}
        back={{ href: `/profil/${profile.id}`, label: first }}
      >
        <nav className="chips" aria-label="Liste">
          <Link
            href={`${base}?liste=abonniert`}
            className="chip"
            aria-current={followers ? undefined : "page"}
            scroll={false}
          >
            Abonniert · {profile.following_count}
          </Link>
          <Link
            href={`${base}?liste=abonnenten`}
            className="chip"
            aria-current={followers ? "page" : undefined}
            scroll={false}
          >
            Abonnenten · {profile.follower_count}
          </Link>
        </nav>
      </PageHeader>

      {people.length === 0 ? (
        <EmptyState
          boxed
          icon={<IconUsers className="h-5 w-5" />}
          title={
            followers
              ? isMe
                ? "Dich hat noch niemand abonniert"
                : `${first} hat noch niemand abonniert`
              : isMe
                ? "Du hast noch niemanden abonniert"
                : `${first} hat noch niemanden abonniert`
          }
          text={isMe && !followers ? "Im Profil einer Person auf „Abonnieren“ tippen." : undefined}
          action={
            isMe && !followers ? (
              <Link href="/team/rangliste" className="btn btn-primary btn-sm">
                Zur Rangliste
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="list list-icons">
          {people.map((person) => (
            <li key={person.id} className="cell">
              <Link href={`/profil/${person.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                <Avatar name={person.name} src={person.avatar} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-body">
                    {person.name}
                    {person.id === user.id && <span className="text-muted"> (du)</span>}
                  </span>
                  <span className="block truncate text-footnote text-muted">
                    {person.bio || (person.role === "LEADER" ? "Teamleitung" : "Vertrieb")}
                  </span>
                </span>
              </Link>
              {person.id !== user.id && (
                <FollowButton
                  userId={person.id}
                  name={person.name}
                  initial={person.followed_by_me}
                  size="sm"
                  refresh
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
