import { cardPath, cardVcard, vcardFilename } from "@/lib/business-card";
import { publicCard } from "@/lib/card-queries";

export const dynamic = "force-dynamic";

/** "Kontakt speichern" auf der Visitenkarte: die Person als vCard, samt Bild. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = publicCard(token);
  if (!card) {
    return new Response("Diese Visitenkarte ist nicht gültig.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const url = new URL(cardPath(token), request.url).toString();
  return new Response(cardVcard(card, url), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${vcardFilename(card.name)}"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
