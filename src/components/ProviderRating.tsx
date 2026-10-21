import type { PriceInfo, ProviderInfo } from "@/lib/energy/provider";
import { PRICE_LEVELS, type PriceStep } from "@/lib/energy/rating";
import { Cell, euro } from "./ui";
import { IconBolt, IconFlame } from "./icons";

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

/** Kompakte Preiszeilen mit eindeutiger Energieart und zugehoerigem Versorger. */
export function ProviderLine({ info, className = "" }: { info: ProviderInfo | null; className?: string }) {
  if (!info) {
    return (
      <p className={`flex items-center gap-2 text-footnote text-muted ${className}`}>
        <IconBolt className="h-4 w-4 shrink-0" />
        Noch kein Grundversorger-Preis
      </p>
    );
  }
  const products = [
    { label: "Strom", price: info.strom, provider: info.provider, Icon: IconBolt },
    { label: "Gas", price: info.gas, provider: info.gasProvider || info.provider, Icon: IconFlame },
  ];
  return (
    <div className={`min-w-0 space-y-1.5 text-footnote ${className}`}>
      {products.map(({ label, price, provider, Icon }) => price && (
        <p key={label} className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-1">
              <span className="font-semibold">{label}</span>
              <span className="whitespace-nowrap text-muted">· {ctLabel(price.ct)}</span>
            </span>
            <span className="block truncate text-caption text-muted" title={provider || "Grundversorger"}>
              {provider || "Grundversorger"}
            </span>
          </span>
          <PriceBadge step={price.step} size="sm" />
        </p>
      ))}
      {!info.strom && !info.gas && (
        <p className="flex min-w-0 items-center gap-2">
          <IconBolt className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate font-semibold">{info.provider || "Grundversorger"}</span>
        </p>
      )}
      {info.stale && <p className="pl-6 text-caption font-semibold text-warn">Preise prüfen · älter als 6 Monate</p>}
    </div>
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
          wrap={!info}
          subtitle={
            info ? (
              <>
                <span className="block truncate">
                  {[sourceNote(info), info.manual && info.validFrom ? `ab ${dateLabel(info.validFrom)}` : info.manual ? "Preisblatt" : "Tagesquelle"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {/* Das Verkaufsargument als eigene Zeile - rechts daneben war fuer Ort und Name kein Platz. */}
                {lead && (
                  <span className={`block truncate ${lead.step >= 3 ? "font-semibold text-accent-ink" : ""}`}>
                    {PRICE_LEVELS[lead.step].pitch}
                  </span>
                )}
              </>
            ) : (
              "Für diesen Ort ist kein Tarif hinterlegt."
            )
          }
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
