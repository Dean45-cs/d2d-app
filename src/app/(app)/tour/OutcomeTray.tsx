"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconCalendar, IconChat, IconDoor, IconExternal } from "@/components/icons";

export interface TrayAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  primary?: boolean;
}

/**
 * Die vier Ergebnisse im Daumenbereich: gross (60 pt), ruhig, eindeutig.
 * Auf dem Handy schwebt die Leiste als Glas ueber der Reiterleiste, auf
 * iPad und Rechner steht sie unter der Hausnummer.
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
  // Inhalt und Rueckgaengig-Toast bleiben oberhalb der festen Leiste erreichbar.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--tour-tray-height", `${tray.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tray);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--tour-tray-height");
    };
  }, []);

  return (
    <div ref={trayRef} className="tray glass-strong" role="group" aria-label={hint || "Ergebnis erfassen"}>
      {hint ? (
        <>
          <p className="px-2 py-2 text-center text-subhead font-semibold text-ink-2" role="status">{hint}</p>
          {setupActions.length > 0 && (
            <div className={`grid gap-2 ${setupActions.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {setupActions.map((action) => (
                <TrayButton key={action.label} {...action} disabled={disabled} stacked={setupActions.length > 1} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <TrayButton icon={<IconDoor className="h-6 w-6" />} label="Nicht da" onClick={onNotHome} disabled={disabled} />
          <TrayButton icon={<IconChat className="h-6 w-6" />} label="Ohne Abschluss" onClick={onMet} disabled={disabled} />
          <TrayButton
            icon={<IconCalendar className="h-6 w-6" />}
            label="Termin"
            onClick={onAppointment}
            disabled={disabled}
          />
          <TrayButton
            icon={<IconExternal className="h-6 w-6" />}
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
