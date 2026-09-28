import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPost } from "@/lib/community";
import { Feed } from "@/components/community/Feed";
import { EmptyState, PageHeader } from "@/components/ui";
import { IconFeed } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Ein einzelner Beitrag mit allen Kommentaren - hierhin fuehrt ein Tipp auf
 * die Push-Nachricht.
 */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const post = getPost(Number(id), user.team_id, user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={post?.kind === "SALE" ? "Abschluss" : "Beitrag"}
        back={{ href: "/feed", label: "Feed" }}
      />
      {post ? (
        <Feed
          initial={[post]}
          hasMore={false}
          query=""
          openComments
          viewer={{
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            isLeader: user.role === "LEADER",
          }}
          empty={{ title: "Beitrag gelöscht" }}
        />
      ) : (
        <EmptyState
          icon={<IconFeed className="h-7 w-7" />}
          title="Dieser Beitrag ist nicht mehr da"
          text="Er wurde gelöscht – oder der Eintrag an der Tür wurde zurückgenommen."
          action={
            <Link href="/feed" className="btn btn-primary">
              Zum Feed
            </Link>
          }
        />
      )}
    </div>
  );
}
