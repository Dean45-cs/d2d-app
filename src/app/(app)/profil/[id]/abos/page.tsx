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

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={profile.name}
        back={{ href: `/profil/${profile.id}`, label: "Profil" }}
        action={
          <nav className="seg" aria-label="Liste">
            <Link
              href={`/profil/${profile.id}/abos?liste=abonniert`}
              aria-current={followers ? undefined : "page"}
              scroll={false}
            >
              Abonniert · {profile.following_count}
            </Link>
            <Link
              href={`/profil/${profile.id}/abos?liste=abonnenten`}
              aria-current={followers ? "page" : undefined}
              scroll={false}
            >
              Abonnenten · {profile.follower_count}
            </Link>
          </nav>
        }
      />

      {people.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-7 w-7" />}
          title={
            followers
              ? isMe
                ? "Dich hat noch niemand abonniert"
                : `${first} hat noch niemand abonniert`
              : isMe
                ? "Du hast noch niemanden abonniert"
                : `${first} hat noch niemanden abonniert`
          }
          text={
            isMe && !followers
              ? "Auf dem Profil eines Kollegen „Abonnieren“ tippen – dann kommt jeder Vertrag als Push."
              : undefined
          }
          action={
            isMe && !followers ? (
              <Link href="/vergleich" className="btn btn-primary">
                Zur Rangliste
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="list">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/profil/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={person.name} src={person.avatar} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">{person.name}</span>
                  <span className="muted block truncate text-[13px]">
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
