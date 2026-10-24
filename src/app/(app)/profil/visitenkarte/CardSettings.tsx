"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "@/components/QrCode";
import { useCardUrl } from "@/components/BusinessCard";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Avatar, Cell, ListLabel, Notice, PageHeader, Switch, ToneTile } from "@/components/ui";
import { IconExternal, IconLink, IconPerson, IconQr, IconShare } from "@/components/icons";
import { cardPath } from "@/lib/business-card";
import type { CardSettings as Settings } from "@/lib/card-queries";
import { fetchWithTimeout } from "@/lib/offline-queue";

const noop = () => () => {};
function useCanShare(): boolean {
  return useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
}

/**
 * Die eigene Visitenkarte. Aus: ein Satz, wozu sie gut ist, und ein Knopf.
 * An: der QR-Code zum Vorzeigen, Vorschau und Link, was darauf steht - und
 * der Weg zurueck (neuer Link, ausschalten).
 */
export function CardSettings({
  initial,
  name,
  avatar,
  userId,
}: {
  initial: Settings;
  name: string;
  avatar: string | null;
  userId: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const canShare = useCanShare();
  const [settings, setSettings] = useState({ token: initial.token, showPhone: initial.showPhone });
  const [busy, setBusy] = useState(false);
  const url = useCardUrl(settings.token);

  async function change(body: Record<string, boolean>, done: string): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetchWithTimeout("/api/profile/card", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(data.error ?? "Nicht gespeichert");
        return false;
      }
      setSettings({ token: data.token ?? null, showPhone: Boolean(data.showPhone) });
      toast(done);
      // Klinken und Termine kennen die Karte danach auch.
      router.refresh();
      return true;
    } catch {
      toast("Ohne Verbindung nicht möglich");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function renew() {
    const ok = await confirm({
      title: "Neuen Link erzeugen?",
      text: "Der bisherige QR-Code und Links in schon verschickten Bestätigungen gelten danach nicht mehr.",
      confirmLabel: "Neuer Link",
    });
    if (ok) await change({ renew: true }, "Neuer Link – der alte gilt nicht mehr");
  }

  async function disable() {
    const ok = await confirm({
      title: "Visitenkarte ausschalten?",
      text: "Die Seite ist danach nicht mehr erreichbar. Beim Einschalten gibt es einen neuen Link.",
      confirmLabel: "Ausschalten",
      danger: true,
    });
    if (ok) await change({ enabled: false }, "Visitenkarte ist aus");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link kopiert");
    } catch {
      toast("Kopieren nicht möglich");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `${name} · ${initial.teamName}`, url });
    } catch {
      // Abgebrochen oder nicht erlaubt - nichts zu melden.
    }
  }

  const back = { href: "/profil", label: "Profil", mobileOnly: true };

  if (!settings.token) {
    return (
      <div className="page-narrow">
        <PageHeader title="Visitenkarte" back={back} />
        <section className="surface flex flex-col items-center px-6 py-8 text-center">
          <span className="glyph glyph-lg glyph-round mb-4 text-accent-ink">
            <IconQr className="h-6 w-6" />
          </span>
          <p className="text-headline">Zeig an der Tür, wer du bist</p>
          <p className="mt-1 max-w-sm text-subhead text-muted">
            Kunden scannen den QR-Code von deinem Handy und sehen dein Bild, deinen Namen und {initial.teamName} – live
            vom Server. Der Link steht auch in jeder Terminbestätigung.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block mt-6"
            disabled={busy}
            onClick={() => void change({ enabled: true }, "Visitenkarte ist an")}
          >
            Visitenkarte einschalten
          </button>
        </section>
        <p className="list-footer">
          Die Seite ist öffentlich, solange sie eingeschaltet ist und du im Team aktiv bist. Ausschalten geht jederzeit.
        </p>
      </div>
    );
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Visitenkarte" subtitle="Mit der Kamera scannen" back={back} />

      <section className="surface flex flex-col items-center px-6 py-6">
        <QrCode value={url} size={232} label={`QR-Code der Visitenkarte von ${name}`} />
        <div className="mt-5 flex items-center gap-3">
          <Avatar name={name} src={avatar} size={44} />
          <span className="min-w-0">
            <span className="block truncate text-headline">{name}</span>
            <span className="block truncate text-subhead text-muted">{initial.teamName}</span>
          </span>
        </div>
      </section>

      {!avatar && (
        <div className="mt-4">
          <Notice icon={<IconPerson className="h-5 w-5" />}>
            Mit Bild erkennt man dich beim Termin wieder.{" "}
            <Link href={`/profil/${userId}`} className="link">
              Profilbild wählen
            </Link>
          </Notice>
        </div>
      )}

      <ul className="list list-icons mt-4">
        <li>
          <Cell
            href={cardPath(settings.token)}
            external
            icon={<ToneTile tone="teal"><IconExternal className="h-4 w-4" /></ToneTile>}
            title="Vorschau öffnen"
            subtitle={url.replace(/^https?:\/\//, "") || " "}
          />
        </li>
        <li>
          {canShare ? (
            <Cell
              onClick={() => void share()}
              icon={<ToneTile tone="blue"><IconShare className="h-4 w-4" /></ToneTile>}
              title="Link teilen"
              chevron={false}
            />
          ) : (
            <Cell
              onClick={() => void copy()}
              icon={<ToneTile tone="blue"><IconLink className="h-4 w-4" /></ToneTile>}
              title="Link kopieren"
              chevron={false}
            />
          )}
        </li>
      </ul>

      <ListLabel>Auf der Karte</ListLabel>
      <ul className="list">
        <li>
          <Cell
            title="Telefonnummer zeigen"
            subtitle={initial.phone || "Keine Nummer hinterlegt – trägt die Teamleitung ein"}
            wrap
            trailing={
              <Switch
                checked={settings.showPhone && Boolean(initial.phone)}
                disabled={busy || !initial.phone}
                onChange={(on) => void change({ showPhone: on }, on ? "Nummer steht auf der Karte" : "Nummer ist nicht mehr zu sehen")}
                label="Telefonnummer auf der Visitenkarte zeigen"
              />
            }
          />
        </li>
        <li>
          <Cell title="Ausweis-Nr." detail={initial.badgeNumber || "–"} />
        </li>
      </ul>
      <p className="list-footer">
        Dazu Bild, Name, {initial.teamName} und seit wann du dabei bist. Ausweisnummer und Rufnummer trägt die Teamleitung ein.
      </p>

      <ul className="list mt-6">
        <li>
          <Cell
            onClick={() => void renew()}
            disabled={busy}
            title="Neuen Link erzeugen"
            subtitle="Der bisherige QR-Code gilt dann nicht mehr"
            chevron={false}
          />
        </li>
        <li>
          <Cell onClick={() => void disable()} disabled={busy} tone="danger" title="Visitenkarte ausschalten" chevron={false} />
        </li>
      </ul>
      {dialog}
    </div>
  );
}
