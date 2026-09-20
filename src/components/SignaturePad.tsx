"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Unterschriftenfeld fuer den Auftrag an der Tuer.
 *
 * Bewusst wie Papier: weisser Grund, dunkle Tinte, Linie mit Kreuz. So ist
 * die Unterschrift spaeter auch in der Auftragsliste lesbar - egal ob die App
 * gerade hell oder dunkel dargestellt wird.
 *
 * Gezeichnet wird mit Pointer-Events, damit Finger, Stift und Maus denselben
 * Weg nehmen. `touch-action: none` verhindert, dass beim Unterschreiben die
 * Seite scrollt.
 */
export function SignaturePad({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  /* Getrennt vom Zustand: beim Loslassen zaehlt, ob wirklich gezeichnet wurde,
     und das steht im Ref schon vor dem naechsten Rendern fest. */
  const inked = useRef(false);
  const [empty, setEmpty] = useState(true);

  /** Aufloesung an die tatsaechliche Breite anpassen - sonst wird es krisselig. */
  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(240, Math.round(canvas.clientWidth));
    const height = Math.round(canvas.clientHeight);
    if (canvas.width === width * ratio && canvas.height === height * ratio) return;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  useEffect(() => {
    prepare();
    window.addEventListener("resize", prepare);
    return () => window.removeEventListener("resize", prepare);
  }, [prepare]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    inked.current = false;
    setEmpty(true);
    onChange("");
  }, [onChange]);

  /*
   * Der Aufrufer hat das Feld geleert (z. B. nach dem Speichern).
   *
   * Entscheidend ist der Wechsel des Wertes, nicht sein Zustand: waehrend des
   * Zeichnens ist er noch leer - die Unterschrift kommt erst beim Loslassen.
   * Ohne diese Unterscheidung wuerde sich das Feld mitten im Strich selbst
   * wieder wegwischen.
   */
  const previous = useRef(value);
  useEffect(() => {
    if (value === previous.current) return;
    previous.current = value;
    if (value === "") clear();
  }, [value, clear]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    prepare();
    drawing.current = true;
    last.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const from = last.current;
    if (!ctx || !from) return;
    const to = point(event);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    last.current = to;
    inked.current = true;
    if (empty) setEmpty(false);
  }

  function end(event?: React.PointerEvent<HTMLCanvasElement>) {
    // Die Erfassung des Zeigers ausdruecklich zurueckgeben: bleibt sie haengen,
    // landen auch die naechsten Tipps auf dem Feld statt auf den Knoepfen.
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (!canvas || !inked.current) return;
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Unterschrift des Kunden"
          role="img"
          className="h-36 w-full rounded-xl border bg-white"
          style={{ borderColor: "var(--line)", touchAction: "none" }}
        />
        {empty && (
          <div className="pointer-events-none absolute inset-x-4 bottom-5">
            <div className="h-px w-full" style={{ background: "#cbd5e1" }} />
            <p className="mt-1 text-center text-[11px] font-medium" style={{ color: "#94a3b8" }}>
              ✗ Hier mit dem Finger unterschreiben
            </p>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="muted text-[11px]">
          Der Kunde unterschreibt auf dem Gerät – die Unterschrift bleibt am Auftrag.
        </p>
        {!empty && (
          <button
            type="button"
            onClick={clear}
            className="muted shrink-0 text-[11px] font-semibold underline"
          >
            neu
          </button>
        )}
      </div>
    </div>
  );
}
