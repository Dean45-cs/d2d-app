"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmptyState,
  Note,
  PageHeader,
  SectionHeader,
  Segmented,
  StatTile,
  euro,
} from "@/components/ui";
import { IconBolt, IconInfo, IconList, IconPlus, IconRefresh, IconSearch } from "@/components/icons";
import { PriceBadge } from "@/components/ProviderRating";
import { ShowMore } from "@/components/ShowMore";
import { useConfirm } from "@/components/useConfirm";
import { MapView } from "@/components/map/MapView";
import { priceMarker } from "@/components/map/markers";
import type { LatLng, MapEngine } from "@/components/map/types";
import {
  NO_PRICE_COLOR,
  PRICE_LEVELS,
  PRICE_SCALE,
  referenceStep,
  type Energy,
} from "@/lib/energy/rating";
import {
  EMPTY_DRAFT,
  dateLabel,
  draftFromOpen,
  draftFromPoint,
  sheetSearch,
  type MapPoint,
  type OpenPoint,
  type PriceDraft,
} from "./data";
import { PriceSheet, type SavedPrice } from "./PriceSheet";
import { ImportSheet } from "./ImportSheet";

interface Props {
  prices: MapPoint[];
  /** Orte der eigenen Gebiete ohne Preis (nur fuer die Teamleitung) */
  open: OpenPoint[];
  /** Jahreskosten des Musterhaushalts beim Bundesdurchschnitt */
  reference: Record<Energy, number>;
  isLeader: boolean;
  /** Nur mit eingerichteter Tagesquelle */
  feed: {
    refresh: {
      finished_at: string | null;
      status: string;
      source: string;
      row_count: number;
      message: string;
    } | null;
  } | null;
  consumption: Record<Energy, number>;
  /** Aus einem Gebiet heraus geoeffnet: Formular gleich vorbelegt */
  initialDraft: PriceDraft | null;
}

const GERMANY_POINTS: LatLng[] = [
  [47.3, 5.9],
  [55.05, 15.0],
];

function located(point: { lat: number | null; lng: number | null }): LatLng | null {
  return point.lat !== null && point.lng !== null ? [point.lat, point.lng] : null;
}

