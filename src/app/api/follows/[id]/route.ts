import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { follow, getProfile, requireTeamPerson, unfollow } from "@/lib/community";
import { notifyFollow } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Person abonnieren: ab jetzt kommt jeder ihrer Vertraege als Push aufs Handy. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const person = requireTeamPerson(Number(id), user.team_id);
    const wasFollowing = getProfile(person.id, user.team_id, user.id)?.followed_by_me ?? false;
    follow(user.id, person.id);
    if (!wasFollowing) {
      after(() =>
        notifyFollow(person.id, { id: user.id, name: user.name }).catch((error) =>
          console.warn("[push] Abo:", error),
        ),
      );
    }
    return counts(person.id, user.team_id, user.id);
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const person = requireTeamPerson(Number(id), user.team_id);
    unfollow(user.id, person.id);
    return counts(person.id, user.team_id, user.id);
  });
}

function counts(personId: number, teamId: number, viewerId: number) {
  const profile = getProfile(personId, teamId, viewerId);
  return {
    following: profile?.followed_by_me ?? false,
    follower_count: profile?.follower_count ?? 0,
  };
}
