"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { InlineError, SkeletonList, plural } from "@/components/ui";
import { IconCheckCircle, IconInfo, IconMinus, IconPlus, IconPolygonArea, IconRefresh, IconTrash } from "@/components/icons";
import { labelPoint, type Shape } from "@/lib/geo/shape";
import { loadStreets, StreetsError } from "@/lib/geo/fetch-streets";
import { AreaPicker } from "../AreaPicker";
import type { FoundStreet } from "../StreetResult";

type OtherArea = { id: number; name: string; area: Shape };

/**
 * Seltene Aktionen der Teamleitung hinter den drei Punkten oben rechts:
 * Flaeche, Haeuser, Strassen, Loeschen. Was danach passiert, meldet ein Toast.
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
  const [sheet, setSheet] = useState<"area" | "streets" | "reconcile" | null>(null);

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
              <MenuItem icon={<IconRefresh className="h-5 w-5" />} onSelect={() => setSheet("reconcile")}>
                Häuser abgleichen
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
      {sheet === "reconcile" && area && (
        <ReconcileSheet territoryId={territoryId} area={area} onClose={() => setSheet(null)} />
      )}
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
 * Nachbargebiete werden ausgespart. Vor dem Speichern zeigt die App, welche
 * Haeuser dazukommen und welche wegfallen - gespeichert wird genau das.
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
  const [draft, setDraft] = useState<Shape | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const center = area ? (labelPoint(area)?.point ?? null) : null;
  const review = useReconcile(territoryId, reviewing ? draft : null, true, onClose);

  return (
    <Sheet
      title={reviewing ? "Häuser prüfen" : area ? "Fläche ändern" : "Fläche festlegen"}
      subtitle={`Schritt ${reviewing ? 2 : 1} von 2`}
      width="lg"
      onClose={onClose}
      footer={
        reviewing ? (
          <ReconcileFooter review={review} label="Fläche speichern" onBack={() => setReviewing(false)} />
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => setReviewing(true)}
            disabled={!draft}
          >
            Weiter – Häuser prüfen
          </button>
        )
      }
    >
      {/* Die Karte bleibt beim Pruefen stehen - "Zurueck" findet die Zeichnung wieder. */}
      <div className={reviewing ? "hidden" : undefined}>
        <AreaPicker
          onAreaChange={setDraft}
          existing={otherAreas}
          previous={area}
          start={center ? { lat: center[0], lng: center[1], zoom: 15 } : undefined}
        />
      </div>
      {reviewing && <ReconcileView review={review} />}
    </Sheet>
  );
}

/** Haeuser der bisherigen Flaeche abgleichen - ohne neu zu zeichnen. */
function ReconcileSheet({ territoryId, area, onClose }: { territoryId: number; area: Shape; onClose: () => void }) {
  const review = useReconcile(territoryId, area, false, onClose);
  const nothing = review.result && review.result.added + review.result.pulled + review.result.removed === 0;
  return (
    <Sheet
      title="Häuser abgleichen"
      subtitle="Häuser und Fläche in Einklang bringen"
      onClose={onClose}
      footer={<ReconcileFooter review={review} label={nothing ? "Fertig" : "Übernehmen"} />}
    >
      <ReconcileView review={review} />
    </Sheet>
  );
}

interface ReconcileResult {
  added: number;
  addedStreets: number;
  removed: number;
  moved: number;
  pulled: number;
  keptWorked: number;
  areaChanged: boolean;
}

/**
 * Vorschau und Speichern des Abgleichs. Die Strassen der Flaeche kommen aus
 * OpenStreetMap; ist das nicht erreichbar, geht es ohne neue Haeuser weiter -
 * aufraeumen klappt trotzdem. Gespeichert wird mit derselben Liste, die die
 * Vorschau gesehen hat.
 */
