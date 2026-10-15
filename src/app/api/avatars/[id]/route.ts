import { getCurrentUser } from "@/lib/auth";
import { avatarSrc, decodeAvatar } from "@/lib/avatar-src";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Profilbild einer Person aus dem eigenen Team (Adresse aus avatarSrc).
 *
 * Die Adresse traegt einen Pruefwert des Bildes, darum darf das Handy die
 * Antwort ein Jahr lang behalten, ohne nachzufragen - auch ohne Netz. Nur fuer
 * Angemeldete und nur im Browser (private), nie in geteilten Zwischenspeichern.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const userId = Number(id);
  const row = Number.isSafeInteger(userId)
    ? (getDb().prepare("SELECT avatar FROM users WHERE id = ? AND team_id = ?").get(userId, user.team_id) as
        | { avatar: string }
        | undefined)
    : undefined;
  const image = row?.avatar ? decodeAvatar(row.avatar) : null;
  if (!row || !image) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

  // Eine veraltete Adresse (Bild inzwischen getauscht) bekommt das neue Bild, aber ohne Dauer-Cache.
  const url = new URL(request.url);
  const current = avatarSrc(userId, row.avatar) === `${url.pathname}${url.search}`;
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.type,
      "content-length": String(image.bytes.length),
      "cache-control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
