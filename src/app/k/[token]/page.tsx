import type { Metadata } from "next";
import { headers } from "next/headers";
import { Logo } from "@/components/Logo";
import { Avatar, Cell, EmptyState } from "@/components/ui";
import { IconCheckCircle, IconPhone, IconQr } from "@/components/icons";
import { CARD_ROLE, cardPath, checkedAt, memberSince } from "@/lib/business-card";
import { publicCard } from "@/lib/card-queries";
import { telHref } from "@/lib/contracts";

export const dynamic = "force-dynamic";

/** Eigene Adresse aus der Anfrage - Vorschaubilder in WhatsApp brauchen sie vollstaendig. */
async function origin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/*
 * Vorschau beim Teilen: WhatsApp zeigt unter dem Link der Bestaetigung Bild,
 * Name und Team - der Kunde sieht schon im Chat, wer kommt. Suchmaschinen
 * bleiben draussen.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const card = publicCard(token);
  const base: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
  if (!card) return { ...base, title: "Visitenkarte" };
  const site = await origin();
  return {
    ...base,
    title: card.name,
    description: `${CARD_ROLE} · ${card.team_name}`,
    openGraph: {
      type: "profile",
      title: card.name,
      description: `${CARD_ROLE} · ${card.team_name}`,
      url: `${site}${cardPath(token)}`,
      images: card.avatar ? [{ url: `${site}${cardPath(token)}/bild`, width: 192, height: 192 }] : undefined,
    },
  };
}

/**
 * Die oeffentliche Visitenkarte - ausserhalb der App-Schale, ohne Anmeldung.
 * Wer hier landet, steht meist vor der Tuer oder hat eben die Bestaetigung
 * bekommen: Gesicht, Name, fuer wen, und dass das gerade stimmt.
 */
export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = publicCard(token);
  return (
    <main className="brand-backdrop min-h-dvh px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md">
        <Logo size={32} className="mb-8" />
        {card ? (
          <>
            <section className="surface flex flex-col items-center px-6 pb-6 pt-8 text-center">
              <Avatar name={card.name} src={card.avatar ? `${cardPath(token)}/bild` : null} size={112} />
              <h1 className="mt-4 text-title-1">{card.name}</h1>
              <p className="mt-1 text-body text-ink-2">{CARD_ROLE}</p>
              <p className="text-subhead text-muted">{card.team_name}</p>
              <p className="badge badge-accent mt-5 min-h-8 px-3">
                <IconCheckCircle className="h-4 w-4" />
                Aktiv im Team
              </p>
              <p className="mt-2 text-footnote text-muted">Stand {checkedAt()}</p>
            </section>

            <ul className="list mt-4">
              {card.badge_number && (
                <li>
                  <Cell title="Ausweis-Nr." detail={<span className="tabular-nums text-ink">{card.badge_number}</span>} />
                </li>
              )}
              <li>
                <Cell title="Dabei seit" detail={memberSince(card.created_at)} />
              </li>
            </ul>

            <div className="mt-4 grid gap-2">
              {card.phone && (
                <a href={telHref(card.phone)} className="btn btn-primary btn-lg btn-block">
                  <IconPhone className="h-5 w-5" />
                  {card.phone}
                </a>
              )}
              <a href={`${cardPath(token)}/kontakt`} className="btn btn-secondary btn-lg btn-block">
                Kontakt speichern
              </a>
            </div>

            <p className="list-footer">
              Diese Seite kommt direkt von {card.team_name} und zeigt nur, wer gerade im Team aktiv ist – mit der
              Uhrzeit des Abrufs, damit ein Bildschirmfoto nicht als Nachweis taugt.
            </p>
          </>
        ) : (
          <EmptyState
            boxed
            icon={<IconQr className="h-6 w-6" />}
            title="Diese Visitenkarte ist nicht gültig"
            text="Der Link wurde ersetzt, oder die Person ist nicht mehr für das Team unterwegs."
          />
        )}
      </div>
    </main>
  );
}
