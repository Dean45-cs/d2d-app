import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { acknowledgeCelebration } from "@/lib/ranks";

export const dynamic = "force-dynamic";

/** Die Feier zum neuen Rang ist gesehen - sie kommt nicht wieder. */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    acknowledgeCelebration(user.id);
    return { ok: true };
  });
}
