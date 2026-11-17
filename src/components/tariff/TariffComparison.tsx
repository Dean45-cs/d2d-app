"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { PageHeader, Segmented } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { IconMinus, IconPlus } from "@/components/icons";
import {
  COMPARE_SPARTE_LABEL,
  COMPARE_SPARTEN,
  DEFAULT_YEARS,
  MAX_YEARS,
  MIN_YEARS,
  TYPICAL_KWH,
  compareTariffs,
  eur,
  numberText,
  periodPhrase,
  readKwh,
  readPrice,
  type BaseUnit,
  type CompareSparte,
  type ComparePlace,
  type CompareTariffOption,
  type PriceCheck,
  type TariffPrice,
} from "@/lib/tariff-compare";
import {
  findPrice,
  loadDraft,
  recentPrices,
  rememberPrices,
  saveDraft,
  type CompareDraft,
  type ContractDraft,
  type RememberedPrice,
  type SparteDraft,
} from "@/lib/tariff-memory";
import { ContractFields, contractLabel } from "./ContractFields";
import { CompareResult } from "./CompareResult";

type Draft = Omit<CompareDraft, "savedAt">;
type View = "input" | "result";

let sequence = 0;
function newKey(): string {
  sequence += 1;
  return `c${Date.now().toString(36)}${sequence.toString(36)}`;
}

function emptyContract(unit: BaseUnit): ContractDraft {
  return { key: newKey(), provider: "", name: "", tariffId: null, unit, base: "", ct: "", bonus: "" };
}

/** Der Grundversorger vom Preisblatt als aktueller Vertrag - Grundpreis pro Jahr, wie gespeichert. */
function fromPlace(place: ComparePlace, sparte: CompareSparte): ContractDraft | null {
  const price = place.price[sparte];
  if (!price) return null;
  return {
    ...emptyContract("year"),
    provider: place.provider[sparte],
    ct: numberText(price.ct),
    base: price.baseYear === null ? "" : numberText(price.baseYear),
  };
}

function fromMemory(entry: Pick<RememberedPrice, "provider" | "name" | "baseYear" | "ct" | "bonus">, tariffId: number | null): ContractDraft {
  return {
    key: newKey(),
    provider: entry.provider,
    name: entry.name,
    tariffId,
    // Gemerkt wird pro Jahr - Portale zeigen den Grundpreis meist pro Monat, das Feld rechnet beim Umschalten um.
    unit: "year",
    base: entry.baseYear ? numberText(entry.baseYear) : "",
    ct: numberText(entry.ct),
    bonus: entry.bonus ? numberText(entry.bonus) : "",
  };
}

function freshSparte(place: ComparePlace | null, sparte: CompareSparte): SparteDraft {
  return {
    kwh: "",
    current: (place && fromPlace(place, sparte)) ?? emptyContract("year"),
    offers: [emptyContract("month")],
  };
}

function freshDraft(plz: string, place: ComparePlace | null, sparte: CompareSparte): Draft {
  return {
    sparte,
    years: DEFAULT_YEARS,
    plz,
    strom: freshSparte(place, "STROM"),
    gas: freshSparte(place, "GAS"),
  };
}

const sparteKey = (sparte: CompareSparte) => (sparte === "STROM" ? "strom" : "gas") as "strom" | "gas";

/** Ort auf der Tuer-Seite: Gebiet mit PLZ und Grundversorger. */
export interface CompareContext {
  plz: string;
  /** "Holstenstraße 12" - Untertitel des Blatts */
  label: string;
  place: ComparePlace | null;
}

/**
 * Tarifvergleich: aktueller Vertrag gegen einen oder mehrere neue Tarife,
 * ueber den ganzen Zeitraum gerechnet (src/lib/tariff-compare.ts).
 *
 * Zwei Ansichten: "Eingabe" fuer den Berater (mit Vorschau je Tarif, damit
 * Tippfehler sofort auffallen) und "Ergebnis" zum Vorzeigen. Beim Klinken
 * ein Blatt ueber der Tuer (`layout="sheet"`, auch ohne Netz), sonst eine
 * eigene Seite. Was eingetragen ist, bleibt auf dem Geraet stehen.
 */
