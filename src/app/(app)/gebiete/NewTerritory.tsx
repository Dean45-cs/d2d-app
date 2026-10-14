"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IconChevronLeft, IconList, IconMap, IconPlus } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { EmptyState, InlineError, Segmented, plural } from "@/components/ui";
import { plotColor } from "@/components/map-colors";
import type { User } from "@/lib/types";
import { labelPoint, type Shape } from "@/lib/geo/shape";
import { loadStreets as fetchAreaStreets, StreetsError } from "@/lib/geo/fetch-streets";
import { plotAreas, splitStreets } from "@/lib/geo/split";
import { AreaPicker, type ExistingArea, type OverlayPlot, type OverlayStreet } from "./AreaPicker";
import {
  StreetResult,
  StreetResultSkeleton,
  doorsOf,
  pointsOf,
  type FoundStreet,
  type Plot,
} from "./StreetResult";

interface StreetResponse {
  streets: FoundStreet[];
  addressCount: number;
  areaSqKm: number;
  place: { city: string; postalCode: string; district: string };
}

type Tab = "map" | "list";

/**
 * Ein neues Gebiet in drei Schritten: Flaeche abstecken, Strassen pruefen
 * und aufteilen, benennen und zuteilen. Je Schritt eine Aufgabe, unten der
 * eine Knopf, der weiterfuehrt.
 */
