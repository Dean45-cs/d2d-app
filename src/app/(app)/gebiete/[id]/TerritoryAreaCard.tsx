"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AreaMap } from "@/components/AreaMap";
import { EmptyState, Note, plural } from "@/components/ui";
import { IconInfo, IconMap } from "@/components/icons";
import { AreaPicker } from "../AreaPicker";
import { centerOf, type LatLng } from "@/lib/geo/area";

interface StreetPin {
  name: string;
  lat: number;
  lng: number;
  state: "open" | "active" | "done";
  hint: string;
}

interface Props {
  territoryId: number;
  name: string;
  area: LatLng[] | null;
  pins: StreetPin[];
  isLeader: boolean;
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
    <div className="card mb-4 p-5">
      <div className="section-head mb-3 flex-wrap">
        <h2 className="section-title">Karte</h2>
        {isLeader && (
          <div className="flex flex-wrap gap-2">
            {area && !editing && (
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-pill"
                onClick={importStreets}
                disabled={busy}
              >
                {busy ? "…" : "Straßen nachladen"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-pill"
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
          <Note icon={<IconInfo className="h-4 w-4" />}>
            {area
              ? "Neue Fläche zeichnen – die bisherige liegt gestrichelt darunter und wird ersetzt."
              : "Fläche für dieses Gebiet abstecken."}
          </Note>
          <AreaPicker
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
        <div
          className="overflow-hidden rounded-[var(--r-md)] border"
          style={{ borderColor: "var(--line)" }}
        >
          <AreaMap
            areas={[{ id: territoryId, name, area, tone: "brand" }]}
            pins={pins.map((p) => ({
              lat: p.lat,
              lng: p.lng,
              label: p.name,
              hint: p.hint,
              state: p.state,
            }))}
            legend={
              pins.length > 0
                ? [
                    { color: "var(--ink-muted)", label: "offen" },
                    { color: "var(--brand-600)", label: "in Arbeit" },
                    { color: "var(--energy-600)", label: "fertig" },
                  ]
                : undefined
            }
            className="h-[40vh] min-h-[240px] w-full"
          />
        </div>
      ) : (
        <EmptyState
          bare
          icon={<IconMap className="h-5 w-5" />}
          title="Noch keine Fläche"
          text={
            isLeader
              ? "Mit einer Fläche auf der Karte lädt die App die Straßen und Hausnummern selbst."
              : undefined
          }
        />
      )}

      {message && (
        <p className="mt-2 text-[12px] font-semibold text-tint">{message}</p>
      )}
      {error && <p className="mt-2 text-[12px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
