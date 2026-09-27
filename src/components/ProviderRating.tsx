import type { PriceInfo, ProviderInfo } from "@/lib/energy/provider";
import { PRICE_LEVELS, PRICE_SCALE, type PriceStep } from "@/lib/energy/rating";
import { euro } from "./ui";
import { IconBolt } from "./icons";

/*
 * Grundversorger eines Gebiets samt Preis und Bewertung. Ohne Hooks und ohne
 * "use client": laeuft in Server-Seiten (Uebersicht, Gebiete) genauso wie auf
 * der Klinken-Seite im Browser.
 */

function ctLabel(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ct/kWh`;
}

/** Textfarbe einer Stufe: die Skalenfarbe, zur Schrift hin abgedunkelt - lesbar hell wie dunkel. */
function inkOf(step: PriceStep): string {
  return `color-mix(in srgb, ${PRICE_SCALE[step]} 72%, var(--ink))`;
}

/** Fuenf Balken wie eine Signalanzeige: je mehr und je roeter, desto teurer. */
export function PriceMeter({ step, size = "md" }: { step: PriceStep; size?: "sm" | "md" }) {
  const h = size === "sm" ? [5, 7, 9, 11, 13] : [6, 9, 12, 15, 18];
  const w = size === "sm" ? 3 : 4;
  return (
    <span
      className="inline-flex items-end gap-[2px]"
      role="img"
      aria-label={`Preisstufe ${step + 1} von 5: ${PRICE_LEVELS[step].label}`}
    >
      {h.map((height, index) => (
        <span
          key={index}
          style={{
            width: w,
            height,
            borderRadius: 2,
            background:
              index <= step
                ? PRICE_SCALE[step]
                : "color-mix(in srgb, var(--ink) 12%, transparent)",
          }}
        />
      ))}
    </span>
  );
}

/** Plakette "teuer" mit Anzeige. */
export function PriceBadge({ step, size = "md" }: { step: PriceStep; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"
      }`}
      style={{
        background: `color-mix(in srgb, ${PRICE_SCALE[step]} 16%, transparent)`,
        color: inkOf(step),
      }}
    >
      <PriceMeter step={step} size="sm" />
      {PRICE_LEVELS[step].label}
    </span>
  );
}

/** Woher der Preis stammt, wenn nicht aus derselben PLZ. */
function sourceNote(info: ProviderInfo): string | null {
  if (info.match === "nearby") {
    return `Preis aus ${info.city}${info.distanceKm !== null ? ` (${info.distanceKm} km)` : ""}`;
  }
  if (info.match === "region") return `Preis aus ${info.plz} ${info.city}`;
  return null;
}

/**
 * Kompakte Zeile fuer Listen: Name, Strompreis, Bewertung.
 * `info === null` zeigt ehrlich, dass nichts bekannt ist.
 */
export function ProviderLine({ info, className = "" }: { info: ProviderInfo | null; className?: string }) {
  if (!info) {
    return (
      <p className={`muted flex items-center gap-1.5 text-[12px] ${className}`}>
        <IconBolt className="h-3.5 w-3.5 shrink-0" />
        Grundversorger unbekannt
      </p>
    );
  }
  const price = info.strom ?? info.gas;
  return (
    <div className={`flex min-w-0 items-center gap-2 text-[12px] ${className}`}>
      <IconBolt className="h-3.5 w-3.5 shrink-0 text-gas-500" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{info.provider || "Grundversorger unbekannt"}</span>
        {price && (
          <span className="muted tabular-nums">
            {" · "}
            {ctLabel(price.ct)}
          </span>
        )}
      </span>
      {price && <PriceBadge step={price.step} size="sm" />}
    </div>
  );
}

function PriceRow({ label, price }: { label: string; price: PriceInfo | null }) {
  if (!price) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="muted text-[12px]">keine Daten</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="muted text-[12px] tabular-nums">
          {ctLabel(price.ct)} · {euro(price.year)} / Jahr
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PriceBadge step={price.step} />
        <span
          className="text-[11px] font-semibold tabular-nums"
          style={{ color: price.delta > 0 ? "var(--signal-600)" : "var(--energy-600)" }}
        >
          {price.delta > 0 ? "+" : ""}
          {euro(price.delta)} ggü. Median
        </span>
      </div>
    </div>
  );
}

/**
 * Ausfuehrliche Karte: Name des Grundversorgers, Strom und Gas mit
 * Arbeitspreis, Jahreskosten des Musterhaushalts und Bewertung.
 */
export function ProviderCard({
  info,
  title = "Grundversorger",
  className = "",
}: {
  info: ProviderInfo | null;
  title?: string;
  className?: string;
}) {
  const lead = info?.strom ?? info?.gas ?? null;
  const note = info ? sourceNote(info) : null;
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div
        className="flex items-start gap-3 px-4 pb-3 pt-4"
        style={
          lead
            ? {
                background: `linear-gradient(135deg, color-mix(in srgb, ${PRICE_SCALE[lead.step]} 14%, transparent), transparent 70%)`,
              }
            : undefined
        }
      >
        <span
          className="tile-icon h-10 w-10 shrink-0"
          style={{
            background: "color-mix(in srgb, var(--gas-500) 16%, transparent)",
            color: "var(--gas-600)",
          }}
          aria-hidden
        >
          <IconBolt className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="muted text-[11px] font-semibold uppercase tracking-wider">{title}</p>
          <p className="truncate text-[16px] font-bold">
            {info ? info.provider || "Name unbekannt" : "Nicht zugeordnet"}
          </p>
          {info ? (
            <p className="muted text-[12px]">
              {note ?? `${info.plz} ${info.city}`}
              {info.isDemo && " · Demo-Preise"}
            </p>
          ) : (
            <p className="muted text-[12px]">
              Für diesen Ort liegt kein Preis vor – PLZ und Ort im Gebiet prüfen.
            </p>
          )}
        </div>
        {lead && (
          <div className="shrink-0 text-right">
            <p className="text-[20px] font-bold leading-none tabular-nums">
              {lead.ct.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
              <span className="muted text-[11px] font-semibold"> ct</span>
            </p>
            <p className="mt-1 text-[11px] font-semibold" style={{ color: inkOf(lead.step) }}>
              {PRICE_LEVELS[lead.step].label}
            </p>
          </div>
        )}
      </div>
      {info && (
        <div className="divide-y divide-[var(--line)] px-4 pb-1">
          <PriceRow label="Strom" price={info.strom} />
          <PriceRow label="Gas" price={info.gas} />
        </div>
      )}
      {lead && (
        <p
          className="border-t px-4 py-2.5 text-[12px] font-medium"
          style={{ borderColor: "var(--line)", color: inkOf(lead.step) }}
        >
          {PRICE_LEVELS[lead.step].pitch}
        </p>
      )}
    </section>
  );
}
