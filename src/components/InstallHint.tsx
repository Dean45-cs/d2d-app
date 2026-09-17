"use client";

import { useEffect, useState } from "react";

/**
 * Hinweis zum Installieren auf dem Home-Bildschirm.
 *
 * Auf iPhone und iPad gibt es keinen Installations-Dialog wie bei Android –
 * dort führt der Weg über "Teilen → Zum Home-Bildschirm". Deshalb zeigen wir
 * dort eine kurze Anleitung, sonst den nativen Installations-Button.
 * Läuft die App bereits vom Home-Bildschirm, erscheint gar nichts.
 */

const DISMISS_KEY = "d2d_install_hint_dismissed";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallHint() {
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    // Bereits als App installiert? Dann nichts anzeigen.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Speicher gesperrt – dann eben jedes Mal anzeigen.
    }

    const ua = window.navigator.userAgent;
    // iPadOS meldet sich als Macintosh, lässt sich aber am Touch erkennen.
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setIsIos(ios);
    if (ios) setShow(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // egal
    }
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="card mb-4 border-brand-300 p-4">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={44}
          height={44}
          className="shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Als App auf den Home-Bildschirm</p>
          {isIos ? (
            <ol className="muted mt-1.5 space-y-1 text-sm">
              <li>
                1. Unten (iPhone) bzw. oben (iPad) auf das Teilen-Symbol{" "}
                <ShareIcon /> tippen
              </li>
              <li>
                2. In der Liste <strong>„Zum Home-Bildschirm“</strong> wählen
              </li>
              <li>
                3. Oben rechts auf <strong>„Hinzufügen“</strong>
              </li>
            </ol>
          ) : (
            <p className="muted mt-1 text-sm">
              Dann startet die App ohne Browserleiste und liegt als eigenes
              Symbol auf dem Bildschirm.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {promptEvent && (
              <button className="btn btn-primary px-3 py-1.5 text-sm" onClick={install}>
                Installieren
              </button>
            )}
            <button className="btn btn-ghost px-3 py-1.5 text-sm" onClick={dismiss}>
              Verstanden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Das Teilen-Symbol von iOS, damit klar ist, welcher Knopf gemeint ist. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block -mt-0.5 align-middle text-brand-500"
      aria-label="Teilen"
      role="img"
    >
      <path d="M12 15V3" />
      <path d="m8 6.5 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
