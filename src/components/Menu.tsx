"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconMore } from "./icons";

/**
 * Ein Knopf mit kleinem Glas-Menue darunter - fuer Aktionen, die man selten
 * braucht und die keinen Platz in der Zeile belegen sollen. Schliesst beim
 * Tippen daneben, mit Escape und nach der Auswahl.
 */
export function Menu({
  label,
  children,
  trigger,
  className = "",
}: {
  label: string;
  children: ReactNode;
  /** Eigenes Zeichen statt der drei Punkte. */
  trigger?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        items[(next + items.length) % items.length]?.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && ref.current) {
      // Nahe am unteren Rand geht das Menue nach oben auf.
      const rect = ref.current.getBoundingClientRect();
      setUp(window.innerHeight - rect.bottom < 280);
    }
    setOpen((value) => !value);
  }

  return (
    <div ref={ref} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={toggle}
      >
        {trigger ?? <IconMore className="h-5 w-5" />}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={`menu right-0 ${up ? "bottom-full mb-2 origin-bottom-right" : "top-full mt-2"}`}
          onClick={() => setOpen(false)}
        >
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
  href,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  tone?: "danger";
  href?: string;
}) {
  if (href) {
    return (
      <a role="menuitem" className="menu-item" data-tone={tone} href={href}>
        {icon}
        {children}
      </a>
    );
  }
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