function useReconcile(territoryId: number, area: Shape | null, newArea: boolean, onDone: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [streets, setStreets] = useState<FoundStreet[] | null>(null);
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (list: FoundStreet[], dryRun: boolean) => {
      const response = await fetch(`/api/territories/${territoryId}/reconcile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ area: newArea ? area : undefined, streetList: list, dryRun }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Der Abgleich hat nicht geklappt.");
      return data as ReconcileResult;
    },
    [territoryId, area, newArea],
  );

  useEffect(() => {
    setStreets(null);
    setResult(null);
    setError(null);
    setMapProblem(null);
    if (!area) return;
    let cancelled = false;
    void (async () => {
      let list: FoundStreet[] = [];
      try {
        list = (await loadStreets(area)).streets;
      } catch (caught) {
        if (!cancelled) {
          setMapProblem(
            `${caught instanceof StreetsError ? caught.message : "OpenStreetMap ist nicht erreichbar."} Neue Häuser kommen diesmal nicht dazu.`,
          );
        }
      }
      try {
        const preview = await send(list, true);
        if (cancelled) return;
        setStreets(list);
        setResult(preview);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Keine Verbindung.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [area, send]);

  async function save() {
    if (!streets) return;
    setBusy(true);
    setError(null);
    try {
      const done = await send(streets, false);
      const changes = done.added + done.pulled + done.removed;
      toast(
        newArea
          ? "Fläche gespeichert"
          : changes === 0
            ? "Alles stimmt schon"
            : `${plural(changes, "Haus", "Häuser")} abgeglichen`,
      );
      onDone();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return { result, mapProblem, error, busy, save };
}

type Review = ReturnType<typeof useReconcile>;

function ReconcileFooter({ review, label, onBack }: { review: Review; label: string; onBack?: () => void }) {
  return (
    <div className="space-y-3">
      {review.error && <InlineError>{review.error}</InlineError>}
      <div className="flex gap-2">
        {onBack && (
          <button type="button" className="btn btn-secondary btn-lg shrink-0" onClick={onBack} disabled={review.busy}>
            Zurück
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-lg flex-1"
          onClick={() => void review.save()}
          disabled={review.busy || !review.result}
        >
          {review.busy ? "Speichern …" : label}
        </button>
      </div>
    </div>
  );
}

/** Was der Abgleich aendert - jede Zeile ein Satz, mit Plus, Minus oder Hinweis. */
function ReconcileView({ review }: { review: Review }) {
  const { result, mapProblem, error } = review;
  if (!result) {
    return error ? null : (
      <div aria-busy="true" aria-label="Häuser werden geprüft">
        <p className="mb-3 px-1 text-footnote text-muted">Häuser werden mit OpenStreetMap abgeglichen …</p>
        <SkeletonList rows={3} />
      </div>
    );
  }
  const nothing = result.added + result.pulled + result.removed === 0;
  return (
    <div className="space-y-3">
      <ul className="list list-icons">
        {result.added > 0 && (
          <ChangeRow sign="plus" title={plural(result.added, "neues Haus", "neue Häuser")}>
            {result.addedStreets > 0
              ? `aus der Karte · ${plural(result.addedStreets, "neue Straße", "neue Straßen")}`
              : "aus der Karte"}
          </ChangeRow>
        )}
        {result.pulled > 0 && (
          <ChangeRow sign="plus" title={plural(result.pulled, "Haus kommt", "Häuser kommen")}>
            aus anderen Gebieten – sie liegen in dieser Fläche
          </ChangeRow>
        )}
        {result.removed > 0 && (
          <ChangeRow sign="minus" title={plural(result.removed, "Haus fällt", "Häuser fallen")}>
            {result.moved > 0
              ? `weg, sie liegen außerhalb · ${result.moved} davon ins Gebiet, in dem sie liegen`
              : "weg, sie liegen außerhalb der Fläche"}
          </ChangeRow>
        )}
        {result.keptWorked > 0 && (
          <ChangeRow sign="info" title={plural(result.keptWorked, "besuchtes Haus bleibt", "besuchte Häuser bleiben")}>
            liegen außerhalb, haben aber schon Besuche, Klingeln oder eine Sperre
          </ChangeRow>
        )}
        {nothing && result.keptWorked === 0 && (
          <ChangeRow sign="ok" title="Alles stimmt">
            Häuser und Fläche passen zusammen
          </ChangeRow>
        )}
      </ul>
      {mapProblem && <p className="px-1 text-footnote text-muted">{mapProblem}</p>}
    </div>
  );
}

function ChangeRow({
  sign,
  title,
  children,
}: {
  sign: "plus" | "minus" | "info" | "ok";
  title: string;
  children: React.ReactNode;
}) {
  const icon =
    sign === "plus" ? (
      <IconPlus className="h-4 w-4" />
    ) : sign === "minus" ? (
      <IconMinus className="h-4 w-4" />
    ) : sign === "ok" ? (
      <IconCheckCircle className="h-4 w-4" />
    ) : (
      <IconInfo className="h-4 w-4" />
    );
  return (
    <li className="cell">
      <span
        className={`glyph glyph-round shrink-0 ${sign === "plus" || sign === "ok" ? "text-accent-ink" : sign === "minus" ? "text-danger" : "text-muted"}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body">{title}</span>
        <span className="block text-footnote text-muted">{children}</span>
      </span>
    </li>
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
      toast(data.added === 0 ? "Alle Straßen schon im Gebiet" : `${plural(data.added, "Straße", "Straßen")} eingetragen`);
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
