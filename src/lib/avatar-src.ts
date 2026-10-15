import { createHash } from "node:crypto";

/**
 * Adresse, unter der ein Profilbild angezeigt wird.
 *
 * Gespeichert ist das Bild als Data-URL (src/lib/avatar.ts). In jede Seite
 * eingebettet waeren das bei 40 Leuten gut eine halbe Megabyte - und das bei
 * jedem Neuladen der Tour nach einer erfassten Tuer. Stattdessen bekommt jedes
 * Bild eine eigene Adresse (src/app/api/avatars/[id]/route.ts), die das Handy
 * einmal laedt und danach aus dem Zwischenspeicher nimmt. Der Pruefwert in
 * `v` aendert sich mit dem Bild, ein neues Bild hat also eine neue Adresse.
 *
 * Steht als SQL-Funktion `avatar_src(id, avatar)` in allen Abfragen fuer die
 * Anzeige bereit (src/lib/db.ts).
 */
export function avatarSrc(userId: number, avatar: string | null | undefined): string {
  if (!avatar) return "";
  if (!avatar.startsWith("data:")) return avatar;
  const version = createHash("sha1").update(avatar).digest("base64url").slice(0, 12);
  return `/api/avatars/${userId}?v=${version}`;
}

/** Data-URL eines Profilbilds in Bildtyp und Bytes zerlegen. */
export function decodeAvatar(avatar: string): { type: string; bytes: Buffer } | null {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(avatar);
  if (!match) return null;
  return { type: match[1], bytes: Buffer.from(match[2], "base64") };
}
