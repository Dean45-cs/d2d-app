import { requireUser } from "@/lib/auth";
import { handle, optionalAvatar, optionalText } from "@/lib/api";
import { MAX_BIO_CHARS, setAvatar, setBio } from "@/lib/community";

export const dynamic = "force-dynamic";

/**
 * Das eigene Profil bearbeiten: Text ueber sich und Profilbild. Name, Rolle
 * und Zugang bleiben Sache der Teamleitung.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    if (body.bio !== undefined) {
      // Zeilenumbrueche zu Leerzeichen: das Profil zeigt eine ruhige Zeile, keinen Aufsatz.
      setBio(user.id, optionalText(String(body.bio ?? "").replace(/\s+/g, " "), MAX_BIO_CHARS));
    }
    if (body.avatar !== undefined) setAvatar(user.id, optionalAvatar(body.avatar));
    return { ok: true };
  });
}
