"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaMap } from "@/components/AreaMap";
import { plural } from "@/components/ui";
import { AreaPicker } from "../AreaPicker";
import { centerOf, type LatLng } from "@/lib/geo/area";

interface StreetPin {
  name: string;
  lat: number;
  lng: number;
  done: boolean;
  hint: string;
}

interface Props {
  territoryId: number;
  name: string;
  area: LatLng[] | null;
  pins: StreetPin[];
  isLeader: boolean;
  tileUrl: string;
  otherAreas: Array<{ id: number; name: string; area: LatLng[] }>;
}

/**
 * Gebietskarte auf der Detailseite: zeigt die Fläche und die Straßen darin.
 * Die Teamleitung kann die Fläche neu ziehen und die Straßen daraus nachladen.
 */
export function TerritoryAreaCard({
  territoryId,
  name,
  area,
  pins,
  isLeader,
  tileUrl,
  otherAreas,
}: Props) {
  const router = useRouter();
  const center = area ? centerOf(area) : null;
  const start = center ? { lat: center[0], lng: center[1], zoom: 15 } : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LatLng[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveArea() {
    if (!draft) {
      setError("Bitte zuerst eine Fläche auf der Karte markieren.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territoryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area: draft }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Die Fläche konnte nicht gespeichert werden.");
        return;
      }
      setEditing(false);
      setMessage("Fläche gespeichert.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /** Straßen aus der gespeicherten Fläche holen und ins Gebiet übernehmen. */
  async function importStreets() {
    if (!area) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const found = await fetch("/api/geo/streets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area }),
      });
      const data = await found.json();
      if (!found.ok) {
        setError(data.error ?? "Die Straßen konnten nicht geladen werden.");
        return;
      }
      if (data.streets.length === 0) {
        setMessage("In dieser Fläche sind keine Straßen hinterlegt.");
        return;
      }
      const saved = await fetch(`/api/territories/${territoryId}/streets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streetList: data.streets }),
      });
      const savedData = await saved.json();
      if (!saved.ok) {
        setError(savedData.error ?? "Die Straßen konnten nicht gespeichert werden.");
        return;
      }
      setMessage(
        savedData.added === 0
          ? "Alle Straßen aus der Fläche sind bereits im Gebiet."
          : `${plural(savedData.added, "Straße", "Straßen")} übernommen.`,
      );
      router.refresh();
    } catch {
      setError("OpenStreetMap ist gerade nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  }

  if (!area && !isLeader) return null;

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Gebiet auf der Karte</p>
        {isLeader && (
          <div className="flex flex-wrap gap-2">
            {area && !editing && (
              <button
                type="button"
                className="btn btn-ghost px-3 py-1.5 text-sm"
                onClick={importStreets}
                disabled={busy}
              >
                {busy ? "…" : "Straßen nachladen"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-sm"
              onClick={() => {
                setDraft(null);
                setEditing((v) => !v);
                setMessage(null);
                setError(null);
              }}
            >
              {editing ? "Abbrechen" : area ? "Fläche ändern" : "Fläche festlegen"}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <p className="muted text-xs">
            {area
              ? "Neue Fläche zeichnen – die bisherige liegt gestrichelt darunter und wird ersetzt."
              : "Fläche für dieses Gebiet abstecken."}
          </p>
          <AreaPicker
            tileUrl={tileUrl}
            onAreaChange={setDraft}
            existing={
              area
                ? [...otherAreas, { id: territoryId, name: "bisherige Fläche", area }]
                : otherAreas
            }
            start={start ?? undefined}
          />
          <button
            type="button"
            className="btn btn-primary w-full"
            onClick={saveArea}
            disabled={busy || !draft}
          >
            {busy ? "Speichern …" : "Fläche speichern"}
          </button>
        </div>
      ) : area ? (
        <>
          <AreaMap
            tileUrl={tileUrl}
            areas={[{ id: territoryId, name, area, tone: "brand" }]}
            pins={pins.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              label: p.name,
              hint: p.hint,
              done: p.done,
            }))}
            className="h-[40vh] min-h-[240px] w-full"
          />
          {pins.length > 0 && (
            <p className="muted mt-2 text-xs">
              Punkte sind die Straßen des Gebiets – grün, sobald dort Türen erfasst wurden.
            </p>
          )}
        </>
      ) : (
        <p className="muted text-sm">
          Für dieses Gebiet ist noch keine Fläche hinterlegt. Mit „Fläche festlegen“ lässt
          sie sich auf der Karte nachtragen – danach können die Straßen automatisch
          geladen werden.
        </p>
      )}

      {message && <p className="mt-2 text-xs font-semibold text-brand-600">{message}</p>}
      {error && <p className="mt-2 text-xs font-semibold text-signal-600">{error}</p>}
    </div>
  );
}
