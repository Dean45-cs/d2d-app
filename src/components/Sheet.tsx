"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons";
import { powerSaving } from "@/lib/power";

interface Props {
  /** Ueberschrift - kurz, in der Sprache der Tuer. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Schliessen ueber Schleier, Kreuz, Escape und Herunterziehen. */
  onClose: () => void;
  children: ReactNode;
  /** Bleibt unten stehen - dort sitzt die Hauptaktion. */
  footer?: ReactNode;
  /** Zusaetzlicher Knopf rechts neben dem Titel. */
  action?: ReactNode;
  /** Breite auf dem iPad/Rechner. */
  width?: "md" | "lg";
}

const CLOSE_MS = 220;
/** Ab hier mittiger Dialog statt Blatt von unten - wie "md" in globals.css (iPad mini hochkant). */
const IPAD = "(min-width: 744px)";
/** So viel muss verdeckt sein, damit es eine Bildschirmtastatur ist (nicht nur die Leiste einer echten). */
const KEYBOARD_MIN = 120;

/**
 * Ein Blatt aus Glas, das von unten hereingleitet.
 *
 * Auf dem Handy schwebt es knapp ueber dem unteren Rand - dort, wo der
 * Daumen ist - und laesst sich am Griff nach unten wegziehen. Auf iPad und
 * Rechner wird daraus ein mittiger Dialog. Inhalt rollt fuer sich, Kopf
 * und Fuss bleiben stehen.
 */
export function Sheet({ title, subtitle, onClose, children, footer, action, width = "md" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  /** Sichtbarer Teil ueber der Bildschirmtastatur - null, solange keine offen ist. */
  const [visible, setVisible] = useState<{ top: number; height: number; below: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; t: number; fromBody: boolean } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const requestClose = useCallback(() => {
    setClosing((already) => {
      if (already) return already;
      const reduce =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        powerSaving() ||
        document.documentElement.dataset.motion === "off";
      window.setTimeout(() => closeRef.current(), reduce ? 0 : CLOSE_MS);
      return true;
    });
  }, []);

  useEffect(() => setMounted(true), []);

  // Escape schliesst, der Hintergrund rollt nicht mit, der Fokus kommt
  // danach dorthin zurueck, wo er war.
  useEffect(() => {
    if (!mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sheetRef.current?.querySelector<HTMLElement>(
      "[autofocus], input:not([type=hidden]), textarea, select",
    );
    if (first && window.matchMedia(IPAD).matches) first.focus();
    else sheetRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [mounted, requestClose]);

  /*
   * Bildschirmtastatur: iOS verkleinert nur den sichtbaren Bereich, nicht das
   * Fenster. Ohne Nachfuehren laegen Telefonfeld und "Speichern" unter der
   * Tastatur - auf dem iPad mitten im mittigen Dialog. So rueckt das Blatt in
   * den sichtbaren Teil, das Feld mit dem Fokus bleibt im Blick.
   */
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!mounted || !viewport) return;
    let frame = 0;
    const fit = () => {
      const covered = window.innerHeight - viewport.height;
      const next =
        covered > KEYBOARD_MIN
          ? { top: viewport.offsetTop, height: viewport.height, below: Math.max(0, covered - viewport.offsetTop) }
          : null;
      // Beim Rollen meldet iOS dieselben Masse oft mehrfach - dann nicht neu zeichnen.
      setVisible((old) =>
        old && next && old.top === next.top && old.height === next.height && old.below === next.below ? old : next,
      );
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (covered > KEYBOARD_MIN && focused instanceof HTMLElement && sheetRef.current?.contains(focused)) {
          focused.scrollIntoView({ block: "nearest" });
        }
      });
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
    };
  }, [mounted]);

  /* ---------------------------- Herunterziehen --------------------------- */

  function onPointerDown(event: React.PointerEvent) {
    if (window.matchMedia(IPAD).matches) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a, [data-no-drag]")) return;
    const fromBody = Boolean(bodyRef.current?.contains(target));
    // Im Inhalt nur ziehen, wenn er ganz oben steht - sonst rollt er.
    if (fromBody && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    start.current = { y: event.clientY, t: performance.now(), fromBody };
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!start.current) return;
    const delta = event.clientY - start.current.y;
    if (delta <= 0) {
      setDrag(0);
      return;
    }
    if (start.current.fromBody && delta < 8) return;
    setDrag(delta);
  }

  function onPointerUp(event: React.PointerEvent) {
    if (!start.current) return;
    const delta = event.clientY - start.current.y;
    const velocity = delta / Math.max(1, performance.now() - start.current.t);
    start.current = null;
    if (delta > 120 || (delta > 40 && velocity > 0.6)) requestClose();
    else setDrag(0);
  }

  if (!mounted) return null;

  const dragging = drag > 0;
  const style = {
    ...(visible && {
      "--visible-top": `${visible.top}px`,
      "--visible-height": `${visible.height}px`,
      "--keyboard-below": `${visible.below}px`,
    }),
    ...(dragging && { transform: `translateY(${drag}px)`, transition: "none" }),
  } as CSSProperties;
  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="scrim" data-closing={closing || undefined} onClick={requestClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`sheet ${width === "lg" ? "sheet-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-closing={closing || undefined}
        data-keyboard={visible ? "" : undefined}
        style={style}
      >
        <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
          <span className="sheet-grip" />
        </div>

        <div className="flex items-start gap-2 px-4 pb-2 pt-2 md:pt-4">
          <div className="min-w-0 flex-1 pl-1 pt-2">
            <h2 className="text-title-3">{title}</h2>
            {subtitle && <p className="mt-1 text-subhead text-muted">{subtitle}</p>}
          </div>
          {action}
          <button type="button" onClick={requestClose} className="icon-btn icon-btn-fill" aria-label="Schließen">
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={bodyRef}
          className={`sheet-body flex-1 px-4 ${footer ? "pb-4" : "pb-6"}`}
        >
          {children}
        </div>

        {footer && (
          <div className="border-t border-separator px-4 pb-4 pt-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
