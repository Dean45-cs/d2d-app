import { CARD_ROLE, memberSince } from "@/lib/business-card";
import { publicCard } from "@/lib/card-queries";

export const dynamic = "force-dynamic";

/**
 * Die Karte als Daten - fuer die Firmenseite (CARD_ORIGIN), die den Ausweis
 * unter ihrer eigenen Adresse zeigt. Enthaelt nur, was die oeffentliche
 * Karte ohnehin zeigt; das Bild kommt weiter ueber /k/[token]/bild.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = publicCard(token);
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (!card) return Response.json({ ok: false }, { status: 404, headers });
  return Response.json(
    {
      ok: true,
      name: card.name,
      role: CARD_ROLE,
      team: card.team_name,
      phone: card.phone,
      badgeNumber: card.badge_number,
      memberSince: memberSince(card.created_at),
      hasImage: Boolean(card.avatar),
    },
    { headers },
  );
}
