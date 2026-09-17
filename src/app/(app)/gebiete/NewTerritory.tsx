"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus } from "@/components/icons";
import { plural } from "@/components/ui";
import type { User } from "@/lib/types";
import { centerOf, type LatLng } from "@/lib/geo/area";
import { AreaPicker, type ExistingArea } from "./AreaPicker";

interface FoundStreet {
  name: string;
  houseNumbers: string;
  units: number;
  addresses: number;
  lat: number | null;
  lng: number | null;
}

interface StreetResult {
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
  const [result, setResult] = useState<StreetResult | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

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

  function close() {
    setOpen(false);
  }

  function resetAll() {
    setForm({ name: "", city: "", postalCode: "", assignedUserId: "", streets: "", note: "", dueDate: "" });
    setArea(null);
    setResult(null);
    setChosen(new Set());
    setError(null);
  }

  /** Straßen aus OpenStreetMap zur gezeichneten Fläche holen. */
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
      const found = data as StreetResult;
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

  function toggleStreet(name: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // Die Karte startet beim zuletzt angelegten Gebiet - Teams arbeiten in einer Region.
  const start = existingAreas.length > 0 ? centerOf(existingAreas[0].area) : null;

  const selectedStreets = result?.streets.filter((s) => chosen.has(s.name)) ?? [];
  const selectedUnits = selectedStreets.reduce((sum, s) => sum + s.units, 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (tab === "map" && !area) {
      setError("Bitte zuerst ein Gebiet auf der Karte markieren.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/territories", {
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
      router.push(`/gebiete/${data.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

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
          onClick={close}
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
                    if (result) setResult(null);
                  }}
                  existing={existingAreas}
                  start={start ? { lat: start[0], lng: start[1], zoom: 14 } : undefined}
                />

                <button
                  type="button"
                  className="btn btn-ghost w-full"
                  onClick={loadStreets}
                  disabled={!area || loadingStreets}
                >
                  {loadingStreets ? "Straßen werden gesucht …" : "Straßen im Gebiet laden"}
                </button>

                {result && (
                  <div className="rounded-xl border hairline">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 hairline">
                      <p className="text-sm font-semibold">
                        {plural(result.streets.length, "Straße", "Straßen")} ·{" "}
                        {plural(result.addressCount, "Adresse", "Adressen")}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="muted text-xs font-semibold underline"
                          onClick={() => setChosen(new Set(result.streets.map((s) => s.name)))}
                        >
                          alle
                        </button>
                        <button
                          type="button"
                          className="muted text-xs font-semibold underline"
                          onClick={() => setChosen(new Set())}
                        >
                          keine
                        </button>
                      </div>
                    </div>

                    {result.streets.length === 0 ? (
                      <p className="muted px-3 py-4 text-sm">
                        In dieser Fläche sind keine Straßen hinterlegt. Zeichne etwas größer
                        oder trage die Straßen über „Liste einfügen“ von Hand ein.
                      </p>
                    ) : (
                      <ul className="max-h-56 divide-y overflow-y-auto hairline">
                        {result.streets.map((street) => (
                          <li key={street.name}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                              <input
                                type="checkbox"
                                className="h-5 w-5 shrink-0 accent-[var(--brand-600)]"
                                checked={chosen.has(street.name)}
                                onChange={() => toggleStreet(street.name)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {street.name}
                                </span>
                                <span className="muted block text-xs">
                                  {street.houseNumbers
                                    ? `Nr. ${street.houseNumbers}`
                                    : "keine Hausnummern hinterlegt"}
                                  {street.units > 0 && ` · ${street.units} Wohneinheiten`}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="muted border-t px-3 py-2 text-xs hairline">
                      Ausgewählt: {plural(selectedStreets.length, "Straße", "Straßen")},{" "}
                      {plural(selectedUnits, "Wohneinheit", "Wohneinheiten")}.
                      Die Zahlen stammen aus OpenStreetMap und lassen sich später anpassen.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="t-name">Gebietsname</label>
                <input
                  id="t-name"
                  className="input"
                  placeholder="z. B. Innenstadt Nord – KW 38"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
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
                <div>
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
              <button type="button" className="btn btn-ghost flex-1" onClick={close}>
                Abbrechen
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy ? "Anlegen …" : "Gebiet anlegen"}
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
