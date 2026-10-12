import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createInvitation } from "@/lib/invitations";

export async function POST() {
  return handle(async () => createInvitation((await requireUser()).id));
}
