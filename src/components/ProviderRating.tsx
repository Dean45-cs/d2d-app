import type { PriceInfo, ProviderInfo } from "@/lib/energy/provider";
import { PRICE_LEVELS, type PriceStep } from "@/lib/energy/rating";
import { Cell, euro } from "./ui";
import { IconBolt } from "./icons";

/*
 * Grundversorger eines Ortes samt Preis und Einstufung. Ohne Hooks: laeuft
 * in Server-Seiten genauso wie an der Tuer im Browser.
 *
 * Die Einstufung ist ein Verkaufsargument: je teurer der Grundversorger,
 * desto staerker das Gruen (Skala in brand.css) - und immer mit Wort und
 * Balkenzahl, nie nur mit Farbe.
 */

function ctLabel(value: number): string {
  return `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} ct/kWh`;
}

/** Fuenf Balken wie eine Empfangsanzeige: je mehr, desto teurer (in Schriftfarbe). */
export function PriceMeter({ step }: { step: PriceStep }) {
  return (
    <span
      className="inline-flex items-end gap-0.5"
      role="img"
      aria-label={`Preisstufe ${step + 1} von 5: ${PRICE_LEVELS[step].label}`}
    >
      {[5, 7, 9, 11, 13].map((height, index) => (
        <span
          key={index}
          className={`w-0.75 rounded-xs ${index <= step ? "bg-current" : "bg-fill-strong"}`}
          style={{ height }}
        />
      ))}
    </span>
  );
}

/** Plakette "teuer" mit Anzeige - getoent, sobald es ein Argument ist. */
export function PriceBadge({ step, size = "md" }: { step: PriceStep; size?: "sm" | "md" }) {
  return (
    <span className={`badge ${step >= 3 ? "badge-accent" : ""} ${size === "sm" ? "" : "min-h-7 px-3"}`}>
      <PriceMeter step={step} />
      {PRICE_LEVELS[step].label}
    </span>
  );
}

/** Woher der Preis stammt, wenn nicht aus derselben PLZ. */
function sourceNote(info: ProviderInfo): string {
  if (info.match === "nearby") {
    return `aus ${info.city}${info.distanceKm !== null ? ` (${info.distanceKm} km)` : ""}`;
  }
  if (info.match === "region") return `aus ${info.plz} ${info.city}`;
  return `${info.plz} ${info.city}`;
}

function dateLabel(value: string): string {
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : value;
}

/** Kompakte Zeile: Name, Strompreis, Einstufung. */
export function ProviderLine({ info, className = "" }: { info: ProviderInfo | null; className?: string }) {
  if (!info) {
    return (
      <p className={`flex items-center gap-2 text-footnote text-muted ${className}`}>
        <IconBolt className="h-4 w-4 shrink-0" />
        Noch kein Grundversorger-Preis
      </p>
    );
  }
  const price = info.strom ?? info.gas;
  return (
    <p className={`flex min-w-0 items-center gap-2 text-footnote ${className}`}>
      <IconBolt className="h-4 w-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{info.provider || "Grundversorger"}</span>
        {price && <span className="text-muted"> · {ctLabel(price.ct)}</span>}
        {info.stale && <span className="font-semibold text-warn"> · prüfen</span>}
      </span>
      {price && <PriceBadge step={price.step} size="sm" />}
    </p>
  );
}

function PriceRow({ label, price }: { label: string; price: PriceInfo | null }) {
  if (!price) return <Cell title={label} detail="keine Daten" />;
  return (
    <Cell
      title={label}
      subtitle={`${ctLabel(price.ct)} · ${euro(price.year)} im Jahr`}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <PriceBadge step={price.step} size="sm" />
          <span className={`text-caption font-semibold ${price.delta > 0 ? "text-accent-ink" : "text-muted"}`}>
            {price.delta > 0 ? "+" : ""}
            {euro(price.delta)} ggü. Schnitt
          </span>
        </span>
      }
    />
  );
}

/**
 * Grundversorger als gruppierte Liste: Name und Herkunft, Strom und Gas mit
 * Arbeitspreis und Jahreskosten, auf Wunsch ein Verweis zum Eintragen.
 */
export function ProviderSummary({
  info,
  editHref,
}: {
  info: ProviderInfo | null;
  /** Nur mit "Preise pflegen": eintragen oder ersetzen. */
  editHref?: string;
}) {
  const lead = info?.strom ?? info?.gas ?? null;
  return (
    <ul className="list">
      <li>
        <Cell
          icon={
            <span className="glyph">
              <IconBolt className="h-4 w-4" />
            </span>
          }
          title={info ? info.provider || "Grundversorger unbekannt" : "Noch kein Preis"}
          subtitle={
            info
              ? [sourceNote(info), info.manual && info.validFrom ? `ab ${dateLabel(info.validFrom)}` : info.manual ? "Preisblatt" : "Tagesquelle"]
                  .filter(Boolean)
                  .join(" · ")
              : "Für diesen Ort ist kein Tarif hinterlegt."
          }
          detail={lead ? PRICE_LEVELS[lead.step].pitch : undefined}
        />
      </li>
      {info && (
        <>
          <li>
            <PriceRow label="Strom" price={info.strom} />
          </li>
          <li>
            <PriceRow label={info.gasProvider ? `Gas · ${info.gasProvider}` : "Gas"} price={info.gas} />
          </li>
        </>
      )}
      {info?.stale && (
        <li>
          <Cell title="Älter als ein halbes Jahr" subtitle="Mit dem aktuellen Preisblatt prüfen" tone="danger" />
        </li>
      )}
      {info?.manual && info.sourceUrl && (
        <li>
          <Cell href={info.sourceUrl} external title="Preisblatt" />
        </li>
      )}
      {editHref && (!info || !info.manual || info.match === "nearby" || info.match === "region") && (
        <li>
          <Cell href={editHref} title={info ? "Preis für diesen Ort eintragen" : "Preis eintragen"} tone="accent" />
        </li>
      )}
    </ul>
  );
}