export function TariffComparison({
  layout,
  tariffs,
  places,
  context,
  initialSparte = "STROM",
  onClose,
  onStartSale,
}: {
  layout: "page" | "sheet";
  tariffs: CompareTariffOption[];
  /** Bekannte Grundversorger (Seite) - auf der Tuer genuegt `context` */
  places: ComparePlace[];
  context?: CompareContext;
  initialSparte?: CompareSparte;
  onClose?: () => void;
  /** Beim Klinken: nach dem Vergleich gleich den Auftrag starten */
  onStartSale?: (sparte: CompareSparte) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() =>
    freshDraft(context?.plz ?? "", context?.place ?? null, initialSparte),
  );
  const [view, setView] = useState<View>("input");
  const [recent, setRecent] = useState<RememberedPrice[]>([]);
  /** Erst nach dem Lesen speichern - sonst ueberschriebe der leere Anfang das Gemerkte. */
  const [ready, setReady] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Ansicht gewechselt: oben beginnen - zum Vorzeigen steht die Ersparnis ganz oben.
  useEffect(() => {
    if (layout === "page") window.scrollTo({ top: 0 });
    else topRef.current?.scrollIntoView({ block: "start" });
  }, [view, layout]);

  // Gemerktes erst nach dem Einhaengen lesen - sonst passt das erste Bild nicht zum Server.
  useEffect(() => {
    if (ready) return;
    const saved = loadDraft();
    // Andere Tuer, anderer Ort: frisch mit dem Grundversorger von hier. Tarife einer PLZ bleiben stehen.
    if (saved && (!context || saved.plz === context.plz)) {
      const restored: Draft = { sparte: saved.sparte, years: saved.years, plz: saved.plz, strom: saved.strom, gas: saved.gas };
      setDraft(context ? { ...restored, sparte: initialSparte } : restored);
    }
    setReady(true);
    // Nur beim Oeffnen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) saveDraft(draft);
  }, [draft, ready]);

  const sparte = draft.sparte;
  const part = draft[sparteKey(sparte)];
  const kwh = readKwh(part.kwh);

  useEffect(() => {
    setRecent(recentPrices(sparte, draft.plz));
  }, [sparte, draft.plz, view]);

  const currentCheck = readPrice(part.current, part.current.unit, sparte);
  const offerChecks = part.offers.map((offer) => readPrice(offer, offer.unit, sparte));
  const comparison = useMemo(() => {
    if (kwh === null || !currentCheck.ok) return null;
    const offers = part.offers
      .map((offer, index) => ({ offer, check: offerChecks[index] }))
      .filter((entry): entry is { offer: ContractDraft; check: { ok: true; price: TariffPrice } } => entry.check.ok)
      .map(({ offer, check }) => ({ price: check.price, meta: offer }));
    if (offers.length === 0) return null;
    return compareTariffs(kwh, draft.years, currentCheck.price, offers);
    // Die Pruefungen ergeben sich aus `part` - neu gerechnet wird, wenn sich die Eingabe aendert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, kwh, draft.years, sparte]);

  const missing =
    kwh === null
      ? "Jahresverbrauch eintragen"
      : !currentCheck.ok
        ? "Arbeitspreis des aktuellen Vertrags eintragen"
        : comparison === null
          ? "Arbeitspreis eines neuen Tarifs eintragen"
          : null;

  /* -------------------------------- Aendern ------------------------------- */

  function updatePart(change: (part: SparteDraft) => SparteDraft) {
    setDraft((current) => {
      const key = sparteKey(current.sparte);
      return { ...current, [key]: change(current[key]) };
    });
  }

  function patchContract(key: string, patch: Partial<ContractDraft>) {
    updatePart((current) => ({
      ...current,
      current: current.current.key === key ? { ...current.current, ...patch } : current.current,
      offers: current.offers.map((offer) => (offer.key === key ? { ...offer, ...patch } : offer)),
    }));
  }

  /** Tarif aus der Liste gewaehlt: Name uebernehmen, gemerkte Preise fuer diese PLZ dazu. */
  function pickTariff(key: string, option: CompareTariffOption) {
    const known = findPrice({ sparte, provider: option.provider, name: option.name, plz: draft.plz });
    const offer = part.offers.find((entry) => entry.key === key);
    const untouched = offer && !offer.ct.trim() && !offer.base.trim() && !offer.bonus.trim();
    patchContract(
      key,
      known && untouched
        ? { ...fromMemory(known, option.id), key }
        : { provider: option.provider, name: option.name, tariffId: option.id },
    );
  }

  function addOffer(from?: RememberedPrice) {
    const option = from ? tariffs.find((t) => t.sparte === sparte && t.provider === from.provider && t.name === from.name) : undefined;
    updatePart((current) => ({
      ...current,
      offers: [
        // Eine leere Zeile ersetzt der Vorschlag, statt sie stehen zu lassen.
        ...current.offers.filter((offer) => !from || contractLabel(offer) || offer.ct.trim()),
        from ? fromMemory(from, option?.id ?? null) : emptyContract("month"),
      ],
    }));
  }

  function removeOffer(key: string) {
    const before = part.offers;
    updatePart((current) => ({ ...current, offers: current.offers.filter((offer) => offer.key !== key) }));
    toast("Tarif entfernt", {
      action: { label: "Rückgängig", onClick: () => updatePart((current) => ({ ...current, offers: before })) },
    });
  }

  function applyPlace(place: ComparePlace) {
    const contract = fromPlace(place, sparte);
    setDraft((current) => ({ ...current, plz: place.plz }));
    if (contract) updatePart((current) => ({ ...current, current: { ...contract, key: current.current.key } }));
  }

  function reset() {
    const before = draft;
    setDraft(freshDraft(context?.plz ?? draft.plz, context?.place ?? placeFor(draft.plz), sparte));
    setView("input");
    toast("Vergleich geleert", { action: { label: "Rückgängig", onClick: () => setDraft(before) } });
  }

  function placeFor(plz: string): ComparePlace | null {
    return places.find((place) => place.plz === plz) ?? null;
  }

  function showResult() {
    if (!comparison) return;
    // Preise der neuen Tarife merken - an der naechsten Tuer derselben PLZ stehen sie als Vorschlag da.
    rememberPrices(
      comparison.offers.map((offer) => ({
        sparte,
        provider: offer.meta.provider.trim(),
        name: offer.meta.name.trim(),
        plz: draft.plz,
        baseYear: offer.price.baseYear,
        ct: offer.price.ct,
        bonus: offer.price.bonus,
      })),
    );
    setView("result");
  }

  /* -------------------------------- Ansicht ------------------------------- */

  const place = context?.place ?? placeFor(draft.plz);
  const suggestion = place ? fromPlace(place, sparte) : null;
  const currentIsSuggestion =
    suggestion !== null &&
    contractLabel(part.current) === contractLabel(suggestion) &&
    part.current.ct === suggestion.ct;
  const shownRecent = recent
    .filter((entry) => !part.offers.some((offer) => contractLabel(offer) === contractLabel(entry)))
    .slice(0, 4);
  const pickable = tariffs.filter((tariff) => tariff.sparte === sparte);

  const input = (
    <div>
      <Segmented<CompareSparte>
        ariaLabel="Sparte"
        value={sparte}
        onChange={(next) => setDraft((current) => ({ ...current, sparte: next }))}
        options={COMPARE_SPARTEN.map((value) => ({ value, label: COMPARE_SPARTE_LABEL[value] }))}
      />

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="block min-w-0">
          <span className="label">Verbrauch kWh/Jahr</span>
          <input
            className="field tabular-nums"
            inputMode="numeric"
            enterKeyHint="next"
            placeholder={TYPICAL_KWH[sparte].toLocaleString("de-DE")}
            value={part.kwh}
            onChange={(event) => updatePart((current) => ({ ...current, kwh: event.target.value }))}
          />
        </label>
        <div>
          <span className="label">Zeitraum</span>
          <YearStepper value={draft.years} onChange={(years) => setDraft((current) => ({ ...current, years }))} />
        </div>
      </div>

      <p className="list-label mt-6">Aktueller Vertrag</p>
      <ContractFields
        contract={part.current}
        check={currentCheck}
        kwh={kwh}
        options={[]}
        label="Aktueller Vertrag"
        placeholder="Anbieter laut Rechnung"
        leading={
          layout === "page" ? (
            <input
              className="field w-24 shrink-0 tabular-nums"
              inputMode="numeric"
              maxLength={5}
              placeholder="PLZ"
              aria-label="PLZ des Kunden"
              value={draft.plz}
              onChange={(event) => {
                const plz = event.target.value.replace(/\D/g, "").slice(0, 5);
                const found = plz.length === 5 ? placeFor(plz) : null;
                const blank = !contractLabel(part.current) && !part.current.ct.trim();
                setDraft((current) => ({ ...current, plz }));
                if (found && blank) applyPlace(found);
              }}
            />
          ) : undefined
        }
        footer={
          suggestion && !currentIsSuggestion ? (
            <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => place && applyPlace(place)}>
              Grundversorger: {suggestion.provider || "vom Preisblatt"}
            </button>
          ) : currentIsSuggestion ? (
            <p className="mt-2 px-1 text-footnote text-muted">Grundversorger vom Preisblatt – mit der Rechnung prüfen</p>
          ) : null
        }
        onChange={(patch) => patchContract(part.current.key, patch)}
      />
      {layout === "page" && !draft.plz && places.length > 0 && (
        <div className="chips mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Grundversorger aus deinen Gebieten">
          {places.slice(0, 8).map((entry) => (
            <button key={entry.plz} type="button" className="chip" onClick={() => applyPlace(entry)}>
              {entry.plz} {entry.city}
            </button>
          ))}
        </div>
      )}

      <p className="list-label mt-6">Neue Tarife</p>
      <div className="space-y-2">
        {part.offers.map((offer, index) => {
          const ranked = comparison?.offers.find((entry) => entry.meta.key === offer.key);
          return (
            <ContractFields
              key={offer.key}
              contract={offer}
              check={offerChecks[index]}
              kwh={kwh}
              options={pickable}
              label={`Neuer Tarif ${index + 1}`}
              placeholder={pickable.length > 0 ? "Tarif suchen oder Anbieter" : "Anbieter und Tarif"}
              onChange={(patch) => patchContract(offer.key, patch)}
              onPick={(option) => pickTariff(offer.key, option)}
              onRemove={part.offers.length > 1 || contractLabel(offer) || offer.ct ? () => removeOffer(offer.key) : undefined}
              footer={ranked ? <OfferPreview check={offerChecks[index]} saving={ranked.saving} total={ranked.cost.total} years={draft.years} /> : null}
            />
          );
        })}
      </div>
      <div className="chips mt-2 flex gap-2 overflow-x-auto pb-1">
        <button type="button" className="chip" onClick={() => addOffer()}>
          <IconPlus className="h-4 w-4" />
          Tarif
        </button>
        {shownRecent.map((entry) => (
          <button
            key={`${entry.provider}|${entry.name}`}
            type="button"
            className="chip"
            onClick={() => addOffer(entry)}
            aria-label={`${contractLabel(entry)} mit gemerkten Preisen hinzufügen`}
          >
            <IconPlus className="h-4 w-4" />
            {entry.provider || entry.name}
          </button>
        ))}
      </div>
      {shownRecent.length > 0 && <p className="list-footer">Zuletzt hier verglichen – Preise mit dem Portal prüfen</p>}
    </div>
  );

  const result = comparison ? (
    <CompareResult
      comparison={comparison}
      sparte={sparte}
      current={part.current}
      years={draft.years}
      onYears={(years) => setDraft((current) => ({ ...current, years }))}
    />
  ) : null;

  const showing = view === "result" && result !== null;
  const body = (
    <div ref={topRef} className="scroll-mt-4">
      {showing ? result : input}
    </div>
  );

  const primary: ReactNode = showing ? (
    onStartSale ? (
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => onStartSale(sparte)}>
        Auftrag starten
      </button>
    ) : null
  ) : (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary btn-lg btn-block" onClick={showResult} disabled={missing !== null}>
        {comparison ? `Ergebnis ${periodPhrase(draft.years)}` : "Ergebnis zeigen"}
      </button>
      {missing && <p className="text-center text-footnote text-muted">{missing}</p>}
    </div>
  );

  const action = showing ? (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView("input")}>
      Bearbeiten
    </button>
  ) : (
    <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
      Leeren
    </button>
  );

  if (layout === "sheet") {
    return (
      <Sheet
        title="Tarifvergleich"
        subtitle={context?.label}
        width="lg"
        onClose={onClose ?? (() => {})}
        action={action}
        footer={primary ?? undefined}
      >
        {body}
      </Sheet>
    );
  }

  return (
    <div className="page-narrow">
      <PageHeader
        title="Tarifvergleich"
        subtitle="Über die ganze Laufzeit, nicht nur das 1. Jahr"
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        actions={action}
      />
      {body}
      {primary && <div className="mt-6">{primary}</div>}
    </div>
  );
}

