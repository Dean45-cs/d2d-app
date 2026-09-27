"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Note } from "@/components/ui";
import { IconBolt, IconInfo, IconPencil, IconPlus, IconSearch, IconX } from "@/components/icons";

export interface PriceRow {
  id: number;
  postal_code: string;
  city: string;
  provider: string;
  gas_provider: string;
  lat: number | null;
  lng: number | null;
  strom_ct_kwh: number | null;
  /** Euro pro Monat (fuer das Formular umgerechnet) */
  strom_base_month: number | null;
  gas_ct_kwh: number | null;
  gas_base_month: number | null;
  valid_from: string;
  source_url: string;
  updated_at: string;
  stale: boolean;
}

/** Ort eines Gebiets, fuer den noch kein echter Preis eingetragen ist. */
export interface Missing {
  postal_code: string;
  city: string;
  territories: string[];
  lat: number | null;
  lng: number | null;
  /** Vorschlag aus der Staedteliste - bitte mit dem Preisblatt pruefen */
  provider: string;
}

export interface ReferenceValues {
  stromCt: number;
  stromBaseMonth: number;
  gasCt: number;
  gasBaseMonth: number;
}

interface Draft {
  postalCode: string;
  city: string;
  provider: string;
  gasProvider: string;
  stromCt: string;
  stromBaseMonth: string;
  gasCt: string;
  gasBaseMonth: string;
  validFrom: string;
  sourceUrl: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY: Draft = {
  postalCode: "",
  city: "",
  provider: "",
  gasProvider: "",
  stromCt: "",
  stromBaseMonth: "",
  gasCt: "",
  gasBaseMonth: "",
  validFrom: "",
  sourceUrl: "",
  lat: null,
  lng: null,
};

/** "38,5" oder "38.5" -> 38.5; leer bleibt leer. */
function toNumber(value: string): number | null {
  const text = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function show(value: number | null, digits = 2): string {
  return value === null ? "" : value.toLocaleString("de-DE", { maximumFractionDigits: digits });
}

function dateLabel(value: string): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : value;
}

/** Suche nach dem Preisblatt - jeder Grundversorger muss es online stellen. */
function sheetSearch(provider: string, city: string, energy: "Strom" | "Gas"): string {
  const query = `Grundversorgung ${energy} Preisblatt ${provider} ${city}`.replace(/\s+/g, " ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function ProviderPriceSettings({
  prices,
  missing,
  reference,
  referenceDefault,
}: {
  prices: PriceRow[];
  missing: Missing[];
  reference: ReferenceValues;
  referenceDefault: ReferenceValues;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [ref, setRef] = useState({
    stromCt: show(reference.stromCt),
    stromBaseMonth: show(reference.stromBaseMonth),
    gasCt: show(reference.gasCt),
    gasBaseMonth: show(reference.gasBaseMonth),
  });
  const [refMessage, setRefMessage] = useState<string | null>(null);

  function open(next: Draft) {
    setError(null);
    setDraft(next);
  }

  function edit(row: PriceRow) {
    open({
      postalCode: row.postal_code,
      city: row.city,
      provider: row.provider,
      gasProvider: row.gas_provider,
      stromCt: show(row.strom_ct_kwh, 3),
      stromBaseMonth: show(row.strom_base_month),
      gasCt: show(row.gas_ct_kwh, 3),
      gasBaseMonth: show(row.gas_base_month),
      validFrom: row.valid_from,
      sourceUrl: row.source_url,
      lat: row.lat,
      lng: row.lng,
    });
  }

  async function save() {
    if (!draft) return;
    const numbers = {
      stromCt: toNumber(draft.stromCt),
      stromBaseMonth: toNumber(draft.stromBaseMonth),
      gasCt: toNumber(draft.gasCt),
      gasBaseMonth: toNumber(draft.gasBaseMonth),
    };
    if (Object.values(numbers).some((n) => Number.isNaN(n))) {
      setError("Bitte Preise nur als Zahl eintragen, z. B. 38,52.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, ...numbers }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Der Preis konnte nicht gespeichert werden.");
        return;
      }
      setDraft(null);
      router.refresh();
    } catch {
      setError("Keine Verbindung – bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: PriceRow) {
    if (!window.confirm(`Preis für ${row.postal_code} ${row.city} löschen?`)) return;
    await fetch(`/api/provider-prices/${row.id}`, { method: "DELETE" });
    router.refresh();
  }

  async function saveReference(reset = false) {
    const body = reset
      ? { reset: true }
      : {
          stromCt: toNumber(ref.stromCt),
          stromBaseMonth: toNumber(ref.stromBaseMonth),
          gasCt: toNumber(ref.gasCt),
          gasBaseMonth: toNumber(ref.gasBaseMonth),
        };
    if (!reset && Object.values(body).some((n) => Number.isNaN(n))) {
      setRefMessage("Bitte nur Zahlen eintragen.");
      return;
    }
    const response = await fetch("/api/provider-prices/reference", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setRefMessage(data.error ?? "Nicht gespeichert.");
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
    setRefMessage("Gespeichert.");
    router.refresh();
  }

  const field = (key: keyof Draft) => ({
    value: (draft?.[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => (d ? { ...d, [key]: e.target.value } : d)),
  });

  return (
    <section className="card mt-4 p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <IconBolt className="h-4 w-4 text-gas-500" />
          Grundversorger-Preise
        </h2>
        <button type="button" className="btn btn-ghost btn-sm btn-pill" onClick={() => open(EMPTY)}>
          <IconPlus className="h-4 w-4" />
          Ort
        </button>
      </div>
      <p className="muted mb-3 text-sm">
        Echte Preise für eure Orte – vom Preisblatt des Grundversorgers abgetippt. Jeder
        Grundversorger muss es auf seiner Website veröffentlichen. Eingetragene Werte gehen den
        Demo-Werten vor und erscheinen in Übersicht, Gebieten und beim Klinken.
      </p>

      {missing.length > 0 && (
        <div className="mb-4">
          <p className="muted mb-1.5 text-[11px] font-semibold uppercase tracking-wider">
            Eure Gebiete ohne echten Preis
          </p>
          <ul className="divide-y divide-[var(--line)] rounded-[var(--r-md)] border border-[var(--line)]">
            {missing.map((place) => (
              <li key={`${place.postal_code}-${place.city}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    {[place.postal_code, place.city].filter(Boolean).join(" ") || "Ohne Ortsangabe"}
                  </p>
                  <p className="muted truncate text-[11px]">
                    {place.territories.join(", ")}
                    {place.provider && ` · Vorschlag: ${place.provider}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-pill shrink-0"
                  onClick={() =>
                    open({
                      ...EMPTY,
                      postalCode: place.postal_code,
                      city: place.city,
                      provider: place.provider,
                      lat: place.lat,
                      lng: place.lng,
                    })
                  }
                >
                  Preis eintragen
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {prices.length > 0 ? (
        <ul className="divide-y divide-[var(--line)] rounded-[var(--r-md)] border border-[var(--line)]">
          {prices.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">
                  {row.postal_code} {row.city}
                  <span className="muted font-normal"> · {row.provider}</span>
                </p>
                <p className="muted text-[12px] tabular-nums">
                  {row.strom_ct_kwh !== null &&
                    `Strom ${show(row.strom_ct_kwh)} ct + ${show(row.strom_base_month)} €/Mon.`}
                  {row.strom_ct_kwh !== null && row.gas_ct_kwh !== null && " · "}
                  {row.gas_ct_kwh !== null &&
                    `Gas ${show(row.gas_ct_kwh)} ct + ${show(row.gas_base_month)} €/Mon.`}
                </p>
                <p className="muted text-[11px]">
                  {row.valid_from ? `gültig ab ${dateLabel(row.valid_from)} · ` : ""}
                  eingetragen {dateLabel(row.updated_at)}
                  {row.source_url && (
                    <>
                      {" · "}
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand-600"
                      >
                        Preisblatt
                      </a>
                    </>
                  )}
                </p>
                {row.stale && (
                  <p className="mt-1 text-[11px] font-semibold text-gas-600">
                    Älter als ein halbes Jahr – bitte mit dem aktuellen Preisblatt prüfen.
                  </p>
                )}
              </div>
              <button type="button" className="icon-btn shrink-0" onClick={() => edit(row)} aria-label="Bearbeiten">
                <IconPencil className="h-4 w-4" />
              </button>
              <button type="button" className="icon-btn shrink-0" onClick={() => remove(row)} aria-label="Löschen">
                <IconX className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-[13px]">Noch keine Preise eingetragen.</p>
      )}

      {/* ---------------------------- Vergleichswert ---------------------------- */}
      <div className="mt-4 border-t pt-3 hairline">
        <button
          type="button"
          className="text-[12px] font-semibold text-brand-600"
          onClick={() => setRefOpen((v) => !v)}
          aria-expanded={refOpen}
        >
          {refOpen ? "Vergleichswert ausblenden" : "Vergleichswert für die Bewertung anpassen"}
        </button>
        {refOpen && (
          <div className="mt-2 space-y-2">
            <p className="muted text-[12px]">
              Eingetragene Preise werden am Bundesdurchschnitt der Grundversorgung gemessen: ab 8 %
              darüber „sehr teuer“, ab 3 % „teuer“. Voreinstellung: Stand September 2026
              (Check24/Verivox). Einmal im Jahr prüfen.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Strom ct/kWh" value={ref.stromCt} onChange={(v) => setRef({ ...ref, stromCt: v })} />
              <NumberField label="Strom €/Monat" value={ref.stromBaseMonth} onChange={(v) => setRef({ ...ref, stromBaseMonth: v })} />
              <NumberField label="Gas ct/kWh" value={ref.gasCt} onChange={(v) => setRef({ ...ref, gasCt: v })} />
              <NumberField label="Gas €/Monat" value={ref.gasBaseMonth} onChange={(v) => setRef({ ...ref, gasBaseMonth: v })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveReference()}>
                Speichern
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => saveReference(true)}>
                Zurücksetzen
              </button>
              {refMessage && <span className="muted text-[12px]">{refMessage}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------ Formular ------------------------------- */}
      {draft && (
        <Sheet
          title={draft.postalCode ? `Preis für ${draft.postalCode} ${draft.city}` : "Grundversorger-Preis"}
          subtitle="Werte vom Preisblatt abtippen – brutto, inkl. MwSt."
          onClose={() => setDraft(null)}
          footer={
            <div className="space-y-2">
              {error && <p className="text-[12px] font-semibold text-signal-600">{error}</p>}
              <button type="button" className="btn btn-primary w-full" onClick={save} disabled={busy}>
                {busy ? "Speichern …" : "Speichern"}
              </button>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <div>
                <label className="label" htmlFor="pp-plz">PLZ</label>
                <input id="pp-plz" className="input" inputMode="numeric" maxLength={5} {...field("postalCode")} />
              </div>
              <div>
                <label className="label" htmlFor="pp-city">Ort</label>
                <input id="pp-city" className="input" {...field("city")} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="pp-provider">Grundversorger Strom</label>
              <input id="pp-provider" className="input" placeholder="z. B. Stadtwerke Kiel" {...field("provider")} />
            </div>

            {(draft.provider || draft.city) && (
              <Note icon={<IconSearch className="h-4 w-4" />}>
                Preisblatt suchen:{" "}
                <a
                  className="font-semibold text-brand-600"
                  href={sheetSearch(draft.provider, draft.city, "Strom")}
                  target="_blank"
                  rel="noreferrer"
                >
                  Strom
                </a>
                {" · "}
                <a
                  className="font-semibold text-brand-600"
                  href={sheetSearch(draft.gasProvider || draft.provider, draft.city, "Gas")}
                  target="_blank"
                  rel="noreferrer"
                >
                  Gas
                </a>
                <span className="block text-[11px]">
                  Den Namen des Grundversorgers auf dem Preisblatt prüfen – der Vorschlag kann
                  danebenliegen.
                </span>
              </Note>
            )}

            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Strom Arbeitspreis ct/kWh" value={draft.stromCt} onChange={(v) => setDraft({ ...draft, stromCt: v })} />
              <NumberField label="Strom Grundpreis €/Monat" value={draft.stromBaseMonth} onChange={(v) => setDraft({ ...draft, stromBaseMonth: v })} />
            </div>

            <div>
              <label className="label" htmlFor="pp-gasprovider">Grundversorger Gas (falls anders)</label>
              <input id="pp-gasprovider" className="input" placeholder="leer = derselbe" {...field("gasProvider")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Gas Arbeitspreis ct/kWh" value={draft.gasCt} onChange={(v) => setDraft({ ...draft, gasCt: v })} />
              <NumberField label="Gas Grundpreis €/Monat" value={draft.gasBaseMonth} onChange={(v) => setDraft({ ...draft, gasBaseMonth: v })} />
            </div>

            <div className="grid grid-cols-[9.5rem_1fr] gap-2">
              <div>
                <label className="label" htmlFor="pp-valid">Gültig ab</label>
                <input id="pp-valid" type="date" className="input" {...field("validFrom")} />
              </div>
              <div>
                <label className="label" htmlFor="pp-url">Link zum Preisblatt</label>
                <input id="pp-url" className="input" inputMode="url" placeholder="https://…" {...field("sourceUrl")} />
              </div>
            </div>

            <p className="muted flex gap-1.5 text-[11px]">
              <IconInfo className="h-3.5 w-3.5 shrink-0" />
              Steht der Grundpreis nur pro Jahr auf dem Blatt: durch 12 teilen. Mindestens Strom
              oder Gas ausfüllen.
            </p>
          </div>
        </Sheet>
      )}
    </section>
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
