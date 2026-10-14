"use client";

import { useEffect, useState } from "react";
import { IconShare } from "./icons";
import { LogoMark } from "./Logo";
import { Sheet } from "./Sheet";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Als App installieren" als Zeile im Profil - solange die App noch im
 * Browser laeuft. Android/Chrome zeigt den eigenen Dialog, auf iPhone und
 * iPad fuehrt eine kurze Anleitung durch Teilen -> "Zum Home-Bildschirm".
 */
export function InstallCell() {
  const [show, setShow] = useState(false);
  const [guide, setGuide] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    setShow(true);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!promptEvent) {
      setGuide(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") setShow(false);
  }

  if (!show) return null;

  // Eine eigene Zeile der Liste - verschwindet ganz, wenn die App schon installiert ist.
  return (
    <li>
      <button type="button" className="cell cell-tap" onClick={() => void install()}>
        <LogoMark size={32} />
        <span className="min-w-0 flex-1 truncate text-body">Als App installieren</span>
      </button>
      {guide && (
        <Sheet title="Zum Home-Bildschirm" onClose={() => setGuide(false)}>
          <ol className="list">
            <li className="cell">
              <span className="glyph">1</span>
              <span className="flex flex-1 items-center gap-2 text-body">
                <IconShare className="h-5 w-5 text-accent-ink" />
                Teilen antippen
              </span>
            </li>
            <li className="cell">
              <span className="glyph">2</span>
              <span className="flex-1 text-body">„Zum Home-Bildschirm“</span>
            </li>
            <li className="cell">
              <span className="glyph">3</span>
              <span className="flex-1 text-body">„Hinzufügen“</span>
            </li>
          </ol>
        </Sheet>
      )}
    </li>
  );
}
