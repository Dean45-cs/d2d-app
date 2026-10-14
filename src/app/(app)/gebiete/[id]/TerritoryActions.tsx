"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { InlineError, plural } from "@/components/ui";
import { IconPlus, IconPolygonArea, IconRefresh, IconTrash } from "@/components/icons";
import { labelPoint, type Shape } from "@/lib/geo/shape";
import { loadStreets, StreetsError } from "@/lib/geo/fetch-streets";
import { AreaPicker } from "../AreaPicker";

type OtherArea = { id: number; name: string; area: Shape };

/**
 * Seltene Aktionen der Teamleitung hinter den drei Punkten oben rechts:
 * Flaeche, Strassen, Loeschen. Was danach passiert, meldet ein Toast.
 */
export function TerritoryActions({
  territoryId,
  name,
  area,
  otherAreas,
  canEdit,
  canDelete,
}: {
  territoryId: number;
  name: string;
  area: Shape | null;
  otherAreas: OtherArea[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [sheet, setSheet] = useState<"area" | "streets" | null>(null);
  const [busy, setBusy] = useState(false);

  /** Strassen aus der gespeicherten Flaeche holen und ins Gebiet uebernehmen. */
  async function importStreets() {
    if (!area || busy) return;
    setBusy(true);
    toast("Straßen werden geladen …");
    try {
      const data = await loadStreets(area);
      if (data.streets.length === 0) {
        toast("Keine Straßen in der Fläche");
        return;
      }
      const response = await fetch(`/api/territories/${territoryId}/streets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streetList: data.streets }),
      });
      const saved = await response.json();
      if (!response.ok) {
        toast(saved.error ?? "Straßen nicht gespeichert");
        return;
      }
      toast(saved.added === 0 ? "Alle Straßen schon im Gebiet" : `${plural(saved.added, "Straße", "Straßen")} übernommen`);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof StreetsError ? caught.message : "OpenStreetMap nicht erreichbar");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `„${name}“ löschen?`,
      text: "Straßen und Fläche verschwinden. Erfasste Türen und Abschlüsse bleiben in der Auswertung.",
      confirmLabel: "Gebiet löschen",
      danger: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/territories/${territoryId}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      toast(data?.error ?? "Gebiet nicht gelöscht");
      return;
    }
    toast("Gebiet gelöscht");
    router.replace("/gebiete");
    router.refresh();
  }

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <Menu label="Gebiet bearbeiten">
        {canEdit && (
          <>
            <MenuItem icon={<IconPolygonArea className="h-5 w-5" />} onSelect={() => setSheet("area")}>
              {area ? "Fläche ändern" : "Fläche festlegen"}
            </MenuItem>
            {area && (
              <MenuItem icon={<IconRefresh className="h-5 w-5" />} onSelect={() => void importStreets()}>
                Straßen nachladen
              </MenuItem>
            )}
            <MenuItem icon={<IconPlus className="h-5 w-5" />} onSelect={() => setSheet("streets")}>
              Straßen eintragen
            </MenuItem>
          </>
        )}
        {canEdit && canDelete && <MenuSeparator />}
        {canDelete && (
          <MenuItem icon={<IconTrash className="h-5 w-5" />} tone="danger" onSelect={() => void remove()}>
            Gebiet löschen
          </MenuItem>
        )}
      </Menu>
      {sheet === "area" && (
        <AreaSheet territoryId={territoryId} area={area} otherAreas={otherAreas} onClose={() => setSheet(null)} />
      )}
      {sheet === "streets" && <AddStreetsSheet territoryId={territoryId} onClose={() => setSheet(null)} />}
      {dialog}
    </>
  );
}

/** Knopf im leeren Zustand der Karte: Flaeche zum ersten Mal abstecken. */
export function AreaSetupButton({ territoryId, otherAreas }: { territoryId: number; otherAreas: OtherArea[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Fläche festlegen
      </button>
      {open && <AreaSheet territoryId={territoryId} area={null} otherAreas={otherAreas} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Flaeche neu ziehen: die bisherige liegt gestrichelt darunter,
 * Nachbargebiete werden ausgespart.
 */
function AreaSheet({
  territoryId,
  area,
  otherAreas,
  onClose,
}: {
  territoryId: number;
  area: Shape | null;
  otherAreas: OtherArea[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Shape | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const center = area ? (labelPoint(area)?.point ?? null) : null;

  async function save() {
    if (!draft) return;
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
        setError(data.error ?? "Fläche nicht gespeichert.");
        return;
      }
      toast("Fläche gespeichert");
      onClose();
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={area ? "Fläche ändern" : "Fläche festlegen"}
      width="lg"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={save} disabled={busy || !draft}>
            {busy ? "Speichern …" : "Fläche speichern"}
          </button>
        </div>
      }
    >
      <AreaPicker
        onAreaChange={setDraft}
        existing={otherAreas}
        previous={area}
        start={center ? { lat: center[0], lng: center[1], zoom: 15 } : undefined}
      />
    </Sheet>
  );
}

/** Strassen von Hand eintragen - eine pro Zeile, wie auf dem Laufzettel. */
function AddStreetsSheet({ territoryId, onClose }: { territoryId: number; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territoryId}/streets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ streets: raw }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Straßen nicht gespeichert.");
        return;
      }
      toast("Straßen eingetragen");
      onClose();
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Straßen eintragen" subtitle="Eine pro Zeile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="sr-only" htmlFor="street-input">
          Straßen
        </label>
        <textarea
          id="street-input"
          className="field min-h-36 font-mono"
          rows={5}
          placeholder={"Bahnhofstraße 1-45; 30 WE\nGartenweg"}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          required
        />
        {error && <InlineError>{error}</InlineError>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !raw.trim()}>
          {busy ? "Speichern …" : "Eintragen"}
        </button>
      </form>
    </Sheet>
  );
}
