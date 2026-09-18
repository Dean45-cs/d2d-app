"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { routeUrl } from "@/lib/map";
import type { StreetWithStats, Totals, VisitRow } from "@/lib/queries";
import type { RejectionReason, VisitOutcome } from "@/lib/types";
import { OUTCOME_LABEL } from "@/lib/types";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { StatTile } from "@/components/ui";
import {
  enqueue,
  flush,
  getQueue,
  remove as removeQueued,
  startAutoFlush,
  subscribe,
  type QueuedVisit,
} from "@/lib/offline-queue";

type TerritoryLite = {
  id: number;
  name: string;
  city: string;
  postal_code: string;
};

type EnergyType = "STROM" | "GAS" | "BEIDES";

type SaveResult =
  | { status: "saved"; id: number }
  | { status: "queued" }
  | { status: "error" };

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
  const [sheet, setSheet] = useState<null | "reason">(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastVisitId, setLastVisitId] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState<QueuedVisit[]>([]);
  const [online, setOnline] = useState(true);

  /* --------------------------- Gerät & Umgebung --------------------------- */

  // Zuletzt gewähltes Produkt und Straße merken – spart Taps an der Tür.
  useEffect(() => {
    const storedProduct = window.localStorage.getItem("d2d_product");
    if (storedProduct === "STROM" || storedProduct === "GAS" || storedProduct === "BEIDES") {
      setProduct(storedProduct);
    }
    const storedStreet = Number(window.localStorage.getItem("d2d_street"));
    if (storedStreet && streets.some((s) => s.id === storedStreet)) {
      setStreetId(storedStreet);
      const street = streets.find((s) => s.id === storedStreet);
      if (street) setTerritoryId(street.territory_id);
    }
  }, [streets]);

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

  // Warteschlange beobachten und automatisch nachsenden
  useEffect(() => {
    setPending(getQueue());
    setOnline(navigator.onLine);

    const unsubscribe = subscribe(setPending);
    const stopAutoFlush = startAutoFlush((result) => {
      if (result.sent > 0) {
        setToast(
          result.sent === 1
            ? "1 gepufferter Eintrag wurde gesendet"
            : `${result.sent} gepufferte Einträge wurden gesendet`,
        );
        router.refresh();
      }
      if (result.rejected > 0) {
        setToast(`${result.rejected} Eintrag/Einträge konnten nicht gespeichert werden`);
      }
    });

    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      unsubscribe();
      stopAutoFlush();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [router]);

  /* -------------------------------- Auswahl ------------------------------- */

  const streetsOfTerritory = useMemo(
    () => streets.filter((s) => s.territory_id === territoryId),
    [streets, territoryId],
  );
  const street = useMemo(
    () => streets.find((s) => s.id === streetId) ?? null,
    [streets, streetId],
  );
  const territory = territories.find((t) => t.id === territoryId) ?? null;

  const chooseStreet = useCallback((value: number | null) => {
    setStreetId(value);
    if (value) window.localStorage.setItem("d2d_street", String(value));
    else window.localStorage.removeItem("d2d_street");
  }, []);

  /* ------------------------------- Speichern ------------------------------ */

  async function save(
    outcome: VisitOutcome,
    extra: { reasonId?: number | null; reasonNote?: string } = {},
  ): Promise<SaveResult> {
    const payload = {
      territoryId,
      streetId,
      houseNumber,
      outcome,
      reasonId: extra.reasonId ?? null,
      reasonNote: extra.reasonNote ?? "",
      energyType: outcome === "SALE" ? product : "",
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
    };

    setBusy(true);
    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? "Speichern fehlgeschlagen");
        return { status: "error" };
      }
      setLastVisitId(data.id);
      setHouseNumber("");
      setNote("");
      router.refresh();
      return { status: "saved", id: data.id as number };
    } catch {
      // Kein Netz: Eintrag lokal puffern, damit nichts verloren geht.
      const label = [
        street?.name ?? "",
        houseNumber,
        "·",
        OUTCOME_LABEL[outcome],
      ]
        .filter(Boolean)
        .join(" ");
      enqueue(label, payload);
      setLastVisitId(null);
      setHouseNumber("");
      setNote("");
      return { status: "queued" };
    } finally {
      setBusy(false);
    }
  }

  function report(result: SaveResult, savedText: string) {
    if (result.status === "saved") setToast(savedText);
    else if (result.status === "queued") {
      setToast("Kein Netz – gespeichert, wird automatisch nachgesendet");
    }
  }

  async function handleOutcome(outcome: VisitOutcome) {
    if (outcome === "MET_NO_SALE") {
      setSheet("reason");
      return;
    }
    const result = await save(outcome);
    report(
      result,
      outcome === "NOT_HOME" ? "Nicht angetroffen gespeichert" : "Termin gespeichert",
    );
  }

  /**
   * Abschluss: Der Tarifrechner wird SOFORT beim Tippen geöffnet (sonst blockt
   * der Browser das Fenster), gespeichert wird parallel im Hintergrund.
   */
  async function handleSale() {
    const win = window.open(tarifrechnerUrl, "_blank", "noopener,noreferrer");
    const result = await save("SALE");
    report(result, "Abschluss gespeichert – viel Erfolg bei der Erfassung!");
    if (!win) window.location.href = tarifrechnerUrl;
  }

  async function handleReason(reason: RejectionReason) {
    if (reason.code === "SONSTIGES" && !note.trim()) {
      setToast("Bitte kurz eintragen, woran es lag");
      return;
    }
    const result = await save("MET_NO_SALE", {
      reasonId: reason.id,
      reasonNote: note.trim(),
    });
    if (result.status !== "error") {
      setSheet(null);
      report(result, `Gespeichert: ${reason.label}`);
    }
  }

  async function undo() {
    if (!lastVisitId) return;
    try {
      const response = await fetch(`/api/visits/${lastVisitId}`, { method: "DELETE" });
      const data = await response.json();
      setToast(response.ok ? "Letzter Eintrag entfernt" : (data.error ?? "Nicht möglich"));
      if (response.ok) {
        setLastVisitId(null);
        router.refresh();
      }
    } catch {
      setToast("Ohne Verbindung nicht möglich");
    }
  }

  function chooseProduct(value: EnergyType) {
    setProduct(value);
    window.localStorage.setItem("d2d_product", value);
  }

  async function sendPendingNow() {
    setToast("Sende …");
    const result = await flush();
    if (result.sent > 0) {
      setToast(`${result.sent} Eintrag/Einträge gesendet`);
      router.refresh();
    } else if (result.remaining > 0) {
      setToast("Immer noch keine Verbindung");
    }
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
      {(!online || pending.length > 0) && (
        <div
          className="mb-3 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
          style={{
            background: "color-mix(in srgb, var(--gas-500) 16%, transparent)",
            color: "var(--gas-600)",
          }}
        >
          <span className="text-lg leading-none">{online ? "⏳" : "📴"}</span>
          <span className="min-w-0 flex-1 font-medium">
            {pending.length > 0
              ? `${pending.length} ${pending.length === 1 ? "Eintrag wartet" : "Einträge warten"} auf Verbindung`
              : "Kein Netz – Einträge werden gepuffert"}
          </span>
          {pending.length > 0 && online && (
            <button
              onClick={sendPendingNow}
              className="shrink-0 font-semibold underline"
            >
              Jetzt senden
            </button>
          )}
        </div>
      )}

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
            chooseStreet(null);
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
            onChange={(e) => chooseStreet(e.target.value ? Number(e.target.value) : null)}
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
              {/* Kommt die Strasse aus der Kartenauswahl, fuehrt der Pfeil direkt hin. */}
              {street?.lat != null && street?.lng != null && (
                <a
                  href={routeUrl(street.lat, street.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="muted ml-2 inline-block align-middle text-base leading-none hover:text-brand-600"
                  title={`Route zur ${street.name}`}
                  aria-label={`Route zur ${street.name}`}
                >
                  ➤
                </a>
              )}
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

      {/* Letzte Einträge – wartende zuerst */}
      {(pending.length > 0 || recent.length > 0) && (
        <div className="card mt-4 p-4">
          <p className="mb-2 text-sm font-semibold">Zuletzt erfasst</p>
          <ul className="space-y-1.5">
            {pending.map((item) => (
              <li key={item.localId} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">⏳</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <button
                  onClick={() => removeQueued(item.localId)}
                  className="muted shrink-0 px-1 text-xs underline"
                >
                  verwerfen
                </button>
              </li>
            ))}
            {recent.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">
                  {outcomeEmoji(v.outcome, v.reason_emoji)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {v.street_name ?? "–"} {v.house_number}
                  {v.reason_label && <span className="muted"> · {v.reason_label}</span>}
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
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
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
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[92vw] rounded-full bg-brand-900 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg md:bottom-8">
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
