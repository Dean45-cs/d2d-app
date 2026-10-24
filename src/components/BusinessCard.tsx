"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
import { QrCode } from "./QrCode";
import { Avatar, Cell, ListLabel } from "./ui";
import { IconChat, IconComment } from "./icons";
import { cardPath } from "@/lib/business-card";
import { smsHref, whatsappHref } from "@/lib/confirmation";

/** Wer eine Terminbestaetigung unterschreibt - und ob ein Kartenlink dazukommt. */
export interface Sender {
  name: string;
  teamName: string;
  /** null: Visitenkarte ausgeschaltet. */
  cardToken: string | null;
}

/**
 * Volle Adresse der Karte. Die Adresse der App kennt nur der Browser (hinter
 * dem Hoster steht der Server unter einem anderen Namen) - darum erst nach
 * dem ersten Bild, vorher "".
 */
export function useCardUrl(token: string | null): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return token && origin ? `${origin}${cardPath(token)}` : "";
}

/**
 * Die beiden Wege der Bestaetigung als Zeilen einer Liste. WhatsApp oeffnet
 * mit fertigem Text, die SMS ebenso - gesendet wird erst dort, der Text
 * laesst sich vorher noch aendern.
 */
export function ConfirmCells({ phone, text, onSent }: { phone: string; text: string; onSent?: () => void }) {
  const whatsapp = whatsappHref(phone, text);
  const sms = smsHref(phone, text);
  if (!whatsapp || !sms) {
    return (
      <li>
        <Cell title="Bestätigung senden" subtitle={`„${phone}“ ist keine Handynummer`} />
      </li>
    );
  }
  return (
    <>
      <li onClick={onSent}>
        <Cell
          href={whatsapp}
          external
          icon={<span className="glyph glyph-round"><IconChat className="h-4 w-4" /></span>}
          title="Per WhatsApp bestätigen"
        />
      </li>
      <li onClick={onSent}>
        <Cell
          href={sms}
          icon={<span className="glyph glyph-round"><IconComment className="h-4 w-4" /></span>}
          title="Per SMS bestätigen"
        />
      </li>
    </>
  );
}

/**
 * Direkt nach dem Termin an der Tuer: die Bestaetigung, solange der Kunde
 * noch danebensteht. Ein Tipp oeffnet WhatsApp oder die SMS, danach geht
 * das Blatt von selbst zu.
 */
export function ConfirmSheet({
  place,
  phone,
  text,
  onClose,
}: {
  place: string;
  phone: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      title="Termin bestätigen"
      subtitle={place}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-plain btn-lg btn-block" onClick={onClose}>
          Ohne Bestätigung weiter
        </button>
      }
    >
      {/* Erst die Knoepfe - der Text steht darunter zum Nachlesen und laesst sich vor dem Senden noch aendern. */}
      <ul className="list list-icons">
        <ConfirmCells phone={phone} text={text} onSent={() => window.setTimeout(onClose, 300)} />
      </ul>
      <ListLabel>Nachricht</ListLabel>
      <p className="surface whitespace-pre-line px-4 py-3 text-subhead text-ink-2">{text}</p>
    </Sheet>
  );
}

/**
 * Die Visitenkarte zum Vorzeigen: grosser QR-Code, darunter Bild und Name -
 * der Kunde scannt mit der Kamera und sieht dieselbe Person auf der Seite.
 */
export function CardQrSheet({
  token,
  name,
  avatar,
  teamName,
  onClose,
}: {
  token: string;
  name: string;
  avatar: string | null;
  teamName: string;
  onClose: () => void;
}) {
  const url = useCardUrl(token);
  return (
    <Sheet title="Visitenkarte" subtitle="Mit der Kamera scannen" onClose={onClose}>
      <div className="flex flex-col items-center pb-2">
        <div className="surface p-3">
          <QrCode value={url} size={248} label={`QR-Code der Visitenkarte von ${name}`} />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Avatar name={name} src={avatar} size={48} />
          <span className="min-w-0">
            <span className="block truncate text-headline">{name}</span>
            <span className="block truncate text-subhead text-muted">{teamName}</span>
          </span>
        </div>
      </div>
      <Link href="/profil/visitenkarte" className="btn btn-plain btn-block mt-4">
        Einstellungen
      </Link>
    </Sheet>
  );
}
