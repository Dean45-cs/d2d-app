"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { StreetWithStats } from "@/lib/queries";
import type { RejectionReason, VisitOutcome } from "@/lib/types";
import type { Totals, VisitRow } from "@/lib/queries";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { StatTile } from "@/components/ui";

type TerritoryLite = {
  id: number;
  name: string;
  city: string;
  postal_code: string;
};

type EnergyType = "STROM" | "GAS" | "BEIDES";

interface Props {
  territories: TerritoryLite[];
  streets: StreetWithStats[];
  reasons: RejectionReason[];
  todayTotals: Totals;
  recent: VisitRow[];
  tarifrechnerUrl: string;
}

const PRODUCTS: Array<{ value: EnergyType; label: string }> = [
  { value: "STROM", label: "Strom" },
  { value: "GAS", label: "Gas" },
  { value: "BEIDES", label: "Strom + Gas" },
];

export function TourClient({
  territories,
  streets,
  reasons,
  todayTotals,
  recent,
  tarifrechnerUrl,
}: Props) {
  const router = useRouter();

  const [territoryId, setTerritoryId] = useState<number | null>(
    territories[0]?.id ?? null,
  );
  const [streetId, setStreetId] = useState<number | null>(null);
  const [houseNumber, setHouseNumber] = useState("");
  const [product, setProduct] = useState<EnergyType>("BEIDES");
  const [sheet, setSheet] = useState<null | "reason" | "sale">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastVisitId, setLastVisitId] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Zuletzt gewähltes Produkt merken, damit an der Tür kein Extra-Tap nötig ist.
  useEffect(() => {
    const stored = window.localStorage.getItem("d2d_product");
    if (stored === "STROM" || stored === "GAS" || stored === "BEIDES") {
      setProduct(stored);
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const streetsOfTerritory = useMemo(
    () => streets.filter((s) => s.territory_id === territoryId),
    [streets, territoryId],
  );
  const street = useMemo(
    () => streets.find((s) => s.id === streetId) ?? null,
    [streets, streetId],
  );
  const territory = territories.find((t) => t.id === territoryId) ?? null;

  async function save(
    outcome: VisitOutcome,
    extra: { reasonId?: number | null; reasonNote?: string } = {},
  ): Promise<number | null> {
    setBusy(true);
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          territoryId,
          streetId,
          houseNumber,
          outcome,
          reasonId: extra.reasonId ?? null,
          reasonNote: extra.reasonNote ?? "",
          energyType: outcome === "SALE" ? product : "",
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? "Speichern fehlgeschlagen");
        return null;
      }
      setLastVisitId(data.id);
      setHouseNumber("");
      setNote("");
      router.refresh();
      return data.id as number;
    } catch {
      setToast("Keine Verbindung – bitte nochmal tippen");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleOutcome(outcome: VisitOutcome) {
    if (outcome === "MET_NO_SALE") {
      setSheet("reason");
      return;
    }
    const id = await save(outcome);
    if (id) {
      setToast(
        outcome === "NOT_HOME" ? "Nicht angetroffen gespeichert" : "Termin gespeichert",
      );
    }
  }

  /**
   * Abschluss: Der Tarifrechner wird SOFORT beim Tippen geöffnet (sonst blockt
   * der Browser das Fenster), gespeichert wird parallel im Hintergrund.
   */
  async function handleSale() {
    const win = window.open(tarifrechnerUrl, "_blank", "noopener,noreferrer");
    const id = await save("SALE");
    if (id) setToast("Abschluss gespeichert – viel Erfolg bei der Erfassung!");
    if (!win) window.location.href = tarifrechnerUrl;
  }

  async function handleReason(reason: RejectionReason) {
    const needsNote = reason.code === "SONSTIGES";
    if (needsNote && !note.trim()) {
      setToast("Bitte kurz eintragen, woran es lag");
      return;
    }
    const id = await save("MET_NO_SALE", { reasonId: reason.id, reasonNote: note.trim() });
    if (id) {
      setSheet(null);
      setToast(`Gespeichert: ${reason.label}`);
    }
  }

  async function undo() {
    if (!lastVisitId) return;
    const response = await fetch(`/api/visits/${lastVisitId}`, { method: "DELETE" });
    const data = await response.json();
    setToast(response.ok ? "Letzter Eintrag entfernt" : (data.error ?? "Nicht möglich"));
    if (response.ok) {
      setLastVisitId(null);
      router.refresh();
    }
  }

  function chooseProduct(value: EnergyType) {
    setProduct(value);
    window.localStorage.setItem("d2d_product", value);
  }

  /* ----------------------------- leeres Gebiet ---------------------------- */

  if (territories.length === 0) {
    return (
      <div className="card mx-auto max-w-md px-6 py-12 text-center">
        <p className="text-base font-semibold">Noch kein Gebiet zugeteilt</p>
        <p className="muted mt-2 text-sm">
          Deine Teamleitung muss dir zuerst ein Gebiet mit Straßen zuweisen.
          Danach erscheint es hier automatisch.
        </p>
      </div>
    );
  }

  /* -------------------------------- Ansicht ------------------------------- */

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatTile label="Türen heute" value={todayTotals.doors ?? 0} />
        <StatTile
          label="Angetroffen"
          value={todayTotals.met ?? 0}
          tone="brand"
          hint={
            todayTotals.doors
              ? `${Math.round(((todayTotals.met ?? 0) / todayTotals.doors) * 100)} % Quote`
              : undefined
          }
        />
        <StatTile label="Abschlüsse" value={todayTotals.sales ?? 0} tone="success" />
      </div>

      {/* Gebiets- und Straßenwahl */}
      <div className="card mb-4 p-4">
        <label className="label" htmlFor="territory">
          Gebiet
        </label>
        <select
          id="territory"
          className="select mb-3"
          value={territoryId ?? ""}
          onChange={(e) => {
            setTerritoryId(Number(e.target.value));
            setStreetId(null);
          }}
        >
          {territories.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.city ? ` · ${t.city}` : ""}
            </option>
          ))}
        </select>

        <label className="label" htmlFor="street">
          Straße
        </label>
        {streetsOfTerritory.length === 0 ? (
          <p className="muted text-sm">
            In diesem Gebiet sind noch keine Straßen hinterlegt.
          </p>
        ) : (
          <select
            id="street"
            className="select"
            value={streetId ?? ""}
            onChange={(e) => setStreetId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">– Straße wählen –</option>
            {streetsOfTerritory.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.house_numbers ? ` ${s.house_numbers}` : ""}
                {s.visit_count ? ` · ${s.visit_count} erfasst` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Türerfassung */}
      <div className="card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {street ? street.name : "Keine Straße gewählt"}
            </p>
            <p className="muted truncate text-xs">
              {territory?.postal_code} {territory?.city}
            </p>
          </div>
          {street && street.visit_count > 0 && (
            <p className="muted shrink-0 text-xs tabular-nums">
              {street.visit_count} Türen · {street.sale_count} Abschl.
            </p>
          )}
        </div>

        <label className="label" htmlFor="house">
          Hausnummer
        </label>
        <div className="mb-4 flex gap-2">
          <input
            id="house"
            className="input text-lg font-semibold"
            inputMode="numeric"
            autoComplete="off"
            placeholder="z. B. 12a"
            value={houseNumber}
            onChange={(e) => setHouseNumber(e.target.value.slice(0, 12))}
          />
          <button
            type="button"
            className="btn btn-ghost px-4 text-lg"
            aria-label="Hausnummer um 1 erhöhen"
            onClick={() => {
              const match = houseNumber.match(/^(\d+)(.*)$/);
              setHouseNumber(match ? `${Number(match[1]) + 1}${match[2]}` : "1");
            }}
          >
            +1
          </button>
        </div>

        {/* Produktwahl – gilt für den nächsten Abschluss */}
        <div className="mb-4">
          <p className="label">Produkt für den Abschluss</p>
          <div className="grid grid-cols-3 gap-2">
            {PRODUCTS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => chooseProduct(p.value)}
                className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                  product === p.value
                    ? "border-transparent bg-brand-600 text-white"
                    : "hairline border"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Die drei Ergebnisse */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleOutcome("NOT_HOME")}
            className="tap-tile"
          >
            <span className="tap-tile-emoji">🚪</span>
            Nicht angetroffen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleOutcome("MET_NO_SALE")}
            className="tap-tile"
            style={{ borderColor: "var(--signal-400)" }}
          >
            <span className="tap-tile-emoji">🙋</span>
            Angetroffen – kein Abschluss
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleOutcome("APPOINTMENT")}
            className="tap-tile col-span-2"
            style={{ borderColor: "var(--brand-400)", minHeight: "4rem" }}
          >
            <span className="tap-tile-emoji">📅</span>
            Termin vereinbart
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleSale}
          className="btn btn-success mt-2 w-full py-5 text-lg"
        >
          <IconCheck />
          Abschluss – zur Auftragserfassung
          <IconArrowRight />
        </button>
        <p className="muted mt-2 text-center text-[11px]">
          Öffnet den Tarifrechner des Partners und speichert den Abschluss automatisch.
        </p>

        {lastVisitId && (
          <button
            type="button"
            onClick={undo}
            className="muted mt-3 w-full text-center text-xs font-semibold underline"
          >
            Letzten Eintrag rückgängig machen
          </button>
        )}
      </div>

      {/* Letzte Einträge */}
      {recent.length > 0 && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-sm font-semibold">Zuletzt erfasst</p>
          <ul className="space-y-1.5">
            {recent.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">{outcomeEmoji(v.outcome, v.reason_emoji)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {v.street_name ?? "–"} {v.house_number}
                  {v.reason_label && (
                    <span className="muted"> · {v.reason_label}</span>
                  )}
                </span>
                <span className="muted shrink-0 text-xs tabular-nums">
                  {formatTime(v.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom-Sheet: Ablehnungsgrund */}
      {sheet === "reason" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-8 md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-base font-bold">Warum kein Abschluss?</h2>
              <p className="muted text-xs">
                Einmal tippen genügt – der Eintrag wird sofort gespeichert.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {reasons.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handleReason(reason)}
                  className="tap-tile"
                >
                  <span className="tap-tile-emoji">{reason.emoji || "💬"}</span>
                  {reason.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="note">
                Notiz (optional)
              </label>
              <input
                id="note"
                className="input"
                placeholder="z. B. nächste Woche nochmal"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn btn-ghost mt-4 w-full"
              onClick={() => setSheet(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto w-fit max-w-[92vw] rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

function outcomeEmoji(outcome: string, reasonEmoji: string | null): string {
  if (outcome === "SALE") return "✅";
  if (outcome === "APPOINTMENT") return "📅";
  if (outcome === "NOT_HOME") return "🚪";
  return reasonEmoji || "🙋";
}

function formatTime(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}
