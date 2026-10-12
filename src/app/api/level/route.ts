import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { getLevelDashboard } from "@/lib/level-queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return getLevelDashboard(user.team_id, user.id);
  });
}
