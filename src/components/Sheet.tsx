"use client";

import { useEffect, type ReactNode } from "react";
import { IconX } from "./icons";

interface Props {
  /** Ueberschrift des Blattes - kurz, in der Sprache der Tuer. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Schliessen ueber Schleier, Kreuz und Escape. */
  onClose: () => void;
  children: ReactNode;
  /** Bleibt beim Rollen unten stehen - dort sitzt die Hauptaktion. */
  footer?: ReactNode;
  /** Zusaetzlicher Knopf rechts neben der Ueberschrift. */
  action?: ReactNode;
  /** Breite auf dem Rechner; auf dem Handy fuellt das Blatt immer die Breite. */
  width?: "md" | "lg";
}

/**
 * Ein Blatt, das von unten hereinfaehrt.
 *
 * Auf dem Handy sitzt es am unteren Rand - dort, wo der Daumen ist - und
 * bringt einen Griff mit, damit sichtbar ist, dass es sich wegschieben
 * laesst. Auf dem Rechner wird daraus ein mittiger Dialog.
 *
 * Der Inhalt rollt fuer sich, Kopf und Fuss bleiben stehen: die Hauptaktion
 * ist damit immer erreichbar, egal wie lang die Liste darueber wird.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  action,
  width = "md",
}: Props) {
  // Escape schliesst, und der Hintergrund darf nicht mitrollen - sonst
  // verliert man beim Wischen im Blatt die Stelle darunter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="scrim z-30 flex items-end md:items-center md:justify-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`sheet ${width === "lg" ? "md:max-w-2xl" : "md:max-w-lg"}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pb-1 pt-2.5 md:hidden">
          <span className="sheet-grip" aria-hidden />
        </div>

        <div className="flex items-start gap-3 px-5 pb-3 pt-2 md:pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold">{title}</h2>
            {subtitle && (
              <p className="muted mt-0.5 text-[13px] leading-snug">{subtitle}</p>
            )}
          </div>
          {action}
          <button
            type="button"
            onClick={onClose}
            className="icon-btn -mr-1.5 -mt-1 shrink-0"
            aria-label="Schließen"
            style={{ background: "color-mix(in srgb, var(--ink) 6%, transparent)" }}
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`sheet-body px-5 ${
            footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </div>

        {footer && (
          <div
            className="glass border-t px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
            style={{ borderColor: "var(--line)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
