"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/Toast";
import { IconShare, IconX } from "@/components/icons";
import type { CompareSparte, Comparison } from "@/lib/tariff-compare";
import type { ContractDraft } from "@/lib/tariff-memory";
import { buildSketch } from "@/lib/tariff-sketch";
import { contractLabel } from "./ContractFields";
import { PaperSketch, SKETCH_STEPS } from "./PaperSketch";

/** Die Skizze als PNG - dreifach aufgeloest, damit sie auf dem Handy des Kunden scharf ist. */
async function sketchPng(svg: SVGSVGElement): Promise<Blob> {
  const box = svg.viewBox.baseVal;
  const scale = 3;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // Im Bild ist alles fertig geschrieben - ohne Klassen gibt es auch keine halb gezogenen Linien.
  clone.querySelectorAll("[class]").forEach((node) => node.removeAttribute("class"));
  clone.setAttribute("width", String(box.width * scale));
  clone.setAttribute("height", String(box.height * scale));
  const markup = new XMLSerializer().serializeToString(clone);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = box.width * scale;
  canvas.height = box.height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Kein Zeichenbereich");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Bild leer"))), "image/png"),
  );
}

/**
 * Paper Selling an der Tuer: die Rechnung als Skizze, Schritt fuer Schritt
 * aufgebaut - erst heute, dann neu mit Bonus, dann die Ersparnis je Jahr und
 * eingekreist das Ganze, zuletzt der Abschlag. Ein Tipp aufs Papier oder
 * "Weiter" schreibt die naechste Zeile. Am Ende als Bild teilen (WhatsApp,
 * Nachrichten …) - der Kunde hat die Rechnung danach auf seinem Handy.
 *
 * Vollbild ueber allem (auch ueber dem Blatt beim Klinken), Escape oder
 * das Kreuz schliesst.
 */
export function SketchView({
  comparison,
  sparte,
  current,
  initialKey,
  onClose,
}: {
  comparison: Comparison<ContractDraft>;
  sparte: CompareSparte;
  current: ContractDraft;
  /** Welcher Tarif gezeichnet wird - Standard: der guenstigste */
  initialKey?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [offerKey, setOfferKey] = useState(initialKey ?? comparison.best?.meta.key ?? "");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const offer = comparison.offers.find((entry) => entry.meta.key === offerKey) ?? comparison.best;

  const sketch = useMemo(() => {
    if (!offer) return null;
    const name = (draft: ContractDraft, fallback: string) => contractLabel(draft) || fallback;
    const currentBonus = comparison.current.firstYear < comparison.current.annual ? comparison.current.annual - comparison.current.firstYear : 0;
    return buildSketch(comparison, offer, { current: name(current, "Aktueller Vertrag"), offer: name(offer.meta, `Tarif ${offer.rank}`) }, sparte, currentBonus);
  }, [comparison, offer, current, sparte]);

  useEffect(() => {
    // Vor dem Blatt dahinter abfangen (capture): Escape schliesst nur die Skizze, nicht auch den Vergleich.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "ArrowRight" || event.key === " ") setStep((value) => Math.min(SKETCH_STEPS, value + 1));
      if (event.key === "ArrowLeft") setStep((value) => Math.max(1, value - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function share() {
    if (!svgRef.current || !sketch) return;
    setBusy(true);
    try {
      const blob = await sketchPng(svgRef.current);
      const file = new File([blob], "Tarifvergleich.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: sketch.title });
      } else {
        // Ohne Teilen-Menue (Rechner): als Datei sichern.
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Bild gespeichert");
      }
    } catch (error) {
      // Teilen abgebrochen ist kein Fehler.
      if (!(error instanceof DOMException && error.name === "AbortError")) toast("Bild konnte nicht erstellt werden");
    } finally {
      setBusy(false);
    }
  }

  if (!sketch || typeof document === "undefined") return null;
  const last = step >= SKETCH_STEPS;

  return createPortal(
    <div className="sketch-stage" role="dialog" aria-modal="true" aria-label="Skizze für den Kunden">
      <div className="sketch-bar">
        <button type="button" className="icon-btn -ml-2" onClick={onClose} aria-label="Skizze schließen">
          <IconX className="h-6 w-6" />
        </button>
        <span className="min-w-0 flex-1 truncate text-headline">Skizze</span>
        <span className="text-subhead text-muted tabular-nums" aria-live="polite">
          Schritt {step} von {SKETCH_STEPS}
        </span>
      </div>

      {comparison.offers.length > 1 && (
        <div className="chips flex shrink-0 gap-2 overflow-x-auto px-4 pb-3" role="group" aria-label="Tarif für die Skizze">
          {comparison.offers.map((entry) => (
            <button
              key={entry.meta.key}
              type="button"
              className="chip"
              aria-pressed={entry.meta.key === offer?.meta.key}
              onClick={() => setOfferKey(entry.meta.key)}
            >
              {entry.meta.provider.trim() || entry.meta.name.trim() || `Tarif ${entry.rank}`}
            </button>
          ))}
        </div>
      )}

      {/* Aufs Papier tippen schreibt die naechste Zeile - eine Hand haelt das Handy, die andere zeigt. */}
      <div className="sketch-scroll">
        <button
          type="button"
          className="sketch-paper"
          onClick={() => setStep((value) => Math.min(SKETCH_STEPS, value + 1))}
          aria-label={last ? "Skizze vollständig" : "Nächste Zeile schreiben"}
        >
          <PaperSketch ref={svgRef} sketch={sketch} step={step} />
        </button>
      </div>

      <div className="sketch-actions">
        {last ? (
          <>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(1)}>
              Von vorn
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => void share()} disabled={busy}>
              <IconShare className="h-5 w-5" />
              {busy ? "Bild …" : "Als Bild teilen"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => (step === 1 ? setStep(SKETCH_STEPS) : setStep(step - 1))}
            >
              {step === 1 ? "Alles zeigen" : "Zurück"}
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep(step + 1)}>
              Weiter
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
