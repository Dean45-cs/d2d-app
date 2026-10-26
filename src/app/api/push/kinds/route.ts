import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { isPushKind, setPushKinds, type PushKind } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Worueber man Push bekommt - einzelne Arten an- oder abbestellen:
 * { kinds: { comment: false } }. Gilt fuer alle eigenen Geraete; die Antwort
 * ist der neue Stand aller Arten.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const input = body && typeof body.kinds === "object" && body.kinds ? (body.kinds as Record<string, unknown>) : {};
    const patch: Partial<Record<PushKind, boolean>> = {};
    for (const [kind, on] of Object.entries(input)) {
      if (!isPushKind(kind) || typeof on !== "boolean") throw new Error("Diese Mitteilung kennt die App nicht.");
      patch[kind] = on;
    }
    return { kinds: setPushKinds(user.id, patch) };
  });
}
