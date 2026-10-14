"use client";

import type { ReactNode } from "react";
import { IconCalendar, IconChat, IconCheckCircle, IconDoor } from "@/components/icons";

/**
 * Die vier Ergebnisse im Daumenbereich: gross (60 pt), ruhig, eindeutig.
 * Auf dem Handy schwebt die Leiste als Glas ueber der Reiterleiste, auf
 * iPad und Rechner steht sie unter der Hausnummer.
 *
 * "Abschluss" ist eine Aktion und deshalb gruen getoent - gefuellt gruen
 * mit Haekchen ist erst das Ergebnis danach.
 */
export function OutcomeTray({
  disabled,
  hint,
  onNotHome,
  onMet,
  onAppointment,
  onSale,
}: {
  disabled: boolean;
  /** Warum gerade nichts geht - "Klingel wählen". */
  hint?: string | null;
  onNotHome: () => void;
  onMet: () => void;
  onAppointment: () => void;
  onSale: () => void;
}) {
  return (
    <div className="tray glass-strong" role="group" aria-label="Ergebnis erfassen">
      {hint && <p className="px-2 pb-2 text-center text-footnote font-semibold text-ink-2">{hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        <TrayButton icon={<IconDoor className="h-6 w-6" />} label="Nicht da" onClick={onNotHome} disabled={disabled} />
        <TrayButton icon={<IconChat className="h-6 w-6" />} label="Gespräch" onClick={onMet} disabled={disabled} />
        <TrayButton
          icon={<IconCalendar className="h-6 w-6" />}
          label="Termin"
          onClick={onAppointment}
          disabled={disabled}
        />
        <TrayButton
          icon={<IconCheckCircle className="h-6 w-6" />}
          label="Abschluss"
          onClick={onSale}
          disabled={disabled}
          primary
        />
      </div>
    </div>
  );
}

function TrayButton({
  icon,
  label,
  onClick,
  disabled,
  primary = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`tray-btn ${primary ? "tray-btn-primary" : ""}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
