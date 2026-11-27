"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { useCardOrigin } from "@/components/BusinessCard";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Avatar, Cell, EmptyState, ListLabel, PageHeader, ToneTile, plural } from "@/components/ui";
import { IconExternal, IconLink, IconQr } from "@/components/icons";
import { cardPath, qrFilename } from "@/lib/business-card";
import type { TeamCard } from "@/lib/card-queries";
import { fetchWithTimeout } from "@/lib/offline-queue";
import { qrSvg } from "@/lib/qr";

const BACK = { href: "/profil", label: "Profil", mobileOnly: true };

type Change = { enabled?: boolean; renew?: boolean };

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
 * und QR-Code; wer nicht, steht darunter und laesst sich hier einschalten -
 * einzeln oder alle auf einmal. Ausschalten kann die Person weiterhin selbst.
 */
export function TeamCards({ cards }: { cards: TeamCard[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const origin = useCardOrigin();
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const on = cards.filter((card) => card.token);
  const off = cards.filter((card) => !card.token);
  const open = cards.find((card) => card.id === openId) ?? null;
  const urlOf = (card: TeamCard) => (card.token && origin ? `${origin}${cardPath(card.token)}` : "");

  async function change(ids: number[], body: Change, done: string): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetchWithTimeout("/api/team/cards", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(data.error ?? "Nicht gespeichert");
        return false;
      }
      toast(done);
      router.refresh();
      return true;
    } catch {
      toast("Ohne Verbindung nicht möglich");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    const lines = on.map((card) => {
      const badge = card.badgeNumber ? ` (Ausweis-Nr. ${card.badgeNumber})` : "";
      return `${card.name}${badge}: ${urlOf(card)}`;
    });
    void copyText(lines.join("\n"), toast, plural(lines.length, "Link kopiert", "Links kopiert"));
  }

  async function enableAll() {
    const ok = await confirm({
      title: plural(off.length, "Karte einschalten?", "Karten einschalten?"),
      text: "Bild, Name und Team sind danach über den Link öffentlich zu sehen. Jede Person kann ihre Karte selbst wieder ausschalten.",
      confirmLabel: "Einschalten",
    });
    if (ok) await change(off.map((card) => card.id), { enabled: true }, plural(off.length, "Karte ist an", "Karten sind an"));
  }

  async function renew(card: TeamCard) {
    const ok = await confirm({
      title: "Neuen Link erzeugen?",
      text: `Der bisherige QR-Code von ${card.name} und Links in schon verschickten Bestätigungen gelten danach nicht mehr.`,
      confirmLabel: "Neuer Link",
    });
    if (ok) await change([card.id], { renew: true }, "Neuer Link – der alte gilt nicht mehr");
  }

  async function disable(card: TeamCard) {
    const ok = await confirm({
      title: "Visitenkarte ausschalten?",
      text: `Die Seite von ${card.name} ist danach nicht mehr erreichbar. Beim Einschalten gibt es einen neuen Link.`,
      confirmLabel: "Ausschalten",
      danger: true,
    });
    if (ok && (await change([card.id], { enabled: false }, "Visitenkarte ist aus"))) setOpenId(null);
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Visitenkarten" subtitle="Links und QR-Codes des Teams" back={BACK} />

      {on.length === 0 ? (
        <EmptyState
          boxed
          icon={<IconQr className="h-6 w-6" />}
          title="Noch keine Visitenkarte an"
          text="Schalte die Karten unten ein – oder jede Person selbst unter Profil › Visitenkarte."
        />
      ) : (
        <>
          <ListLabel>{plural(on.length, "Karte an", "Karten an")}</ListLabel>
          <ul className="list list-icons">
            {on.map((card) => (
              <li key={card.id}>
                <Cell
                  onClick={() => setOpenId(card.id)}
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
                  subtitle={card.badgeNumber ? `Ausweis-Nr. ${card.badgeNumber}` : "Visitenkarte ausgeschaltet"}
                  trailing={
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm shrink-0"
                      disabled={busy}
                      onClick={() => void change([card.id], { enabled: true }, `Karte von ${card.name} ist an`)}
                    >
                      Einschalten
                    </button>
                  }
                />
              </li>
            ))}
            {off.length > 1 && (
              <li>
                <Cell
                  onClick={() => void enableAll()}
                  disabled={busy}
                  tone="accent"
                  title={`Alle ${off.length} einschalten`}
                  chevron={false}
                />
              </li>
            )}
          </ul>
          <p className="list-footer">
            Eine eingeschaltete Karte zeigt Bild, Name und Team öffentlich über ihren Link. Jede Person kann sie unter
            Profil › Visitenkarte selbst wieder ausschalten.
          </p>
        </>
      )}

      {open && open.token && (
        <CardSheet
          card={open}
          url={urlOf(open)}
          busy={busy}
          onRenew={() => void renew(open)}
          onDisable={() => void disable(open)}
          onClose={() => setOpenId(null)}
        />
      )}
      {dialog}
    </div>
  );
}

/** Eine Karte zum Vorzeigen oder Weitergeben: QR-Code, Link, Datei zum Drucken. */
function CardSheet({
  card,
  url,
  busy,
  onRenew,
  onDisable,
  onClose,
}: {
  card: TeamCard;
  url: string;
  busy: boolean;
  onRenew: () => void;
  onDisable: () => void;
  onClose: () => void;
}) {
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
      <ul className="list mt-4">
        <li>
          <Cell
            onClick={onRenew}
            disabled={busy}
            title="Neuen Link erzeugen"
            subtitle="Der bisherige QR-Code gilt dann nicht mehr"
            chevron={false}
          />
        </li>
        <li>
          <Cell onClick={onDisable} disabled={busy} tone="danger" title="Visitenkarte ausschalten" chevron={false} />
        </li>
      </ul>
    </Sheet>
  );
}