export function EnergyMapClient({
  prices,
  open,
  reference,
  isLeader,
  feed,
  consumption,
  initialDraft,
}: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [engine, setEngine] = useState<MapEngine | null>(null);

  const [energy, setEnergy] = useState<Energy>("strom");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PriceDraft | null>(initialDraft);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Der Link aus dem Gebiet soll beim Neuladen nicht wieder das Formular oeffnen.
  useEffect(() => {
    if (initialDraft) window.history.replaceState(null, "", "/karte");
  }, [initialDraft]);

  const ref = reference[energy];
  const label = energy === "strom" ? "Strom" : "Gas";

  function valueOf(point: MapPoint): number | null {
    return energy === "strom" ? point.stromYear : point.gasYear;
  }

  function colorOf(point: MapPoint): string {
    const value = valueOf(point);
    return value === null ? NO_PRICE_COLOR : PRICE_SCALE[referenceStep(value, ref)];
  }

  /* ----------------------------- Kennzahlen ----------------------------- */

  const ranked = useMemo(
    () =>
      prices
        .filter((p) => (energy === "strom" ? p.stromYear : p.gasYear) !== null)
        .sort(
          (a, b) =>
            ((energy === "strom" ? b.stromYear : b.gasYear) ?? 0) -
            ((energy === "strom" ? a.stromYear : a.gasYear) ?? 0),
        ),
    [prices, energy],
  );
  const priciest = ranked[0] ?? null;
  const cheapest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  const selectedPrice = prices.find((p) => p.key === selectedKey) ?? null;
  const selectedOpen = open.find((p) => p.key === selectedKey) ?? null;

  /* -------------------------------- Karte -------------------------------- */

  const allPoints = useMemo(
    () =>
      [...prices, ...open].map(located).filter((p): p is LatLng => p !== null),
    [prices, open],
  );

  // Alles ins Bild holen: die eingetragenen Orte, sonst ganz Deutschland.
  function fitAll(animate = false) {
    if (!engine) return;
    if (allPoints.length === 1) engine.setView(allPoints[0], 10, animate);
    else if (allPoints.length > 1) engine.fit(allPoints, { padding: 40, maxZoom: 11, animate });
    else engine.fit(GERMANY_POINTS, { padding: 8, animate });
  }

  useEffect(() => {
    fitAll();
    // Nur beim Laden der Karte - danach bestimmt die Hand, wo man hinschaut.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const layer = engine.layer();
    for (const point of prices) {
      const at = located(point);
      if (!at) continue;
      const value = valueOf(point);
      const diameter = value === null ? 10 : 14 + Math.min(12, Math.abs(value - ref) / 30);
      const isSelected = selectedKey === point.key;
      layer.marker(at, {
        ...priceMarker(colorOf(point), Math.round(diameter), isSelected),
        title: point.city || point.plz,
        subtitle: `${point.provider || "Grundversorger unbekannt"} · ${
          value !== null ? `${euro(value)} / Jahr` : `kein ${label}preis`
        }`,
        priority: isSelected ? 5 : 2,
        onClick: () => setSelectedKey(point.key),
      });
    }
    for (const place of open) {
      const at = located(place);
      if (!at) continue;
      const isSelected = selectedKey === place.key;
      layer.marker(at, {
        ...priceMarker(NO_PRICE_COLOR, 12, isSelected, true),
        title: place.city || place.plz || "Ohne Ort",
        subtitle: "Noch kein Preis – antippen zum Eintragen",
        priority: isSelected ? 5 : 1,
        onClick: () => setSelectedKey(place.key),
      });
    }
    return () => layer.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, prices, open, energy, ref, selectedKey]);

  function focus(key: string, at: LatLng | null) {
    setSelectedKey(key);
    if (at) engine?.setView(at, 11, true);
  }

  /* ------------------------------ Aktionen ------------------------------- */

  function saved(result: SavedPrice) {
    setDraft(null);
    const place = [result.postalCode, result.city].filter(Boolean).join(" ");
    setMessage(
      result.located
        ? `Preis für ${place} gespeichert.`
        : `Preis für ${place} gespeichert. Die Lage des Ortes ist unbekannt – er gilt für Gebiete mit dieser PLZ, erscheint aber nicht auf der Karte.`,
    );
    setSelectedKey(`p:${result.postalCode}`);
    router.refresh();
  }

  async function remove(point: MapPoint) {
    if (point.id === null) return;
    const ok = await confirm({
      title: `Preis für ${point.plz} ${point.city} löschen?`,
      text: "Gebiete in diesem Ort stehen danach wieder ohne Preis da.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/provider-prices/${point.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Der Preis konnte nicht gelöscht werden.");
      return;
    }
    setSelectedKey(null);
    setMessage(`Preis für ${point.plz} ${point.city} gelöscht.`);
    router.refresh();
  }

  async function refreshFeed() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/energy/refresh", { method: "POST" });
      const data = await response.json();
      setMessage(
        response.ok
          ? `Tagesquelle abgerufen – ${data.rowCount} Orte.`
          : (data.error ?? data.message ?? "Abruf fehlgeschlagen"),
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Keine Verbindung – bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- Ansicht ------------------------------- */

  const refresh = feed?.refresh ?? null;
  const stand = refresh?.finished_at
    ? `Tagesquelle vom ${new Date(refresh.finished_at).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })}`
    : null;

  const nothing = prices.length === 0 && open.length === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Energiekarte"
        subtitle={[
          prices.length > 0 ? `${prices.length} ${prices.length === 1 ? "Ort" : "Orte"} mit Preis` : "Noch keine Preise",
          `Musterhaushalt ${consumption[energy].toLocaleString("de-DE")} kWh ${label}`,
          stand,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <>
            {prices.length > 0 && (
              <Segmented<Energy>
                ariaLabel="Energieart"
                value={energy}
                onChange={setEnergy}
                options={[
                  { value: "strom", label: "Strom" },
                  { value: "gas", label: "Gas" },
                ]}
              />
            )}
            {isLeader && feed && (
              <button
                className="icon-btn icon-btn-outline h-10 w-10"
                onClick={refreshFeed}
                disabled={busy}
                aria-label="Tagesquelle jetzt abrufen"
                title="Tagesquelle jetzt abrufen"
              >
                <IconRefresh className={`h-[18px] w-[18px] ${busy ? "animate-spin" : ""}`} />
              </button>
            )}
            {isLeader && (
              <>
                {/* Auf dem Handy kurz beschriftet - sonst passt die Zeile nicht in die Breite. */}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setImporting(true)}
                  aria-label="Preise als Tabelle"
                  title="Preise als Tabelle"
                >
                  <IconList className="h-4 w-4" />
                  <span className="hidden sm:inline">Tabelle</span>
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setDraft(EMPTY_DRAFT)}>
                  <IconPlus className="h-4 w-4" />
                  <span className="sm:hidden">Preis</span>
                  <span className="hidden sm:inline">Preis eintragen</span>
                </button>
              </>
            )}
          </>
        }
      />

      {message && (
        <div className="mb-4">
          <Note tone="brand" icon={<IconInfo className="h-4 w-4" />}>
            {message}
          </Note>
        </div>
      )}
      {refresh && refresh.status !== "ok" && (
        <div className="mb-4">
          <Note tone="danger" icon={<IconInfo className="h-4 w-4" />}>
            Letzter Abruf der Tagesquelle fehlgeschlagen: {refresh.message}
          </Note>
        </div>
      )}

      {nothing ? (
        <EmptyState
          icon={<IconBolt className="h-7 w-7" />}
          title="Noch keine Preise eingetragen"
          text={
            isLeader
              ? "Für Grundversorger-Preise gibt es keine freie Schnittstelle – aber jeder Grundversorger muss sein Preisblatt online stellen. Einmal abtippen, danach bewertet die App jedes Gebiet damit."
              : "Sobald die Teamleitung Preise einträgt, erscheinen sie hier."
          }
          action={
            isLeader && (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setDraft(EMPTY_DRAFT)}>
                  Ersten Ort eintragen
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setImporting(true)}>
                  Tabelle importieren
                </button>
              </div>
            )
          }
        />
      ) : (
        <>
          {isLeader && prices.length === 0 && (
            <div className="mb-4">
              <Note tone="brand" icon={<IconInfo className="h-4 w-4" />}>
                <span className="font-semibold">So füllt sich die Karte:</span> Grauen Punkt oder
                „Eintragen“ antippen, im Formular das Preisblatt öffnen und Arbeits- und
                Grundpreis abtippen. Viele Orte auf einmal: „Tabelle“ – Vorlage herunterladen, in
                Excel ausfüllen, einfügen.
              </Note>
            </div>
          )}

          {prices.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile
                label="Orte mit Preis"
                value={prices.length}
                hint={isLeader && open.length > 0 ? `${open.length} Gebietsorte noch offen` : undefined}
              />
              <StatTile label="Bundesschnitt" value={euro(ref)} hint="Musterhaushalt pro Jahr" />
              <StatTile
                label="Teuerster Ort"
                value={priciest?.city || priciest?.plz || "–"}
                hint={priciest ? deltaHint(valueOf(priciest), ref) : undefined}
                tone={priciest ? deltaTone(valueOf(priciest), ref) : "neutral"}
              />
              <StatTile
                label="Günstigster Ort"
                value={cheapest?.city || cheapest?.plz || "–"}
                hint={cheapest ? deltaHint(valueOf(cheapest), ref) : undefined}
                tone={cheapest ? deltaTone(valueOf(cheapest), ref) : "neutral"}
              />
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
            <div className="card overflow-hidden">
              <MapView
                className="h-[62vh] min-h-[380px] w-full"
                onEngine={setEngine}
                onFit={() => fitAll(true)}
              />
              <div className="border-t px-4 pb-3 pt-3 hairline">
                <div className="flex h-2 overflow-hidden rounded-full">
                  {PRICE_SCALE.map((color) => (
                    <span key={color} className="flex-1" style={{ background: color }} />
                  ))}
                </div>
                <div className="muted mt-1.5 grid grid-cols-5 text-center text-[11px] font-medium">
                  {PRICE_LEVELS.map((level) => (
                    <span key={level.step}>{level.label}</span>
                  ))}
                </div>
                <p className="muted mt-1 text-center text-[11px]">
                  Gemessen am Bundesschnitt der Grundversorgung ({euro(ref)} im Jahr) – größere
                  Punkte liegen weiter davon entfernt.
                  {open.length > 0 && " Gestrichelt: Gebietsort ohne Preis."}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {selectedPrice && (
                <PriceDetail
                  point={selectedPrice}
                  energy={energy}
                  reference={ref}
                  isLeader={isLeader}
                  onEdit={() => setDraft(draftFromPoint(selectedPrice))}
                  onDelete={() => void remove(selectedPrice)}
                />
              )}

              {selectedOpen && (
                <div className="card p-5">
                  <p className="muted text-[12.5px] font-medium">
                    {[selectedOpen.plz, "noch kein Preis"].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-lg font-bold">{selectedOpen.city || "Ohne Ortsangabe"}</p>
                  <p className="muted mb-3 text-sm">
                    {selectedOpen.territories.join(", ")}
                    {selectedOpen.provider && ` · Vorschlag: ${selectedOpen.provider}`}
                  </p>
                  {(selectedOpen.provider || selectedOpen.city) && (
                    <p className="muted mb-3 flex items-center gap-1.5 text-[12.5px]">
                      <IconSearch className="h-3.5 w-3.5 shrink-0" />
                      Preisblatt:{" "}
                      <a
                        className="font-semibold text-tint"
                        href={sheetSearch(selectedOpen.provider, selectedOpen.city, "Strom")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Strom
                      </a>
                      ·
                      <a
                        className="font-semibold text-tint"
                        href={sheetSearch(selectedOpen.provider, selectedOpen.city, "Gas")}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Gas
                      </a>
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={() => setDraft(draftFromOpen(selectedOpen))}
                  >
                    Preis eintragen
                  </button>
                </div>
              )}

              {open.length > 0 && (
                <div className="card p-5">
                  <SectionHeader title="Noch ohne Preis" count={open.length} className="mb-1" />
                  <p className="muted mb-2 text-[12.5px] leading-snug">
                    Orte eurer Gebiete – hier lohnt sich das Eintragen zuerst.
                  </p>
                  <ShowMore initial={5} className="-mx-2 space-y-0.5">
                    {open.map((place) => (
                      <li key={place.key} className="flex items-center gap-2 rounded-[var(--r-xs)] px-2 py-1.5">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => focus(place.key, located(place))}
                          aria-current={selectedKey === place.key ? "true" : undefined}
                        >
                          <span className="block truncate text-[13.5px] font-medium">
                            {[place.plz, place.city].filter(Boolean).join(" ") || "Ohne Ortsangabe"}
                          </span>
                          <span className="muted block truncate text-[11.5px]">
                            {place.territories.join(", ")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-pill shrink-0"
                          onClick={() => setDraft(draftFromOpen(place))}
                        >
                          Eintragen
                        </button>
                      </li>
                    ))}
                  </ShowMore>
                </div>
              )}

              {ranked.length > 0 && (
                <div className="card p-5">
                  <SectionHeader title={`Teuerste Orte · ${label}`} className="mb-2" />
                  <ShowMore initial={10} className="-mx-2 space-y-0.5">
                    {ranked.map((point, index) => (
                      <li key={point.key}>
                        <button
                          onClick={() => focus(point.key, located(point))}
                          className="flex w-full items-center gap-2.5 rounded-[var(--r-xs)] px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-[var(--hover)]"
                          aria-current={selectedKey === point.key ? "true" : undefined}
                        >
                          <span className="muted w-5 text-right text-[12px] tabular-nums">{index + 1}</span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: colorOf(point) }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {point.city || point.plz}
                            {point.stale && (
                              <span className="ml-1.5 text-[11px] font-semibold text-warn">prüfen</span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {euro(valueOf(point))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ShowMore>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {draft && (
        <PriceSheet
          draft={draft}
          reference={reference}
          consumption={consumption}
          onClose={() => setDraft(null)}
          onSaved={saved}
        />
      )}
      {importing && (
        <ImportSheet
          knownPostalCodes={prices.filter((p) => p.id !== null).map((p) => p.plz)}
          onClose={() => setImporting(false)}
          onDone={(text) => {
            setImporting(false);
            setMessage(text);
            router.refresh();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

/** Rot nur, was wirklich ueber dem Schnitt liegt - auch der teuerste Ort kann guenstig sein. */
function deltaTone(value: number | null, reference: number): "danger" | "success" | "neutral" {
  if (value === null) return "neutral";
  return value > reference ? "danger" : "success";
}

/** "+49 € ggü. Schnitt" */
function deltaHint(value: number | null, reference: number): string | undefined {
  if (value === null) return undefined;
  const delta = Math.round(value - reference);
  return `${delta > 0 ? "+" : ""}${euro(delta)} ggü. Schnitt`;
}

/** Alles zu einem Ort mit Preis - und fuer die Teamleitung: bearbeiten, loeschen. */
function PriceDetail({
  point,
  energy,
  reference,
  isLeader,
  onEdit,
  onDelete,
}: {
  point: MapPoint;
  energy: Energy;
  reference: number;
  isLeader: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ctValue = energy === "strom" ? point.stromCt : point.gasCt;
  const base = energy === "strom" ? point.stromBaseMonth : point.gasBaseMonth;
  const year = energy === "strom" ? point.stromYear : point.gasYear;
  const delta = year !== null ? Math.round(year - reference) : null;
  const provider = energy === "gas" && point.gasProvider ? point.gasProvider : point.provider;

  return (
    <div className="card p-5">
      <p className="muted text-[12.5px] font-medium">
        {point.plz} · {point.id !== null ? "Preisblatt" : "Tagesquelle"}
        {point.validFrom && `, gültig ab ${dateLabel(point.validFrom)}`}
      </p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-bold">{point.city || point.plz}</p>
        {year !== null && <PriceBadge step={referenceStep(year, reference)} />}
      </div>
      <p className="muted mb-3 text-sm">{provider || "Grundversorger unbekannt"}</p>

      {year === null ? (
        <p className="muted text-sm">
          Für {energy === "strom" ? "Strom" : "Gas"} ist hier kein Preis eingetragen.
        </p>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <Row
            label="Arbeitspreis"
            value={`${ctValue!.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ct/kWh`}
          />
          <Row
            label="Grundpreis"
            value={
              base !== null
                ? `${base.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Monat`
                : "–"
            }
          />
          <Row label="Jahreskosten Musterhaushalt" value={euro(year)} />
          <Row
            label="ggü. Bundesschnitt"
            value={delta === null ? "–" : `${delta > 0 ? "+" : ""}${euro(delta)} pro Jahr`}
            tone={delta !== null && delta > 0 ? "danger" : "success"}
          />
        </dl>
      )}

      {delta !== null && delta > 0 && (
        <div className="mt-3">
          <Note tone="success">
            Guter Ort zum Klingeln: Der Grundversorger liegt {euro(delta)} pro Jahr über dem
            Bundesschnitt.
          </Note>
        </div>
      )}
      {point.stale && (
        <p className="mt-3 text-[12px] font-semibold text-warn">
          Älter als ein halbes Jahr – bitte mit dem aktuellen Preisblatt prüfen.
        </p>
      )}
      {isLeader && point.id !== null && (point.lat === null || point.lng === null) && (
        <p className="muted mt-3 text-[12px]">
          Lage unbekannt – der Ort erscheint nicht auf der Karte. Einmal speichern versucht es
          erneut.
        </p>
      )}
      {point.sourceUrl && (
        <a
          href={point.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-[13px] font-semibold text-tint"
        >
          Preisblatt öffnen
        </a>
      )}

      {isLeader && (
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={onEdit}>
            {point.id !== null ? "Bearbeiten" : "Eigenen Preis eintragen"}
          </button>
          {point.id !== null && (
            <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={onDelete}>
              Löschen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const color =
    tone === "danger" ? "var(--danger-ink)" : tone === "success" ? "var(--ok-ink)" : undefined;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="muted">{label}</dt>
      <dd className="font-semibold tabular-nums" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
