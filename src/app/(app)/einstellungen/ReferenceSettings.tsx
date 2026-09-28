"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ReferenceValues {
  stromCt: number;
  stromBaseMonth: number;
  gasCt: number;
  gasBaseMonth: number;
}

/** "38,5" oder "38.5" -> 38.5; leer bleibt leer. */
function toNumber(value: string): number | null {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function show(value: number): string {
  return value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/**
 * Vergleichswert fuer die Bewertung: der Bundesdurchschnitt der
 * Grundversorgung. Daran misst die App jeden eingetragenen Preis.
 */
export function ReferenceSettings({
  reference,
  referenceDefault,
}: {
  reference: ReferenceValues;
  referenceDefault: ReferenceValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState({
    stromCt: show(reference.stromCt),
    stromBaseMonth: show(reference.stromBaseMonth),
    gasCt: show(reference.gasCt),
    gasBaseMonth: show(reference.gasBaseMonth),
  });
  const [message, setMessage] = useState<string | null>(null);

  async function save(reset = false) {
    const body = reset
      ? { reset: true }
      : {
          stromCt: toNumber(ref.stromCt),
          stromBaseMonth: toNumber(ref.stromBaseMonth),
          gasCt: toNumber(ref.gasCt),
          gasBaseMonth: toNumber(ref.gasBaseMonth),
        };
    if (!reset && Object.values(body).some((n) => Number.isNaN(n))) {
      setMessage("Bitte nur Zahlen eintragen.");
      return;
    }
    const response = await fetch("/api/provider-prices/reference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Nicht gespeichert.");
      return;
    }
    if (reset) {
      setRef({
        stromCt: show(referenceDefault.stromCt),
        stromBaseMonth: show(referenceDefault.stromBaseMonth),
        gasCt: show(referenceDefault.gasCt),
        gasBaseMonth: show(referenceDefault.gasBaseMonth),
      });
    }
    setMessage("Gespeichert.");
    router.refresh();
  }

  return (
    <div className="mt-4 border-t pt-3 hairline">
      <button type="button" className="link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Vergleichswert ausblenden" : "Vergleichswert für die Bewertung anpassen"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="muted text-[12px]">
            Jeder Preis wird am Bundesdurchschnitt der Grundversorgung gemessen: ab 8 % darüber
            „sehr teuer“, ab 3 % „teuer“. Voreinstellung: Stand September 2026 (Check24/Verivox).
            Einmal im Jahr prüfen.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Strom ct/kWh" value={ref.stromCt} onChange={(v) => setRef({ ...ref, stromCt: v })} />
            <NumberField label="Strom €/Monat" value={ref.stromBaseMonth} onChange={(v) => setRef({ ...ref, stromBaseMonth: v })} />
            <NumberField label="Gas ct/kWh" value={ref.gasCt} onChange={(v) => setRef({ ...ref, gasCt: v })} />
            <NumberField label="Gas €/Monat" value={ref.gasBaseMonth} onChange={(v) => setRef({ ...ref, gasBaseMonth: v })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save()}>
              Speichern
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(true)}>
              Zurücksetzen
            </button>
            {message && <span className="muted text-[12px]">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="input tabular-nums"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
