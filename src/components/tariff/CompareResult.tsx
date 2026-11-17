"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { IconPencil } from "@/components/icons";
import {
  breakEvenText,
  eur,
  headline,
  kwhLabel,
  periodPhrase,
  type Comparison,
  type CompareSparte,
  type RankedOffer,
  type TariffCost,
} from "@/lib/tariff-compare";
import type { ContractDraft } from "@/lib/tariff-memory";
import { contractLabel, tariffName } from "./ContractFields";
import { SketchView } from "./SketchView";

interface Row {
  key: string;
  title: string;
  subtitle: string;
  cost: TariffCost;
  offer: RankedOffer<ContractDraft> | null;
}

/**
 * Das Ergebnis zum Vorzeigen: oben die eine Aussage fuer den Kunden
 * ("Über 2 Jahre sparen Sie 109,20 €"), darunter alle Tarife samt aktuellem
 * Vertrag nach Gesamtkosten - mit 1. Jahr, Folgejahr, Abschlag und ab bzw.
 * bis zu welchem Verbrauch der Tarif guenstiger ist.
 *
 * Der Zeitraum laesst sich hier direkt umschalten: genau daran sieht der
 * Kunde, warum ein Bonus im ersten Jahr nicht alles ist.
 */
export function CompareResult({
  comparison,
  sparte,
  current,
  years,
  onYears,
}: {
  comparison: Comparison<ContractDraft>;
  sparte: CompareSparte;
  current: ContractDraft;
  years: number;
  onYears: (years: number) => void;
}) {
  const [sketching, setSketching] = useState(false);
  const best = comparison.best;
  const wins = best !== null && best.saving > 0.004;
  const currentTitle = contractLabel(current) || "Aktueller Vertrag";
  const name = (offer: RankedOffer<ContractDraft>) =>
    offer.meta.provider.trim() || offer.meta.name.trim() || `Tarif ${offer.rank}`;

  const rows: Row[] = [
    ...comparison.offers.map((offer) => ({
      key: offer.meta.key,
      title: name(offer),
      subtitle: offer.meta.provider.trim() ? tariffName(offer.meta) : "",
      cost: offer.cost,
      offer,
    })),
    { key: "current", title: currentTitle, subtitle: "", cost: comparison.current, offer: null },
  ].sort((a, b) => a.cost.total - b.cost.total || Number(a.offer === null) - Number(b.offer === null));

  // 1, 2, 3 Jahre und der eingestellte Zeitraum - mehr Segmente passen auf dem Handy nicht lesbar nebeneinander.
  const choices = [...new Set([1, 2, 3, years])].sort((a, b) => a - b);

  return (
    <div>
      <section className="hero" aria-live="polite">
        {wins ? (
          <>
            <p className="hero-lead-label">{headline(comparison.years)}</p>
            <p className="kpi hero-value mt-1">{eur(best.saving)}</p>
            <p className="mt-2 text-subhead text-ink-2">
              mit <span className="font-semibold text-ink">{contractLabel(best.meta) || name(best)}</span>
              {" "}statt {currentTitle}
            </p>
          </>
        ) : (
          <>
            <p className="hero-lead-label">{periodPhrase(comparison.years).replace(/^./, (c) => c.toUpperCase())}</p>
            <p className="mt-1 text-title-1 font-bold">Ihr aktueller Vertrag bleibt am günstigsten</p>
            {best && (
              <p className="mt-2 text-subhead text-ink-2">
                Der günstigste neue Tarif kostet {eur(-best.saving)} mehr.
              </p>
            )}
          </>
        )}
        <dl className="hero-stats mt-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="min-w-0">
            <dt className="hero-label truncate">Bisher</dt>
            <dd className="kpi truncate text-title-3">{eur(comparison.current.total)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="hero-label truncate">{wins ? "Neu" : "Günstigster neuer"}</dt>
            <dd className="kpi truncate text-title-3">{best ? eur(best.cost.total) : "–"}</dd>
          </div>
        </dl>
      </section>

      {/* Paper Selling: dieselbe Rechnung Zeile fuer Zeile zum Mitlesen, am Ende als Bild fuer den Kunden. */}
      <button type="button" className="btn btn-secondary btn-lg btn-block mt-3" onClick={() => setSketching(true)}>
        <IconPencil className="h-5 w-5" />
        Als Skizze zeigen
      </button>
      {sketching && (
        <SketchView comparison={comparison} sparte={sparte} current={current} onClose={() => setSketching(false)} />
      )}

      <div className="mt-4">
        <Segmented<string>
          ariaLabel="Vergleichszeitraum"
          value={String(years)}
          onChange={(value) => onYears(Number(value))}
          options={choices.map((n) => ({ value: String(n), label: n === 1 ? "1 Jahr" : `${n} Jahre` }))}
        />
      </div>

      <p className="list-label mt-6">
        Gesamtkosten {periodPhrase(comparison.years)} · {kwhLabel(comparison.kwh)} {sparte === "GAS" ? "Gas" : "Strom"} im Jahr
      </p>
      <ol className="list">
        {rows.map((row, index) => (
          <li key={row.key}>
            <ResultRow row={row} position={index + 1} years={comparison.years} cheapest={index === 0 && row.offer !== null && wins} />
          </li>
        ))}
      </ol>
      <p className="list-footer">
        Gerechnet mit gleichbleibenden Preisen; ein Bonus zählt einmal, im 1. Jahr. Der Grundversorger hat in der Regel
        keine Preisgarantie – seine Preise können jederzeit steigen.
      </p>
    </div>
  );
}

function ResultRow({ row, position, years, cheapest }: { row: Row; position: number; years: number; cheapest: boolean }) {
  const { offer, cost } = row;
  const facts = [
    years > 1 ? `1. Jahr ${eur(cost.firstYear)}` : null,
    years > 1 ? `Folgejahr ${eur(cost.followYear)}` : null,
    `Abschlag ${eur(cost.monthly)}`,
  ].filter(Boolean);
  // Das, was Portale verschweigen: im 1. Jahr guenstiger, danach teurer.
  const laterMore = offer !== null && offer.savingFollowYear < -0.004;

  return (
    <div className="cell items-start py-3">
      <span className="w-5 shrink-0 pt-0.5 text-subhead font-semibold text-muted tabular-nums" aria-hidden="true">
        {position}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-headline">
            {row.title}
            {row.subtitle && <span className="font-normal text-muted"> · {row.subtitle}</span>}
          </span>
          <span className="kpi shrink-0 text-headline">{eur(cost.total)}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {offer === null ? (
            <span className="badge">Aktuell</span>
          ) : offer.saving > 0.004 ? (
            <span className={`badge ${cheapest ? "badge-accent" : ""}`}>spart {eur(offer.saving)}</span>
          ) : (
            <span className="badge">{eur(-offer.saving)} teurer</span>
          )}
          {offer && <span className="text-footnote text-muted">{breakEvenText(offer.breakEven)}</span>}
        </span>
        <span className="mt-1 block text-footnote text-muted">{facts.join(" · ")}</span>
        {laterMore && offer && (
          <span className="mt-1 block text-footnote font-semibold text-warn">
            {offer.savingFirstYear > 0.004 ? `Im 1. Jahr ${eur(offer.savingFirstYear)} günstiger, ab dem 2. Jahr ` : "Ab dem 2. Jahr "}
            {eur(-offer.savingFollowYear)} pro Jahr teurer
          </span>
        )}
      </span>
    </div>
  );
}
