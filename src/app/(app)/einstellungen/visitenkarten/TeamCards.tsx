"use client";

import { useState } from "react";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { useCardOrigin } from "@/components/BusinessCard";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, EmptyState, ListLabel, PageHeader, ToneTile, plural } from "@/components/ui";
import { IconExternal, IconLink, IconQr } from "@/components/icons";
import { cardPath, qrFilename } from "@/lib/business-card";
import type { TeamCard } from "@/lib/card-queries";
import { qrSvg } from "@/lib/qr";

const BACK = { href: "/profil", label: "Profil", mobileOnly: true };

async function copyText(text: string, toast: (message: string) => void, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Kopieren nicht möglich");
  }
}

/** Der QR-Code als SVG-Datei - fuer Ausweise und Drucksachen. */
function downloadQr(url: string, name: string) {
  const blob = new Blob([qrSvg(url)], { type: "image/svg+xml" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = qrFilename(name);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Kartenlinks des Teams fuer die Leitung: wer die Karte an hat, mit Link
 * und QR-Code; wer nicht, steht darunter. Einschalten kann jede Person nur
 * selbst - die Karte zeigt Bild und Namen oeffentlich.
 */
export function TeamCards({ cards }: { cards: TeamCard[] }) {
  const toast = useToast();
  const origin = useCardOrigin();
  const [open, setOpen] = useState<TeamCard | null>(null);
  const on = cards.filter((card) => card.token);
  const off = cards.filter((card) => !card.token);
  const urlOf = (card: TeamCard) => (card.token && origin ? `${origin}${cardPath(card.token)}` : "");

  function copyAll() {
    const lines = on.map((card) => {
      const badge = card.badgeNumber ? ` (Ausweis-Nr. ${card.badgeNumber})` : "";
      return `${card.name}${badge}: ${urlOf(card)}`;
    });
    void copyText(lines.join("\n"), toast, plural(lines.length, "Link kopiert", "Links kopiert"));
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Visitenkarten" subtitle="Links und QR-Codes des Teams" back={BACK} />

      {on.length === 0 ? (
        <EmptyState
          boxed
          icon={<IconQr className="h-6 w-6" />}
          title="Noch keine Visitenkarte an"
          text="Jede Person schaltet ihre Karte selbst ein: Profil › Visitenkarte. Danach steht ihr Link hier."
        />
      ) : (
        <>
          <ListLabel>{plural(on.length, "Karte an", "Karten an")}</ListLabel>
          <ul className="list list-icons">
            {on.map((card) => (
              <li key={card.id}>
                <Cell
                  onClick={() => setOpen(card)}
                  icon={<Avatar name={card.name} src={card.avatar || null} size={32} />}
                  title={card.name}
                  subtitle={urlOf(card).replace(/^https?:\/\//, "") || " "}
                  detail={card.badgeNumber || undefined}
                  chevron
                />
              </li>
            ))}
          </ul>
          <ul className="list list-icons mt-4">
            <li>
              <Cell
                onClick={copyAll}
                disabled={!origin}
                icon={<ToneTile tone="blue"><IconLink className="h-4 w-4" /></ToneTile>}
                title="Alle Links kopieren"
                subtitle="Name, Ausweisnummer und Link je Zeile"
                chevron={false}
              />
            </li>
          </ul>
        </>
      )}

      {off.length > 0 && (
        <>
          <ListLabel>{plural(off.length, "Karte aus", "Karten aus")}</ListLabel>
          <ul className="list list-icons">
            {off.map((card) => (
              <li key={card.id}>
                <Cell
                  icon={<Avatar name={card.name} src={card.avatar || null} size={32} />}
                  title={card.name}
                  subtitle="Visitenkarte ausgeschaltet"
                  detail={card.badgeNumber || undefined}
                />
              </li>
            ))}
          </ul>
          <p className="list-footer">
            Die Karte zeigt Bild und Namen öffentlich – deshalb schaltet sie jede Person selbst ein: Profil › Visitenkarte.
          </p>
        </>
      )}

      {open && <CardSheet card={open} url={urlOf(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Eine Karte zum Vorzeigen oder Weitergeben: QR-Code, Link, Datei zum Drucken. */
function CardSheet({ card, url, onClose }: { card: TeamCard; url: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet title={card.name} subtitle={card.badgeNumber ? `Ausweis-Nr. ${card.badgeNumber}` : "Visitenkarte"} onClose={onClose}>
      <div className="flex flex-col items-center pb-2">
        <div className="surface p-3">
          <QrCode value={url} size={232} label={`QR-Code der Visitenkarte von ${card.name}`} />
        </div>
        <p className="mt-3 max-w-full truncate text-subhead text-muted">{url.replace(/^https?:\/\//, "")}</p>
      </div>
      <ul className="list list-icons mt-4">
        <li>
          <Cell
            onClick={() => void copyText(url, toast, "Link kopiert")}
            disabled={!url}
            icon={<ToneTile tone="blue"><IconLink className="h-4 w-4" /></ToneTile>}
            title="Link kopieren"
            chevron={false}
          />
        </li>
        <li>
          <Cell
            onClick={() => downloadQr(url, card.name)}
            disabled={!url}
            icon={<ToneTile tone="indigo"><IconQr className="h-4 w-4" /></ToneTile>}
            title="QR-Code herunterladen"
            subtitle="Als SVG – scharf in jeder Größe, zum Drucken"
            chevron={false}
          />
        </li>
        <li>
          <Cell
            href={url || "#"}
            external
            icon={<ToneTile tone="teal"><IconExternal className="h-4 w-4" /></ToneTile>}
            title="Vorschau öffnen"
          />
        </li>
      </ul>
    </Sheet>
  );
}
