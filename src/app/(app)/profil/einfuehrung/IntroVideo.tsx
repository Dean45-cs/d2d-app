"use client";

import { useRef } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Cell, ListLabel } from "@/components/ui";

/*
 * Das Video entsteht in video/einfuehrung (render.mjs) und liegt fertig
 * unter public/. Die Kapitel stehen dort in js/timeline.js - aendert sich
 * der Zeitplan, hier mitziehen.
 */
const CHAPTERS: Array<[seconds: number, title: string, subtitle: string]> = [
  [0, "Start", "Aufbau der App"],
  [17, "Gebiete", "Abstecken, aufteilen, Laufroute"],
  [33, "Klinken", "Ergebnisse, Gründe, Mehrfamilienhaus, In meiner Nähe"],
  [66, "Termine", "Uhrzeit, Bestätigung per WhatsApp oder SMS"],
  [79, "Abschluss", "Tarifrechner, bestätigen, XP und Level"],
  [97, "Visitenkarte", "QR-Code an der Tür"],
  [105, "Preise", "Energiekarte und Grundversorger"],
  [114, "Übersicht", "Zahlen und Profil"],
  [123, "Team", "Rangliste, Tagesziele, Abzeichen"],
  [135, "Kunden", "Vertragsende und Umberatung"],
  [142, "Deine App", "Farben, Hell und Dunkel, iPhone und iPad"],
];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function IntroVideo() {
  const video = useRef<HTMLVideoElement>(null);

  function jump(seconds: number) {
    const node = video.current;
    if (!node) return;
    node.currentTime = seconds;
    void node.play().catch(() => undefined);
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="page-narrow">
      <PageHeader
        title="Einführung"
        subtitle="Alle Funktionen in zweieinhalb Minuten"
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
      />
      <div className="surface overflow-hidden">
        <video
          ref={video}
          className="block aspect-video w-full"
          style={{ background: "#000" }}
          src="/einfuehrung.mp4"
          poster="/einfuehrung.jpg"
          controls
          playsInline
          preload="metadata"
        />
      </div>
      <ListLabel>Kapitel</ListLabel>
      <ul className="list">
        {CHAPTERS.map(([seconds, title, subtitle]) => (
          <li key={seconds}>
            <Cell
              onClick={() => jump(seconds)}
              title={title}
              subtitle={subtitle}
              wrap
              detail={<span className="tabular-nums">{clock(seconds)}</span>}
            />
          </li>
        ))}
      </ul>
      <p className="list-footer">Mit Ton am schönsten. Das Video lädt erst beim Abspielen – rund 30 MB.</p>
    </div>
  );
}
