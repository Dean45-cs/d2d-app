"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconCalendar, IconChat, IconDoor, IconExternal } from "@/components/icons";

export interface TrayAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
}

/** Zeichen in der Leiste - auf dem iPad eine Stufe groesser. */
export const TRAY_ICON = "h-6 w-6 md:h-7 md:w-7";

/**
 * Die vier Ergebnisse im Daumenbereich: gross (60 pt, auf dem iPad 76 pt),
 * ruhig, eindeutig. Auf dem Handy schwebt die Leiste als Glas ueber der
 * Reiterleiste, auf iPad und Rechner klebt sie unten an der Spalte der Tuer.
 *
 * Fehlende Einrichtung wird direkt hier angeboten. "Auftrag starten"
 * oeffnet den Tarifrechner; ein bestaetigter Abschluss kommt erst danach.
 */
export function OutcomeTray({
  disabled,
  hint,
  setupActions = [],
  onNotHome,
  onMet,
  onAppointment,
  onSale,
}: {
  disabled: boolean;
  /** Naechster Schritt oder Grund, warum noch kein Ergebnis moeglich ist. */
  hint?: string | null;
  setupActions?: TrayAction[];
  onNotHome: () => void;
  onMet: () => void;
  onAppointment: () => void;
  onSale: () => void;
}) {
  const trayRef = useRef<HTMLDivElement>(null);

  // Einrichtung und Ergebnisse brauchen unterschiedlich viel Platz.
  // Inhalt und Rueckgaengig-Toast bleiben oberhalb der festen Leiste erreichbar;
  // auf dem iPad steht der Toast mittig ueber ihr, auch rechts in der Tuerspalte.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;
    const root = document.documentElement;
    const measure = () => {
      const box = tray.getBoundingClientRect();
      root.style.setProperty("--tour-tray-height", `${tray.offsetHeight}px`);
      root.style.setProperty("--tour-tray-x", `${Math.round(box.left + box.width / 2)}px`);
      root.style.setProperty("--tour-tray-width", `${Math.round(box.width)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tray);
    // Seitenleiste auf- oder zuklappen verschiebt die Leiste, ohne ihre Groesse zu aendern.
    const main = tray.closest(".shell-main");
    if (main) observer.observe(main);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tour-tray-height");
      root.style.removeProperty("--tour-tray-x");
      root.style.removeProperty("--tour-tray-width");
    };
  }, []);

  return (
    <div ref={trayRef} className="tray glass-strong" role="group" aria-label={hint || "Ergebnis erfassen"}>
      {hint ? (
        <>
          {/* Sagt der Knopf schon dasselbe ("Klingel wählen"), steht der Satz nur fuer Bildschirmleser da. */}
          <p
            className={
              setupActions.length === 1 && setupActions[0].label === hint
                ? "sr-only"
                : "px-2 py-2 text-center text-subhead font-semibold text-ink-2 md:text-headline"
            }
            role="status"
          >
            {hint}
          </p>
          {setupActions.length > 0 && (
            <div className={`grid gap-2 md:gap-2.5 ${setupActions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {setupActions.map((action) => (
                <TrayButton key={action.label} {...action} disabled={disabled} stacked={setupActions.length > 1} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="tray-grid">
          <TrayButton icon={<IconDoor className={TRAY_ICON} />} label="Nicht da" onClick={onNotHome} disabled={disabled} />
          <TrayButton icon={<IconChat className={TRAY_ICON} />} label="Ohne Abschluss" onClick={onMet} disabled={disabled} />
          <TrayButton
            icon={<IconCalendar className={TRAY_ICON} />}
            label="Termin"
            onClick={onAppointment}
            disabled={disabled}
          />
          <TrayButton
            icon={<IconExternal className={TRAY_ICON} />}
            label="Auftrag starten"
            onClick={onSale}
            disabled={disabled}
            primary
          />
        </div>
      )}
    </div>
  );
}

function TrayButton({
  icon,
  label,
  onClick,
  disabled,
  primary = false,
  stacked = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
  stacked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tray-btn ${primary ? "tray-btn-primary" : ""} ${stacked ? "tray-btn-setup" : ""}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