export function NewTerritoryButton({
  members,
  canAssign,
  existingAreas = [],
}: {
  members: User[];
  canAssign: boolean;
  existingAreas?: ExistingArea[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<Tab>("map");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kartenauswahl
  const [area, setArea] = useState<Shape | null>(null);
  const [loadingStreets, setLoadingStreets] = useState(false);
  const [result, setResult] = useState<StreetResponse | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [plotCount, setPlotCount] = useState(1);
  const [assignees, setAssignees] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: "",
    city: "",
    postalCode: "",
    assignedUserId: "",
    streets: "",
    note: "",
    dueDate: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetAll() {
    setForm({ name: "", city: "", postalCode: "", assignedUserId: "", streets: "", note: "", dueDate: "" });
    setArea(null);
    setResult(null);
    setChosen(new Set());
    setFocus(null);
    setPlotCount(1);
    setAssignees([]);
    setError(null);
    setStep(1);
    setTab("map");
  }

  /* --------------------------- Straßen laden ---------------------------- */

  async function loadStreets(): Promise<boolean> {
    if (!area) return false;
    setLoadingStreets(true);
    setError(null);
    try {
      const found: StreetResponse = await fetchAreaStreets(area);
      setResult(found);
      setChosen(new Set(found.streets.map((s) => s.name)));

      // Formular aus dem Kartenausschnitt vorbelegen, ohne Eingaben zu überschreiben.
      setForm((prev) => ({
        ...prev,
        city: prev.city || found.place.city,
        postalCode: prev.postalCode || found.place.postalCode,
        name: prev.name || suggestName(found.place),
      }));
      return true;
    } catch (caught) {
      setError(
        caught instanceof StreetsError
          ? caught.message.includes("Liste einfügen")
            ? caught.message
            : `${caught.message} Straßen lassen sich auch von Hand eintragen.`
          : "Die Straßensuche ist nicht erreichbar. Straßen lassen sich auch von Hand eintragen.",
      );
      return false;
    } finally {
      setLoadingStreets(false);
    }
  }

  /* ---------------------------- Aufteilung ------------------------------ */

  const selectedStreets = useMemo(
    () => result?.streets.filter((s) => chosen.has(s.name)) ?? [],
    [result, chosen],
  );

  const plots: Plot[] = useMemo(() => {
    if (plotCount < 2 || selectedStreets.length === 0) return [];
    const groups = splitStreets(
      selectedStreets.map((s) => ({ ...s, weight: doorsOf(s) || 1 })),
      plotCount,
    // Liegen die Strassen so, dass ein Paket leer bliebe, entstehen lieber
    // weniger Gebiete als eines ohne Strassen.
    ).filter((group) => group.length > 0);
    return groups.map((group, index) => ({
      label: String(index + 1),
      color: plotColor(index),
      streets: group,
      doors: group.reduce((sum, s) => sum + doorsOf(s), 0),
    }));
  }, [selectedStreets, plotCount]);

  /** Strassenname -> Nummer des Teilgebiets. */
  const plotOf = useMemo(() => {
    const map = new Map<string, number>();
    plots.forEach((plot, index) => plot.streets.forEach((s) => map.set(s.name, index)));
    return map;
  }, [plots]);

  /* -------------------------- Karten-Vorschau ---------------------------- */

  const overlay: OverlayStreet[] = useMemo(
    () =>
      (result?.streets ?? []).map((street) => ({
        name: street.name,
        points: pointsOf(street),
        center: street.lat !== null && street.lng !== null ? [street.lat, street.lng] : null,
        color: chosen.has(street.name) ? plotColor(plotOf.get(street.name) ?? 0) : null,
      })),
    [result, chosen, plotOf],
  );

  // Die Teilgebiete teilen sich die Flaeche lueckenlos und ueberschneiden sich nicht.
  const overlayPlots: OverlayPlot[] = useMemo(() => {
    if (!area || plots.length === 0) return [];
    const shapes = plotAreas(
      area,
      plots.map((plot) =>
        plot.streets.flatMap((street) => {
          // Ohne Hausnummern mit Lage zaehlt die Mitte der Strasse.
          const houses = pointsOf(street);
          if (houses.length > 0 || street.lat === null || street.lng === null) return houses;
          return [[street.lat, street.lng] as [number, number]];
        }),
      ),
    );
    return plots.map((plot, index) => ({ label: plot.label, color: plot.color, area: shapes[index] }));
  }, [area, plots]);

  /* ------------------------------ Schritte ------------------------------- */

  const splitting = tab === "map" && plotCount > 1;
  const lastStep = tab === "map" ? 3 : 2;

  async function next() {
    setError(null);
    if (tab === "list") {
      // Ohne Karte gibt es nur die Liste und die Details.
      setStep(2);
      return;
    }
    if (step === 1) {
      if (!area) {
        setError("Bitte zuerst ein Gebiet auf der Karte markieren.");
        return;
      }
      /* Die Straßen holt die App beim Weitergehen - ein Knopf weniger. Der
         Schritt geht sofort auf und zeigt so lange Platzhalter: die Abfrage
         bei OpenStreetMap dauert je nach Fläche ein paar Sekunden. */
      setStep(2);
      if (!result) void loadStreets();
      return;
    }
    if (step === 2) {
      if (!result) {
        setError(
          loadingStreets
            ? "Die Straßen werden noch geladen."
            : "Für diese Fläche liegen keine Straßen vor.",
        );
        return;
      }
      if (plotCount > 1 && plots.length < 2) {
        setError("Für die Aufteilung werden mindestens zwei Straßen gebraucht.");
        return;
      }
      setStep(3);
    }
  }

  function back() {
    setError(null);
    setStep((current) => (tab === "list" ? 1 : Math.max(1, current - 1)));
  }

  /* ------------------------------ Speichern ------------------------------ */

  async function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError("Bitte einen Namen für das Gebiet vergeben.");
      return;
    }

    setBusy(true);
    try {
      const response =
        splitting
          ? await fetch("/api/territories/split", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                city: form.city,
                postalCode: form.postalCode,
                note: form.note,
                dueDate: form.dueDate,
                groups: plots.map((plot, index) => ({
                  name: `${form.name} (${plot.label}/${plots.length})`,
                  assignedUserId: assignees[index] ? Number(assignees[index]) : null,
                  area: overlayPlots[index]?.area.length ? overlayPlots[index].area : null,
                  streetList: plot.streets,
                })),
              }),
            })
          : await fetch("/api/territories", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: form.name,
                city: form.city,
                postalCode: form.postalCode,
                note: form.note,
                dueDate: form.dueDate,
                assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : null,
                area: tab === "map" ? area : null,
                streetList: tab === "map" ? selectedStreets : [],
                streets: tab === "list" ? form.streets : "",
              }),
            });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Gebiet konnte nicht angelegt werden.");
        return;
      }
      setOpen(false);
      resetAll();
      // Beim Aufteilen entstehen mehrere Gebiete - dann in die Übersicht.
      router.push(data.id ? `/gebiete/${data.id}` : "/gebiete");
      router.refresh();
    } catch {
      setError("Keine Verbindung – das Gebiet ist noch nicht angelegt. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  // Die Karte startet beim zuletzt angelegten Gebiet - Teams arbeiten in einer Region.
  const start = existingAreas.length > 0 ? (labelPoint(existingAreas[0].area)?.point ?? null) : null;

  const stepTitle =
    step === 1
      ? tab === "map"
        ? "Gebiet abstecken"
        : "Straßen einfügen"
      : step === 2 && tab === "map"
        ? "Straßen prüfen"
        : "Benennen & zuteilen";

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          resetAll();
          setOpen(true);
        }}
      >
        <IconPlus className="h-4 w-4" />
        Neu
      </button>

      {open && (
        <Sheet
          title={stepTitle}
          subtitle={`Schritt ${tab === "map" ? step : step === 1 ? 1 : 2} von ${lastStep}`}
          width="lg"
          onClose={() => setOpen(false)}
          footer={
            <div className="space-y-2">
              {error && <InlineError>{error}</InlineError>}
              <div className="flex gap-2">
                {step > 1 ? (
                  <button type="button" className="btn btn-secondary shrink-0" onClick={back}>
                    <IconChevronLeft className="h-4 w-4" />
                    Zurück
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary shrink-0" onClick={() => setOpen(false)}>
                    Abbrechen
                  </button>
                )}
                {step < lastStep ? (
                  <button
                    type="button"
                    className="btn btn-primary flex-1"
                    onClick={() => void next()}
                    disabled={loadingStreets}
                  >
                    {loadingStreets ? "Straßen werden gesucht …" : "Weiter"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary flex-1" onClick={() => void submit()} disabled={busy}>
                    {busy ? "Anlegen …" : splitting ? `${plots.length} Gebiete anlegen` : "Gebiet anlegen"}
                  </button>
                )}
              </div>
            </div>
          }
        >
          {/* ----------------------- Schritt 1: Fläche / Liste ----------------- */}
          {step === 1 && (
            <div className="space-y-4">
              <Segmented
                options={[
                  { value: "map", label: "Auf der Karte", icon: <IconMap className="h-4 w-4" /> },
                  { value: "list", label: "Als Liste", icon: <IconList className="h-4 w-4" /> },
                ]}
                value={tab}
                onChange={(value: Tab) => {
                  setTab(value);
                  setError(null);
                }}
                ariaLabel="Wie soll das Gebiet entstehen?"
              />

              {tab === "map" ? (
                <AreaPicker
                  onAreaChange={(next) => {
                    setArea(next);
                    // Nach dem Verschieben passt die alte Straßenliste nicht mehr.
                    if (result) {
                      setResult(null);
                      setPlotCount(1);
                    }
                  }}
                  existing={existingAreas}
                  overlay={overlay}
                  plots={overlayPlots}
                  focus={focus}
                  start={start ? { lat: start[0], lng: start[1], zoom: 14 } : undefined}
                />
              ) : (
                <div>
                  <label className="label" htmlFor="t-streets">
                    Eine Straße je Zeile · Nummern und WE optional
                  </label>
                  <textarea
                    id="t-streets"
                    className="field font-mono"
                    rows={9}
                    placeholder={"Bahnhofstraße 1-45; 30 WE\nGartenweg\nLindenallee 2-18"}
                    value={form.streets}
                    onChange={(e) => update("streets", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* --------------------- Schritt 2: Straßen und Pakete --------------- */}
          {step === 2 && tab === "map" && !result && (
            <>
              {loadingStreets ? (
                <StreetResultSkeleton />
              ) : (
                <EmptyState
                  title="Keine Straßen gefunden"
                  text="Größer zeichnen oder Straßen als Liste einfügen."
                  action={
                    <button type="button" className="btn btn-secondary" onClick={() => void loadStreets()}>
                      Erneut suchen
                    </button>
                  }
                />
              )}
            </>
          )}

          {step === 2 && tab === "map" && result && (
            <div className="space-y-4">
              <StreetResult
                streets={result.streets}
                addressCount={result.addressCount}
                chosen={chosen}
                onToggle={(name) =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
                onChooseAll={(all) => setChosen(all ? new Set(result.streets.map((s) => s.name)) : new Set())}
                focus={focus}
                onFocus={setFocus}
                plotCount={plotCount}
                onPlotCount={setPlotCount}
                plots={plots}
                plotOf={plotOf}
                members={canAssign ? members : []}
                assignees={assignees}
                onAssignee={(index, value) =>
                  setAssignees((prev) => {
                    const next = [...prev];
                    next[index] = value;
                    return next;
                  })
                }
              />
              <button
                type="button"
                className="btn btn-plain btn-sm"
                onClick={() => void loadStreets()}
                disabled={loadingStreets}
              >
                {loadingStreets ? "Wird geladen …" : "Neu laden"}
              </button>
            </div>
          )}

          {/* ------------------------- Schritt 3: Details ---------------------- */}
          {step === lastStep && step > 1 && (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="t-name">
                  {splitting ? "Name der Teilgebiete" : "Name"}
                </label>
                <input
                  id="t-name"
                  className="field"
                  placeholder="Innenstadt Nord – KW 38"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                />
                {splitting && form.name && (
                  <p className="mt-2 px-1 text-footnote text-muted">
                    {form.name} (1/{plots.length}) … ({plots.length}/{plots.length})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <div>
                  <label className="label" htmlFor="t-plz">
                    PLZ
                  </label>
                  <input
                    id="t-plz"
                    className="field"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={(e) => update("postalCode", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="t-city">
                    Ort
                  </label>
                  <input id="t-city" className="field" value={form.city} onChange={(e) => update("city", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!splitting && canAssign && (
                  <div>
                    <label className="label" htmlFor="t-user">
                      Zuteilen an
                    </label>
                    <select
                      id="t-user"
                      className="field"
                      value={form.assignedUserId}
                      onChange={(e) => update("assignedUserId", e.target.value)}
                    >
                      <option value="">Später</option>
                      {members
                        .filter((m) => m.active)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className={splitting || !canAssign ? "sm:col-span-2" : undefined}>
                  <label className="label" htmlFor="t-due">
                    Bis
                  </label>
                  <input
                    id="t-due"
                    className="field"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => update("dueDate", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="t-note">
                  Notiz fürs Team
                </label>
                <input
                  id="t-note"
                  className="field"
                  placeholder="ab 16 Uhr klingeln"
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                />
              </div>

              {tab === "map" && result && (
                <p className="px-1 text-footnote text-muted">
                  {splitting
                    ? `${plots.length} Teilgebiete · ${plural(selectedStreets.length, "Straße", "Straßen")}`
                    : `${plural(selectedStreets.length, "Straße", "Straßen")} · ${plural(
                        selectedStreets.reduce((sum, s) => sum + doorsOf(s), 0),
                        "Tür",
                        "Türen",
                      )}`}
                </p>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Vorschlag wie „Innenstadt Nord – KW 38“ aus Stadtteil und Kalenderwoche. */
function suggestName(place: { city: string; district: string }): string {
  const area = place.district || place.city;
  if (!area) return "";
  return `${area} – KW ${isoWeek(new Date())}`;
}

function isoWeek(date: Date): number {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil(((copy.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
