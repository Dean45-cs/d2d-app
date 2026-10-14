import Link from "next/link";
import { hasPermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { getPost } from "@/lib/community";
import { Feed } from "@/components/community/Feed";
import { EmptyState, PageHeader } from "@/components/ui";
import { IconChat } from "@/components/icons";

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
    <div className="page-narrow">
      <PageHeader title={post?.kind === "SALE" ? "Abschluss" : "Beitrag"} back={{ href: "/team", label: "Team" }} />
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
            isLeader: hasPermission(user, "community.moderate"),
          }}
          empty={{ title: "Beitrag gelöscht" }}
        />
      ) : (
        <EmptyState
          boxed
          icon={<IconChat className="h-6 w-6" />}
          title="Beitrag nicht mehr da"
          action={
            <Link href="/team" className="btn btn-primary">
              Zum Team
            </Link>
          }
        />
      )}
    </div>
  );
}
