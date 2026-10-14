"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Cell, InlineError, ListLabel } from "@/components/ui";

export interface ReferenceValues {
  stromCt: number;
  stromBaseMonth: number;
  gasCt: number;
  gasBaseMonth: number;
}

type Key = keyof ReferenceValues;

const FIELDS: Array<{ key: Key; title: string; label: string; unit: string }> = [
  { key: "stromCt", title: "Strom Arbeitspreis", label: "Strom ct/kWh", unit: "ct/kWh" },
  { key: "stromBaseMonth", title: "Strom Grundpreis", label: "Strom €/Monat", unit: "€/Monat" },
  { key: "gasCt", title: "Gas Arbeitspreis", label: "Gas ct/kWh", unit: "ct/kWh" },
  { key: "gasBaseMonth", title: "Gas Grundpreis", label: "Gas €/Monat", unit: "€/Monat" },
];

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

function same(a: ReferenceValues, b: ReferenceValues): boolean {
  return FIELDS.every(({ key }) => a[key] === b[key]);
}

async function put(body: object): Promise<string | null> {
  try {
    const response = await fetch("/api/provider-prices/reference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data.error ?? "Nicht gespeichert.";
  } catch {
    return "Keine Verbindung.";
  }
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
  const [open, setOpen] = useState(false);

  return (
    <section>
      <ListLabel>Bundesschnitt</ListLabel>
      <ul className="list">
        {FIELDS.map(({ key, title, unit }) => (
          <li key={key}>
            <Cell onClick={() => setOpen(true)} title={title} detail={`${show(reference[key])} ${unit}`} chevron />
          </li>
        ))}
      </ul>
      <p className="list-footer">Ab 3 % darüber teuer, ab 8 % sehr teuer.</p>
      {open && (
        <ReferenceSheet reference={reference} referenceDefault={referenceDefault} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}

function ReferenceSheet({
  reference,
  referenceDefault,
  onClose,
}: {
  reference: ReferenceValues;
  referenceDefault: ReferenceValues;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<Key, string>>({
    stromCt: show(reference.stromCt),
    stromBaseMonth: show(reference.stromBaseMonth),
    gasCt: show(reference.gasCt),
    gasBaseMonth: show(reference.gasBaseMonth),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(reset = false) {
    const body = reset
      ? { reset: true }
      : {
          stromCt: toNumber(values.stromCt),
          stromBaseMonth: toNumber(values.stromBaseMonth),
          gasCt: toNumber(values.gasCt),
          gasBaseMonth: toNumber(values.gasBaseMonth),
        };
    if (!reset && Object.values(body).some((n) => Number.isNaN(n))) {
      setError("Bitte nur Zahlen eintragen.");
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await put(body);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    // Rueckgaengig: die vorigen Werte wieder eintragen.
    const previous = { ...reference };
    toast(reset ? "Bundesschnitt zurückgesetzt" : "Bundesschnitt gespeichert", {
      action: {
        label: "Rückgängig",
        onClick: () => {
          void put(previous).then((undoFailure) => {
            toast(undoFailure ?? "Rückgängig gemacht");
            router.refresh();
          });
        },
      },
    });
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title="Bundesschnitt"
      subtitle="Grundversorgung"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="submit" form="reference-form" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? "Speichern …" : "Speichern"}
          </button>
        </div>
      }
    >
      <form
        id="reference-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="min-w-0">
              <label className="label" htmlFor={`reference-${key}`}>
                {label}
              </label>
              <input
                id={`reference-${key}`}
                className="field"
                inputMode="decimal"
                autoComplete="off"
                value={values[key]}
                onChange={(e) => setValues((current) => ({ ...current, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-plain btn-sm mt-4"
          disabled={busy || same(reference, referenceDefault)}
          onClick={() => void save(true)}
        >
          Zurücksetzen
        </button>
      </form>
    </Sheet>
  );
}
