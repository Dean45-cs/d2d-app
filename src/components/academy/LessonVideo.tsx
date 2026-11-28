"use client";

import { useRef } from "react";
import { Cell, ListLabel } from "@/components/ui";
import type { AcademyVideo } from "@/lib/academy/videos";

// Bewusst hier statt aus videos.ts: so landet das Manifest nicht im Browser.
const clock = (seconds: number) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;

/**
 * Erklaervideo der Akademie mit Untertiteln (standardmaessig an - an der Tuer
 * oder im Auto oft ohne Ton geschaut) und Kapitelmarken darunter, wie bei
 * der Einfuehrung im Profil.
 */
export function LessonVideo({ video, chapters = true }: { video: AcademyVideo; chapters?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  function jump(seconds: number) {
    const node = ref.current;
    if (!node) return;
    node.currentTime = seconds;
    void node.play().catch(() => undefined);
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <div className="surface overflow-hidden">
        <video
          ref={ref}
          className="block aspect-video w-full"
          style={{ background: "#000" }}
          src={video.src}
          poster={video.poster}
          controls
          playsInline
          preload="metadata"
        >
          <track kind="captions" src={video.captions} srcLang="de" label="Deutsch" default />
        </video>
      </div>
      {chapters && video.chapters.length > 1 && (
        <>
          <ListLabel>Kapitel</ListLabel>
          <ul className="list">
            {video.chapters.map((chapter) => (
              <li key={chapter.t}>
                <Cell
                  onClick={() => jump(chapter.t)}
                  title={chapter.title}
                  detail={<span className="tabular-nums">{clock(chapter.t)}</span>}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