/** Unter einem Tarif: was er kostet und spart - Tippfehler fallen so sofort auf. */
function OfferPreview({ check, saving, total, years }: { check: PriceCheck; saving: number; total: number; years: number }) {
  if (!check.ok) return null;
  return (
    <p className="mt-2 flex items-baseline justify-between gap-2 px-1 text-footnote">
      <span className="text-muted">
        {eur(total)} {periodPhrase(years)}
      </span>
      <span className={`font-semibold ${saving > 0.004 ? "text-accent-ink" : "text-ink-2"}`}>
        {saving > 0.004 ? `spart ${eur(saving)}` : `${eur(-saving)} teurer`}
      </span>
    </p>
  );
}

/** Vergleichszeitraum in Jahren: Laufzeit bzw. Preisgarantie des neuen Tarifs. */
function YearStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex h-12 items-center rounded-md bg-fill" role="group" aria-label="Vergleichszeitraum in Jahren">
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(Math.max(MIN_YEARS, value - 1))}
        disabled={value <= MIN_YEARS}
        aria-label="Ein Jahr weniger"
      >
        <IconMinus className="h-4 w-4" />
      </button>
      <output className="min-w-16 text-center text-body font-semibold tabular-nums" aria-live="polite">
        {value} {value === 1 ? "Jahr" : "Jahre"}
      </output>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onChange(Math.min(MAX_YEARS, value + 1))}
        disabled={value >= MAX_YEARS}
        aria-label="Ein Jahr mehr"
      >
        <IconPlus className="h-4 w-4" />
      </button>
    </div>
  );
}
