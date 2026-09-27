"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconMore } from "./icons";

/**
 * Drei Punkte, darunter ein kleines Menue - fuer Aktionen, die man selten
 * braucht und die nicht dauerhaft Platz in der Zeile belegen sollen.
 * Schliesst beim Tippen daneben, mit Escape und nach der Auswahl.
 */
export function Menu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <IconMore className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="menu right-0 top-full mt-1" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  tone,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  tone?: "danger";
}) {
  return (
    <button type="button" role="menuitem" className="menu-item" data-tone={tone} onClick={onSelect}>
      {icon}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}
