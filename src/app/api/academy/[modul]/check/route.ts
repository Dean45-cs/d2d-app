import { AuthError, requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { findModule } from "@/lib/academy/content";
import { checkAnswer } from "@/lib/academy/score";

export const dynamic = "force-dynamic";

/**
 * Eine Antwort pruefen: { question, choice } - die Rueckmeldung direkt nach
 * dem Tippen, mit Erklaerung. Gespeichert wird erst der ganze Durchgang.
 */
export async function POST(request: Request, { params }: { params: Promise<{ modul: string }> }) {
  return handle(async () => {
    await requireUser();
    const mod = findModule((await params).modul);
    if (!mod) throw new AuthError("Dieses Modul gibt es nicht.", 404);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return checkAnswer(mod, body.question, body.choice);
  });
}
