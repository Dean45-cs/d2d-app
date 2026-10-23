"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cell,
  EmptyState,
  InlineError,
  ListLabel,
  PageHeader,
  Segmented,
  SegmentedLinks,
  StatGrid,
  euro,
  plural,
} from "@/components/ui";
import { IconBolt, IconList, IconPencil, IconPlus, IconRefresh, IconSearch, IconTrash } from "@/components/icons";
import { Menu, MenuItem } from "@/components/Menu";
import { PriceBadge } from "@/components/ProviderRating";
import { Sheet } from "@/components/Sheet";
import { ShowMore } from "@/components/ShowMore";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { MapView } from "@/components/map/MapView";
import { priceMarker } from "@/components/map/markers";
import type { LatLng, MapEngine } from "@/components/map/types";
import { NO_PRICE_COLOR, PRICE_LEVELS, PRICE_SCALE, referenceStep, type Energy } from "@/lib/energy/rating";
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
import { MAP_VIEWS } from "../gebiete/views";

interface Props {
  prices: MapPoint[];
  /** Orte der eigenen Gebiete ohne Preis (nur fuer die Teamleitung) */
  open: OpenPoint[];
  /** Jahreskosten des Musterhaushalts beim Bundesdurchschnitt */
  reference: Record<Energy, number>;
  /** Grundpreis des Vergleichswerts pro Jahr - zaehlt, wo ein Preis ohne Grundpreis gepflegt ist. */
  referenceBase: Record<Energy, number>;
  isLeader: boolean;
  canRefresh: boolean;
  /** Nur mit eingerichteter Tagesquelle */
  feed: {
    refresh: {
      finished_at: string | null;
      status: string;
      source: string;
      row_count: number;
      message: string;
      success_at: string | null;
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

/**
 * Preise der Grundversorger auf der Karte: je teurer, desto kraeftiger das
 * Gruen - dort lohnt das Klingeln. Ein Tipp auf einen Ort oeffnet ihn im
 * Blatt; die Teamleitung traegt dort Preise ein.
 */
export function EnergyMapClient({
  prices,
  open,
  reference,
  referenceBase,
  isLeader,
  canRefresh,
  feed,
  consumption,
  initialDraft,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [engine, setEngine] = useState<MapEngine | null>(null);

  const [energy, setEnergy] = useState<Energy>("strom");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PriceDraft | null>(initialDraft);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const selectedPrice = prices.find((p) => p.key === selectedKey) ?? null;
  const selectedOpen = open.find((p) => p.key === selectedKey) ?? null;

  /* -------------------------------- Karte -------------------------------- */

  const allPoints = useMemo(
    () => [...prices, ...open].map(located).filter((p): p is LatLng => p !== null),
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
        subtitle: `${(energy === "gas" && point.gasProvider ? point.gasProvider : point.provider) || "Grundversorger unbekannt"} · ${
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
        subtitle: "Noch kein Preis",
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
    toast(result.located ? `Preis für ${place} gespeichert` : `${place} gespeichert – ohne Kartenpunkt`);
    setSelectedKey(null);
    router.refresh();
  }

  async function remove(point: MapPoint) {
    if (point.id === null) return;
    const ok = await confirm({
      title: `Preis für ${point.plz} ${point.city} löschen?`,
      text: "Gebiete in diesem Ort stehen danach ohne Preis da.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/provider-prices/${point.id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      toast("Preis nicht gelöscht");
      return;
    }
    setSelectedKey(null);
    toast("Preis gelöscht");
    router.refresh();
  }

  async function refreshFeed() {
    // Ein Abruf dauert - kein zweiter, solange er laeuft.
    if (busy) return;
    setBusy(true);
    toast("Tagesquelle wird abgerufen …", { duration: 60000 });
    try {
      const response = await fetch("/api/energy/refresh", { method: "POST" });
      const data = await response.json();
      toast(response.ok ? `${plural(data.rowCount, "Ort", "Orte")} abgerufen` : (data.error ?? data.message ?? "Abruf fehlgeschlagen"));
      if (response.ok) router.refresh();
    } catch {
      toast("Keine Verbindung");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- Ansicht ------------------------------- */

  const refresh = feed?.refresh ?? null;
  // Stand der Daten, nicht des letzten Versuchs - ein fehlgeschlagener Abruf aendert die Preise nicht.
  const stand = refresh?.success_at
    ? `Stand ${new Date(refresh.success_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`
    : null;
  const nothing = prices.length === 0 && open.length === 0;
  const showMenu = isLeader || (canRefresh && feed);

  return (
    <div className="page">
      <PageHeader
        title="Karte"
        subtitle={[
          prices.length > 0 ? plural(prices.length, "Ort", "Orte") : "Noch keine Preise",
          `Musterhaushalt ${consumption[energy].toLocaleString("de-DE")} kWh`,
          stand,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {showMenu && (
              <Menu label="Preise verwalten">
                {isLeader && (
                  <MenuItem icon={<IconList className="h-5 w-5" />} onSelect={() => setImporting(true)}>
                    Tabelle importieren
                  </MenuItem>
                )}
                {canRefresh && feed && (
                  <MenuItem icon={<IconRefresh className={`h-5 w-5 ${busy ? "spin" : ""}`} />} onSelect={() => void refreshFeed()}>
                    Tagesquelle abrufen
                  </MenuItem>
                )}
              </Menu>
            )}
            {isLeader && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDraft(EMPTY_DRAFT)}
                aria-label="Preis eintragen"
              >
                <IconPlus className="h-4 w-4" />
                Preis
              </button>
            )}
          </>
        }
      >
        <SegmentedLinks ariaLabel="Ansicht der Karte" current="preise" options={MAP_VIEWS} className="max-w-xs" />
      </PageHeader>

      {refresh && refresh.status === "error" && (
        <div className="mb-4">
          <InlineError>Tagesquelle fehlgeschlagen: {refresh.message}</InlineError>
        </div>
      )}

      {nothing ? (
        <EmptyState
          boxed
          icon={<IconBolt className="h-6 w-6" />}
          title="Noch keine Preise"
          text={isLeader ? "Preisblatt des Grundversorgers abtippen – danach ist jedes Gebiet bewertet." : undefined}
          action={
            isLeader && (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => setDraft(EMPTY_DRAFT)}>
                  Preis eintragen
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setImporting(true)}>
                  Tabelle
                </button>
              </div>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
          <div className="lg:sticky lg:top-16">
            <div className="relative overflow-hidden rounded-xl">
              <MapView
                className="h-[56vh] min-h-80 w-full lg:h-[calc(100dvh-220px)]"
                onEngine={setEngine}
                onFit={() => fitAll(true)}
              >
                {prices.length > 0 && (
                  <div className="pointer-events-none absolute left-2 top-2 z-[500]">
                    <Segmented<Energy>
                      glass
                      ariaLabel="Energieart"
                      value={energy}
                      onChange={setEnergy}
                      className="pointer-events-auto w-40"
                      options={[
                        { value: "strom", label: "Strom" },
                        { value: "gas", label: "Gas" },
                      ]}
                    />
                  </div>
                )}
                <div className="map-chip pointer-events-none absolute bottom-2 left-2 z-[500] flex-col items-stretch gap-1 py-2">
                  <div className="flex h-2 w-40 overflow-hidden rounded-full" aria-hidden="true">
                    {PRICE_SCALE.map((color) => (
                      <span key={color} className="flex-1" style={{ background: color }} />
                    ))}
                  </div>
                  <div className="flex justify-between text-caption-2 text-ink-2">
                    <span>{PRICE_LEVELS[0].label}</span>
                    <span>{PRICE_LEVELS[4].label}</span>
                  </div>
                </div>
              </MapView>
            </div>
          </div>

          <div className="space-y-8">
            {prices.length > 0 && (
              <StatGrid
                columns={2}
                items={[
                  { label: "Bundesschnitt", value: euro(ref), hint: "pro Jahr" },
                  {
                    label: "Orte",
                    value: prices.length,
                    hint: isLeader && open.length > 0 ? `${open.length} ohne Preis` : "mit Preis",
                  },
                ]}
              />
            )}

            {open.length > 0 && (
              <section>
                <ListLabel>Ohne Preis</ListLabel>
                <ShowMore initial={5} className="list">
                  {open.map((place) => (
                    <li key={place.key}>
                      <Cell
                        onClick={() => focus(place.key, located(place))}
                        title={[place.plz, place.city].filter(Boolean).join(" ") || "Ohne Ort"}
                        subtitle={place.territories.join(", ")}
                        chevron
                      />
                    </li>
                  ))}
                </ShowMore>
              </section>
            )}

            {ranked.length > 0 && (
              <section>
                <ListLabel>{`Teuerste Orte · ${label}`}</ListLabel>
                <ShowMore initial={8} className="list list-icons">
                  {ranked.map((point, index) => (
                    <li key={point.key}>
                      <Cell
                        onClick={() => focus(point.key, located(point))}
                        icon={
                          <span className="glyph glyph-round relative">
                            <span className="kpi text-footnote">{index + 1}</span>
                            <span
                              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--surface)]"
                              style={{ background: colorOf(point) }}
                              aria-hidden="true"
                            />
                          </span>
                        }
                        title={point.city || point.plz}
                        subtitle={[
                          // Mehrere Preise in einer Stadt (je PLZ) - erst die PLZ macht die Zeilen unterscheidbar.
                          point.city ? point.plz : null,
                          (energy === "gas" && point.gasProvider ? point.gasProvider : point.provider) || null,
                          point.stale ? "prüfen" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        detail={<span className="kpi">{euro(valueOf(point))}</span>}
                        chevron
                      />
                    </li>
                  ))}
                </ShowMore>
              </section>
            )}
          </div>
        </div>
      )}

      {selectedPrice && (
        <PriceDetail
          point={selectedPrice}
          energy={energy}
          reference={ref}
          isLeader={isLeader}
          onClose={() => setSelectedKey(null)}
          onEdit={() => {
            setDraft(draftFromPoint(selectedPrice));
            setSelectedKey(null);
          }}
          onDelete={() => void remove(selectedPrice)}
        />
      )}

      {selectedOpen && (
        <Sheet
          title={selectedOpen.city || "Ohne Ort"}
          subtitle={[selectedOpen.plz, "noch kein Preis"].filter(Boolean).join(" · ")}
          onClose={() => setSelectedKey(null)}
          footer={
            isLeader && (
              <button
                type="button"
                className="btn btn-primary btn-lg btn-block"
                onClick={() => {
                  setDraft(draftFromOpen(selectedOpen));
                  setSelectedKey(null);
                }}
              >
                Preis eintragen
              </button>
            )
          }
        >
          <ul className="list">
            <li>
              <Cell title="Gebiete" detail={selectedOpen.territories.join(", ")} />
            </li>
            {selectedOpen.provider && (
              <li>
                <Cell title="Vorschlag" detail={selectedOpen.provider} />
              </li>
            )}
          </ul>
          <ListLabel>Preisblatt suchen</ListLabel>
          <ul className="list list-icons">
            {(["Strom", "Gas"] as const).map((kind) => (
              <li key={kind}>
                <Cell
                  href={sheetSearch(selectedOpen.provider, selectedOpen.city, kind)}
                  external
                  icon={
                    <span className="glyph">
                      <IconSearch className="h-4 w-4" />
                    </span>
                  }
                  title={kind}
                />
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {draft && (
        <PriceSheet
          draft={draft}
          reference={reference}
          referenceBase={referenceBase}
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
            toast(text, { duration: 6000 });
            router.refresh();
          }}
        />
      )}
      {dialog}
    </div>
  );
}

/** Alles zu einem Ort mit Preis - und fuer die Teamleitung: bearbeiten, loeschen. */
function PriceDetail({
  point,
  energy,
  reference,
  isLeader,
  onClose,
  onEdit,
  onDelete,
}: {
  point: MapPoint;
  energy: Energy;
  reference: number;
  isLeader: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ctValue = energy === "strom" ? point.stromCt : point.gasCt;
  const base = energy === "strom" ? point.stromBaseMonth : point.gasBaseMonth;
  const year = energy === "strom" ? point.stromYear : point.gasYear;
  const delta = year !== null ? Math.round(year - reference) : null;
  const provider = energy === "gas" && point.gasProvider ? point.gasProvider : point.provider;
  const step = year !== null ? referenceStep(year, reference) : null;

  return (
    <Sheet
      title={point.city || point.plz}
      subtitle={[
        point.plz,
        point.id !== null ? "Preisblatt" : "Tagesquelle",
        point.validFrom ? `ab ${dateLabel(point.validFrom)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      action={step !== null ? <PriceBadge step={step} /> : undefined}
      onClose={onClose}
      footer={
        isLeader && (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onEdit}>
            <IconPencil className="h-5 w-5" />
            {point.id !== null ? "Bearbeiten" : "Eigenen Preis eintragen"}
          </button>
        )
      }
    >
      {year !== null && delta !== null && (
        <div className="mb-4 surface px-4 py-4">
          <p className="text-footnote font-semibold text-ink-2">Musterhaushalt · {energy === "strom" ? "Strom" : "Gas"}</p>
          <p className="kpi text-large-title">{euro(year)}</p>
          <p className={`text-subhead font-semibold ${delta > 0 ? "text-accent-ink" : "text-muted"}`}>
            {delta > 0 ? "+" : ""}
            {euro(delta)} ggü. Schnitt
          </p>
        </div>
      )}
      <ul className="list">
        <li>
          <Cell title="Grundversorger" detail={provider || "unbekannt"} />
        </li>
        {year === null ? (
          <li>
            <Cell title={`Kein ${energy === "strom" ? "Strom" : "Gas"}preis`} />
          </li>
        ) : (
          <>
            <li>
              <Cell
                title="Arbeitspreis"
                detail={
                  <span className="kpi">
                    {ctValue?.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ct/kWh
                  </span>
                }
              />
            </li>
            <li>
              <Cell
                title="Grundpreis"
                detail={<span className="kpi">{base !== null ? `${euro2(base)} / Monat` : "–"}</span>}
              />
            </li>
          </>
        )}
        {point.stale && (
          <li>
            <Cell title="Älter als ein halbes Jahr" subtitle="Mit aktuellem Preisblatt prüfen" tone="danger" />
          </li>
        )}
        {isLeader && point.id !== null && (point.lat === null || point.lng === null) && (
          <li>
            <Cell title="Ohne Kartenpunkt" subtitle="Lage unbekannt – Speichern versucht es erneut" />
          </li>
        )}
        {point.sourceUrl && (
          <li>
            <Cell href={point.sourceUrl} external title="Preisblatt öffnen" />
          </li>
        )}
      </ul>
      {isLeader && point.id !== null && (
        <ul className="list mt-6">
          <li>
            <Cell
              onClick={onDelete}
              icon={<IconTrash className="h-5 w-5 text-danger" />}
              title="Preis löschen"
              tone="danger"
            />
          </li>
        </ul>
      )}
    </Sheet>
  );
}

function euro2(value: number): string {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}
