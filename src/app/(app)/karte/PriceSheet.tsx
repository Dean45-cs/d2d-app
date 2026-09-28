"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Note, Segmented, euro } from "@/components/ui";
import { IconInfo, IconSearch } from "@/components/icons";
import { PriceBadge } from "@/components/ProviderRating";
import { findCity } from "@/lib/energy/cities";
import { referenceStep, type Energy } from "@/lib/energy/rating";
import { checkPrice, parseNumber } from "@/lib/energy/table";
import { numberText, sheetSearch, type PriceDraft } from "./data";

export interface SavedPrice {
  postalCode: string;
  city: string;
  located: boolean;
}

type BaseUnit = "month" | "year";

/**
 * Preis eines Grundversorgers eintragen: Preisblatt suchen, vier Zahlen
 * abtippen, fertig. Die Bewertung erscheint schon beim Tippen - ein Tippfehler
 * ("385" statt "38,5") faellt so sofort auf.
 */
export function PriceSheet({
  draft,
  reference,
  consumption,
  onClose,
  onSaved,
}: {
  draft: PriceDraft;
  reference: Record<Energy, number>;
  consumption: Record<Energy, number>;
  onClose: () => void;
  onSaved: (saved: SavedPrice) => void;
}) {
  const [form, setForm] = useState<PriceDraft>(draft);
  // Viele Preisblaetter nennen den Grundpreis pro Jahr - dann nicht selbst rechnen muessen.
  const [unit, setUnit] = useState<BaseUnit>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestion = findCity(form.postalCode, form.city)?.provider ?? "";

  function set<K extends keyof PriceDraft>(key: K, value: PriceDraft[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Anderer Ort: die Lage bestimmt der Server neu.
      if (key === "postalCode" || key === "city") {
        next.lat = null;
        next.lng = null;
      }
      return next;
    });
  }

  /** Umschalten rechnet schon Eingetragenes mit um - beim Bearbeiten stehen Monatswerte da. */
  function switchUnit(next: BaseUnit) {
    if (next === unit) return;
    const factor = next === "year" ? 12 : 1 / 12;
    const convert = (value: string) => {
      const n = parseNumber(value);
      return n === null || Number.isNaN(n) ? value : numberText(Math.round(n * factor * 100) / 100, 2);
    };
    setForm((current) => ({
      ...current,
      stromBaseMonth: convert(current.stromBaseMonth),
      gasBaseMonth: convert(current.gasBaseMonth),
    }));
    setUnit(next);
  }

  /** Grundpreis pro Monat, wie ihn die App speichert. */
  function perMonth(value: string): string | number | null {
    if (unit === "month") return value;
    const n = parseNumber(value);
    // Ungerundet: gespeichert wird wieder der Jahresbetrag (mal 12).
    return n === null || Number.isNaN(n) ? value : n / 12;
  }

  function preview(energy: Energy): { year: number; delta: number } | null {
    const ct = parseNumber(energy === "strom" ? form.stromCt : form.gasCt);
    const base = parseNumber(perMonth(energy === "strom" ? form.stromBaseMonth : form.gasBaseMonth));
    if (ct === null || Number.isNaN(ct) || ct < 3 || ct > 150) return null;
    const year = Math.round((ct / 100) * consumption[energy] + (base !== null && !Number.isNaN(base) ? base * 12 : 0));
    return { year, delta: year - reference[energy] };
  }

  async function save() {
    const body = {
      ...form,
      stromBaseMonth: perMonth(form.stromBaseMonth),
      gasBaseMonth: perMonth(form.gasBaseMonth),
    };
    const checked = checkPrice(body);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Der Preis konnte nicht gespeichert werden.");
        return;
      }
      onSaved({ postalCode: data.postalCode, city: checked.value.city, located: data.located });
    } catch {
      setError("Keine Verbindung – bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const unitLabel = unit === "month" ? "€/Monat" : "€/Jahr";
  const place = [form.postalCode, form.city].filter(Boolean).join(" ");

  return (
    <Sheet
      title={place ? `Preis für ${place}` : "Preis eintragen"}
      subtitle="Werte vom Preisblatt abtippen – brutto, inkl. MwSt."
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="text-[12px] font-semibold text-danger">{error}</p>}
          <button type="button" className="btn btn-primary w-full" onClick={save} disabled={busy}>
            {busy ? "Speichern …" : "Speichern"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <label className="block">
            <span className="label">PLZ</span>
            <input
              className="input tabular-nums"
              inputMode="numeric"
              maxLength={5}
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Ort</span>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </label>
        </div>

        <div>
          <label className="label" htmlFor="pp-provider">Grundversorger Strom</label>
          <input
            id="pp-provider"
            className="input"
            placeholder="z. B. Stadtwerke Kiel"
            value={form.provider}
            onChange={(e) => set("provider", e.target.value)}
          />
          {!form.provider.trim() && suggestion && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-pill mt-1.5"
              onClick={() => set("provider", suggestion)}
            >
              Vorschlag: {suggestion}
            </button>
          )}
        </div>

        {(form.provider || form.city) && (
          <Note icon={<IconSearch className="h-4 w-4" />}>
            Preisblatt suchen:{" "}
            <a
              className="font-semibold text-tint"
              href={sheetSearch(form.provider, form.city, "Strom")}
              target="_blank"
              rel="noreferrer"
            >
              Strom
            </a>
            {" · "}
            <a
              className="font-semibold text-tint"
              href={sheetSearch(form.gasProvider || form.provider, form.city, "Gas")}
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

        <div className="flex items-center justify-between gap-3">
          <span className="muted text-[12px]">Grundpreis steht auf dem Blatt pro</span>
          <Segmented<BaseUnit>
            ariaLabel="Grundpreis pro"
            value={unit}
            onChange={switchUnit}
            options={[
              { value: "month", label: "Monat" },
              { value: "year", label: "Jahr" },
            ]}
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-semibold">Strom</legend>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Arbeitspreis ct/kWh" value={form.stromCt} onChange={(v) => set("stromCt", v)} />
            <NumberField label={`Grundpreis ${unitLabel}`} value={form.stromBaseMonth} onChange={(v) => set("stromBaseMonth", v)} />
          </div>
          <Preview result={preview("strom")} reference={reference.strom} />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-semibold">Gas</legend>
          <input
            className="input"
            aria-label="Grundversorger Gas"
            placeholder="Grundversorger Gas – leer = derselbe"
            value={form.gasProvider}
            onChange={(e) => set("gasProvider", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Arbeitspreis ct/kWh" value={form.gasCt} onChange={(v) => set("gasCt", v)} />
            <NumberField label={`Grundpreis ${unitLabel}`} value={form.gasBaseMonth} onChange={(v) => set("gasBaseMonth", v)} />
          </div>
          <Preview result={preview("gas")} reference={reference.gas} />
        </fieldset>

        <div className="grid grid-cols-[9.5rem_1fr] gap-2">
          <label className="block">
            <span className="label">Gültig ab</span>
            <input
              type="date"
              className="input"
              value={form.validFrom}
              onChange={(e) => set("validFrom", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="label">Link zum Preisblatt</span>
            <input
              className="input"
              inputMode="url"
              placeholder="https://…"
              value={form.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
            />
          </label>
        </div>

        <p className="muted flex gap-1.5 text-[11px]">
          <IconInfo className="h-3.5 w-3.5 shrink-0" />
          Mindestens Strom oder Gas ausfüllen. Der Link ist der Beleg, falls an der Tür jemand
          nachfragt.
        </p>
      </div>
    </Sheet>
  );
}

/** Was der eingetippte Preis fuer den Musterhaushalt bedeutet. */
function Preview({
  result,
  reference,
}: {
  result: { year: number; delta: number } | null;
  reference: number;
}) {
  if (!result) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="muted tabular-nums">
        {euro(result.year)} im Jahr ·{" "}
        <span
          className="font-semibold"
          style={{ color: result.delta > 0 ? "var(--danger-ink)" : "var(--ok-ink)" }}
        >
          {result.delta > 0 ? "+" : ""}
          {euro(result.delta)}
        </span>{" "}
        ggü. Bundesschnitt
      </span>
      <PriceBadge step={referenceStep(result.year, reference)} size="sm" />
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
