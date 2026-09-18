"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { IconPlus } from "@/components/icons";
import { plotColor } from "@/components/map-colors";
import type { User } from "@/lib/types";
import { centerOf, type LatLng } from "@/lib/geo/area";
import { outlineOf, splitStreets } from "@/lib/geo/split";
import { AreaPicker, type ExistingArea, type OverlayPlot, type OverlayStreet } from "./AreaPicker";
import { StreetResult, doorsOf, type FoundStreet, type Plot } from "./StreetResult";

interface StreetResponse {
  streets: FoundStreet[];
  addressCount: number;
  areaSqKm: number;
  place: { city: string; postalCode: string; district: string };
}

type Tab = "map" | "list";

export function NewTerritoryButton({
  members,
  tileUrl,
  existingAreas = [],
}: {
  members: User[];
  tileUrl: string;
  existingAreas?: ExistingArea[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kartenauswahl
  const [area, setArea] = useState<LatLng[] | null>(null);
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
  }

  /* --------------------------- Straßen laden ---------------------------- */

  async function loadStreets() {
    if (!area) return;
    setLoadingStreets(true);
    setError(null);
    try {
      const response = await fetch("/api/geo/streets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Die Straßen konnten nicht geladen werden.");
        return;
      }
      const found = data as StreetResponse;
      setResult(found);
      setChosen(new Set(found.streets.map((s) => s.name)));

      // Formular aus dem Kartenausschnitt vorbelegen, ohne Eingaben zu überschreiben.
      setForm((prev) => ({
        ...prev,
        city: prev.city || found.place.city,
        postalCode: prev.postalCode || found.place.postalCode,
        name: prev.name || suggestName(found.place),
      }));
    } catch {
      setError("Die Straßensuche ist nicht erreichbar. Straßen lassen sich auch von Hand eintragen.");
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
        points: street.points,
        center: street.lat !== null && street.lng !== null ? [street.lat, street.lng] : null,
        color: chosen.has(street.name) ? plotColor(plotOf.get(street.name) ?? 0) : null,
      })),
    [result, chosen, plotOf],
  );

  const overlayPlots: OverlayPlot[] = useMemo(
    () =>
      plots
        .map((plot) => ({
          label: plot.label,
          color: plot.color,
          area: outlineOf(plot.streets.flatMap((s) => s.points)),
        }))
        .filter((plot) => plot.area.length >= 3),
    [plots],
  );

  /* ------------------------------ Speichern ------------------------------ */

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (tab === "map" && !area) {
      setError("Bitte zuerst ein Gebiet auf der Karte markieren.");
      return;
    }
    if (tab === "map" && plotCount > 1 && plots.length < 2) {
      setError("Für die Aufteilung werden mindestens zwei Straßen gebraucht.");
      return;
    }

    setBusy(true);
    try {
      const response =
        tab === "map" && plotCount > 1
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
                  area: overlayPlots[index]?.area ?? area,
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
    } finally {
      setBusy(false);
    }
  }

  // Die Karte startet beim zuletzt angelegten Gebiet - Teams arbeiten in einer Region.
  const start = existingAreas.length > 0 ? centerOf(existingAreas[0].area) : null;
  const splitting = tab === "map" && plotCount > 1;

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => {
          resetAll();
          setOpen(true);
        }}
      >
        <IconPlus className="h-4 w-4" />
        Neues Gebiet
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-8 md:max-w-2xl md:rounded-3xl"
          >
            <h2 className="mb-3 text-lg font-bold">Neues Gebiet anlegen</h2>

            <div className="mb-4 flex overflow-hidden rounded-xl border hairline">
              {(
                [
                  { value: "map", label: "Auf der Karte" },
                  { value: "list", label: "Liste einfügen" },
                ] as Array<{ value: Tab; label: string }>
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTab(option.value)}
                  aria-pressed={tab === option.value}
                  className={`flex-1 px-4 py-2 text-sm font-semibold ${
                    tab === option.value ? "bg-brand-600 text-white" : ""
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {tab === "map" && (
              <div className="mb-4 space-y-3">
                <AreaPicker
                  tileUrl={tileUrl}
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

                {!result && (
                  <button
                    type="button"
                    className="btn btn-ghost w-full"
                    onClick={loadStreets}
                    disabled={!area || loadingStreets}
                  >
                    {loadingStreets ? "Straßen werden gesucht …" : "Straßen im Gebiet laden"}
                  </button>
                )}

                {result && (
                  <>
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
                      onChooseAll={(all) =>
                        setChosen(all ? new Set(result.streets.map((s) => s.name)) : new Set())
                      }
                      focus={focus}
                      onFocus={setFocus}
                      plotCount={plotCount}
                      onPlotCount={setPlotCount}
                      plots={plots}
                      plotOf={plotOf}
                      members={members}
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
                      className="muted text-xs font-semibold underline"
                      onClick={loadStreets}
                      disabled={loadingStreets}
                    >
                      {loadingStreets ? "Wird geladen …" : "Straßen neu laden"}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="t-name">
                  {splitting ? "Name der Teilgebiete" : "Gebietsname"}
                </label>
                <input
                  id="t-name"
                  className="input"
                  placeholder="z. B. Innenstadt Nord – KW 38"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
                {splitting && form.name && (
                  <p className="muted mt-1 text-xs">
                    Ergibt: {form.name} (1/{plots.length}) … {form.name} ({plots.length}/
                    {plots.length})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label" htmlFor="t-plz">PLZ</label>
                  <input
                    id="t-plz"
                    className="input"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={(e) => update("postalCode", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label" htmlFor="t-city">Ort</label>
                  <input
                    id="t-city"
                    className="input"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!splitting && (
                  <div>
                    <label className="label" htmlFor="t-user">Zuteilen an</label>
                    <select
                      id="t-user"
                      className="select"
                      value={form.assignedUserId}
                      onChange={(e) => update("assignedUserId", e.target.value)}
                    >
                      <option value="">– später zuteilen –</option>
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
                <div className={splitting ? "col-span-2" : undefined}>
                  <label className="label" htmlFor="t-due">Bis wann</label>
                  <input
                    id="t-due"
                    className="input"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => update("dueDate", e.target.value)}
                  />
                </div>
              </div>

              {tab === "list" && (
                <div>
                  <label className="label" htmlFor="t-streets">
                    Straßen – eine pro Zeile
                  </label>
                  <textarea
                    id="t-streets"
                    className="textarea font-mono text-sm"
                    rows={7}
                    placeholder={"Bahnhofstraße 1-45; 30 WE\nGartenweg\nLindenallee 2-18"}
                    value={form.streets}
                    onChange={(e) => update("streets", e.target.value)}
                  />
                  <p className="muted mt-1 text-xs">
                    Hausnummern und Wohneinheiten sind optional:
                    <code className="mx-1 rounded bg-black/5 px-1">Straße 1-45; 30 WE</code>
                  </p>
                </div>
              )}

              <div>
                <label className="label" htmlFor="t-note">Notiz fürs Team</label>
                <input
                  id="t-note"
                  className="input"
                  placeholder="z. B. Mehrfamilienhäuser, ab 16 Uhr klingeln"
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-signal-500/10 px-3 py-2 text-sm font-medium text-signal-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button type="button" className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy
                  ? "Anlegen …"
                  : splitting
                    ? `${plots.length} Gebiete anlegen`
                    : "Gebiet anlegen"}
              </button>
            </div>
          </form>
        </div>
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
