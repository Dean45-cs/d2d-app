import { AuthError, requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { findModule } from "@/lib/academy/content";
import { readAnswers, scoreAttempt } from "@/lib/academy/score";
import { passedCount, progressFor, recordAttempt } from "@/lib/academy/store";

export const dynamic = "force-dynamic";

/**
 * Einen Durchgang abgeben: { answers: [Index je Frage] }. Gewertet wird hier
 * auf dem Server - der Browser kennt die Loesungen nicht.
 */
export async function POST(request: Request, { params }: { params: Promise<{ modul: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const mod = findModule((await params).modul);
    if (!mod) throw new AuthError("Dieses Modul gibt es nicht.", 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = scoreAttempt(mod, readAnswers(mod, body.answers));
    const progress = recordAttempt(user.id, mod, result);
    const all = progressFor(user.id);
    return { ...result, progress, modulesPassed: passedCount(all), modulesTotal: all.length };
  });
}
