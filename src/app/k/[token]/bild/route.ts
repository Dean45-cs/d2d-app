import { decodeAvatar } from "@/lib/avatar-src";
import { publicCard } from "@/lib/card-queries";

export const dynamic = "force-dynamic";

/**
 * Profilbild der Visitenkarte - oeffentlich, solange die Karte gilt. Auf der
 * Karte selbst und als Vorschaubild, wenn der Link in WhatsApp steht. Nur
 * kurz zwischengespeichert: ein ausgeschalteter Link soll bald kein Bild mehr liefern.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = publicCard(token);
  const image = card?.avatar ? decodeAvatar(card.avatar) : null;
  if (!image) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.type,
      "content-length": String(image.bytes.length),
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}
