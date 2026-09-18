"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { routeUrl } from "@/lib/map";
import type {
  DoorbellWithStats,
  HouseNumberWithStats,
  StreetWithStats,
  Totals,
  VisitRow,
} from "@/lib/queries";
import type { BuildingType, RejectionReason, VisitOutcome } from "@/lib/types";
import { BUILDING_TYPE_LABEL, OUTCOME_LABEL } from "@/lib/types";
import {
  bellKey,
  numberedBells,
  parseDoorbellLines,
  type DoorbellInput,
} from "@/lib/doorbells";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { StatTile } from "@/components/ui";
import {
  enqueue,
  flush,
  getQueue,
  remove as removeQueued,
  startAutoFlush,
  subscribe,
  type QueuedWrite,
} from "@/lib/offline-queue";

type TerritoryLite = {
  id: number;
  name: string;
  city: string;
  postal_code: string;
};

type EnergyType = "STROM" | "GAS" | "BEIDES";

/**
 * Eine Klingel, so wie die Oberflaeche sie braucht. Ein Schild, das gerade
 * erst - womoeglich ohne Netz - angelegt wurde, hat noch keine ID vom Server.
 */
interface Bell {
  id: number | null;
  label: string;
  floor: string;
  visit_count: number;
  last_outcome: VisitOutcome | null;
  last_reason_emoji: string | null;
}

type SaveResult =
  | { status: "saved"; id: number; nextBell: string | null }
  | { status: "queued"; nextBell: string | null }
  | { status: "error" };

interface Props {
  territories: TerritoryLite[];
  streets: StreetWithStats[];
  houseNumbers: HouseNumberWithStats[];
  doorbells: DoorbellWithStats[];
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
  houseNumbers,
  doorbells,
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
  const [sheet, setSheet] = useState<null | "reason" | "building" | "bells">(null);
  const [note, setNote] = useState("");
  /** Name der gerade gewaehlten Klingel - leer im Einfamilienhaus. */
  const [bellLabel, setBellLabel] = useState("");
  const [bellDraft, setBellDraft] = useState("");
  const [bellCount, setBellCount] = useState("");
  const [editing, setEditing] = useState<
    { id: number; original: string; label: string; floor: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastVisitId, setLastVisitId] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState<QueuedWrite[]>([]);
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

  /** Die Hausnummern der gewaehlten Strasse, in Reihenfolge. */
  const houses = useMemo(
    () => (streetId ? houseNumbers.filter((h) => h.street_id === streetId) : []),
    [houseNumbers, streetId],
  );

  /**
   * In dieser Sitzung erfasste Nummern und Klingeln. Der Server weiss es erst
   * nach dem Neuladen, und ohne Netz gar nicht - deshalb wird es hier
   * mitgezaehlt, damit die Plakette sofort umspringt.
   */
  const [justDone, setJustDone] = useState<Set<string>>(new Set());
  const [justDoneBells, setJustDoneBells] = useState<Set<string>>(new Set());
  const [lastDone, setLastDone] = useState<{ key: string; bell: boolean } | null>(null);

  /**
   * Haustyp und Klingelschilder, die gerade erst entstanden sind. Steckt der
   * Eintrag noch in der Warteschlange, kennt der Server sie nicht - angezeigt
   * werden muessen sie trotzdem sofort.
   */
  const [localTypes, setLocalTypes] = useState<Map<string, BuildingType>>(new Map());
  const [localBells, setLocalBells] = useState<Map<string, DoorbellInput[]>>(new Map());

  /** Klingeln je Hausnummer, einmal vorsortiert statt je Plakette gesucht. */
  const serverBells = useMemo(() => {
    const map = new Map<number, Bell[]>();
    for (const bell of doorbells) {
      const list = map.get(bell.house_number_id) ?? [];
      list.push({
        id: bell.id,
        label: bell.label,
        floor: bell.floor,
        visit_count: bell.visit_count,
        last_outcome: bell.last_outcome,
        last_reason_emoji: bell.last_reason_emoji,
      });
      map.set(bell.house_number_id, list);
    }
    return map;
  }, [doorbells]);

  const typeOf = useCallback(
    (house: HouseNumberWithStats): BuildingType =>
      localTypes.get(doneKey(house.street_id, house.number)) ?? house.building_type,
    [localTypes],
  );

  /** Alle Klingeln eines Hauses: was der Server kennt und was lokal dazukam. */
  const bellsOf = useCallback(
    (key: string, houseNumberId: number | null): Bell[] => {
      const out: Bell[] = [];
      const seen = new Set<string>();
      for (const bell of (houseNumberId === null ? [] : serverBells.get(houseNumberId)) ?? []) {
        seen.add(bellKey(bell.label));
        out.push(bell);
      }
      for (const entry of localBells.get(key) ?? []) {
        if (seen.has(bellKey(entry.label))) continue;
        seen.add(bellKey(entry.label));
        out.push({
          id: null,
          label: entry.label,
          floor: entry.floor,
          visit_count: 0,
          last_outcome: null,
          last_reason_emoji: null,
        });
      }
      return out;
    },
    [serverBells, localBells],
  );

  const isBellDone = useCallback(
    (key: string, bell: Bell) =>
      bell.visit_count > 0 || justDoneBells.has(`${key}:${bellKey(bell.label)}`),
    [justDoneBells],
  );

  /**
   * Ein Mehrfamilienhaus ist erst fertig, wenn jede Klingel dran war - und
   * solange noch gar kein Schild angelegt ist, erst recht nicht.
   */
  const isDone = useCallback(
    (house: HouseNumberWithStats) => {
      const key = doneKey(house.street_id, house.number);
      if (typeOf(house) === "MFH") {
        const bells = bellsOf(key, house.id);
        return bells.length > 0 && bells.every((bell) => isBellDone(key, bell));
      }
      return house.visit_count > 0 || justDone.has(key);
    },
    [justDone, typeOf, bellsOf, isBellDone],
  );

  /* ------------------------- das gerade offene Haus ----------------------- */

  const currentHouse = useMemo(
    () => houses.find((h) => sameNumber(h.number, houseNumber)) ?? null,
    [houses, houseNumber],
  );
  /** Schreibweise aus der Liste gewinnt, damit "12 A" und "12a" eins bleiben. */
  const currentNumber = currentHouse?.number ?? houseNumber.trim();
  const currentKey = streetId && currentNumber ? doneKey(streetId, currentNumber) : "";
  const currentType: BuildingType = currentKey
    ? (localTypes.get(currentKey) ?? currentHouse?.building_type ?? "")
    : "";
  const currentBells = useMemo(
    () => (currentKey ? bellsOf(currentKey, currentHouse?.id ?? null) : []),
    [currentKey, currentHouse, bellsOf],
  );
  const doneBellCount = currentBells.filter((bell) => isBellDone(currentKey, bell)).length;
  const activeBell =
    currentBells.find((bell) => bellKey(bell.label) === bellKey(bellLabel)) ?? null;
  /** Kennt die Karte mehrere Wohneinheiten, ist Mehrfamilienhaus das Naheliegende. */
  const suggestMfh = (currentHouse?.units ?? 0) > 1;

  /** Naechste noch offene Hausnummer - der Weg die Strasse hinauf. */
  function nextHouse(): string | null {
    if (houses.length === 0) return null;
    const current = houses.findIndex((h) => sameNumber(h.number, houseNumber));
    const rest = current >= 0 ? houses.slice(current + 1) : houses;
    return (rest.find((h) => !isDone(h)) ?? rest[0] ?? null)?.number ?? null;
  }
  const territory = territories.find((t) => t.id === territoryId) ?? null;

  const chooseStreet = useCallback((value: number | null) => {
    setStreetId(value);
    if (value) window.localStorage.setItem("d2d_street", String(value));
    else window.localStorage.removeItem("d2d_street");
  }, []);

  /* ------------------------ Haustyp und Klingeln -------------------------- */

  /**
   * Haus beschreiben - Haustyp, neue Klingelschilder oder beides.
   *
   * Der Aufruf kennt keine IDs, sondern nur Strasse, Hausnummer und Namen.
   * Deshalb darf er gefahrlos in der Warteschlange landen und spaeter
   * nachgesendet werden, ohne dass etwas doppelt entsteht.
   */
  async function describeHouse(
    patch: { buildingType?: BuildingType; doorbells?: DoorbellInput[] },
    label: string,
  ): Promise<void> {
    if (!streetId || !currentNumber) return;
    const payload = { streetId, houseNumber: currentNumber, ...patch };
    try {
      const response = await fetch("/api/houses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      router.refresh();
    } catch {
      enqueue(label, payload, { url: "/api/houses", kind: "house" });
      setToast("Kein Netz – gemerkt, wird automatisch nachgesendet");
    }
  }

  /** Beim ersten Antippen: Ein- oder Mehrfamilienhaus. */
  async function chooseBuildingType(type: "EFH" | "MFH") {
    if (!currentKey) return;
    setLocalTypes((prev) => new Map(prev).set(currentKey, type));
    setBellLabel("");
    setSheet(type === "MFH" ? "bells" : null);
    await describeHouse(
      { buildingType: type },
      `${street?.name ?? ""} ${currentNumber} · ${BUILDING_TYPE_LABEL[type]}`,
    );
  }

  /** Neue Schilder ans Klingelbrett - lokal sofort, auf dem Server sobald es geht. */
  async function addBells(entries: DoorbellInput[]) {
    if (!currentKey || entries.length === 0) return;
    const known = new Set(currentBells.map((bell) => bellKey(bell.label)));
    const fresh = entries.filter((entry) => {
      const key = bellKey(entry.label);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if (fresh.length === 0) {
      setToast("Diese Namen stehen schon am Brett");
      return;
    }

    setLocalBells((prev) => {
      const next = new Map(prev);
      next.set(currentKey, [...(next.get(currentKey) ?? []), ...fresh]);
      return next;
    });
    // Der Haustyp faehrt mit: dann steht er auch dann richtig, wenn der
    // Aufruf von vorhin die Verbindung nicht mehr erwischt hat.
    await describeHouse(
      { buildingType: "MFH", doorbells: fresh },
      `${street?.name ?? ""} ${currentNumber} · ${fresh.length} Klingelschilder`,
    );
  }

  function submitBellDraft() {
    const entries = parseDoorbellLines(bellDraft);
    if (entries.length === 0) {
      setToast("Bitte mindestens einen Namen eintragen");
      return;
    }
    setBellDraft("");
    void addBells(entries);
  }

  function submitBellCount() {
    const wanted = Number(bellCount);
    if (!Number.isFinite(wanted) || wanted < 1) {
      setToast("Bitte eine Anzahl eintragen");
      return;
    }
    const entries = numberedBells(
      wanted,
      currentBells.map((bell) => bell.label),
    );
    setBellCount("");
    void addBells(entries);
  }

  /** Klingel waehlen und zurueck zu den Ergebnis-Kacheln. */
  function chooseBell(bell: Bell) {
    setBellLabel(bell.label);
    setEditing(null);
    setSheet(null);
  }

  async function removeBell(bell: Bell) {
    if (isBellDone(currentKey, bell)) {
      setToast("An dieser Klingel hängen schon Einträge");
      return;
    }
    setLocalBells((prev) => {
      const next = new Map(prev);
      next.set(
        currentKey,
        (next.get(currentKey) ?? []).filter(
          (entry) => bellKey(entry.label) !== bellKey(bell.label),
        ),
      );
      return next;
    });
    if (bellKey(bell.label) === bellKey(bellLabel)) setBellLabel("");
    if (bell.id === null) return;

    try {
      const response = await fetch(`/api/doorbells/${bell.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? "Nicht möglich");
        return;
      }
      router.refresh();
    } catch {
      setToast("Ohne Verbindung nicht möglich");
    }
  }

  async function saveRename() {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) {
      setToast("Der Name darf nicht leer sein");
      return;
    }
    try {
      const response = await fetch(`/api/doorbells/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, floor: editing.floor.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setToast(data.error ?? "Nicht möglich");
        return;
      }
      if (bellKey(bellLabel) === bellKey(editing.original)) setBellLabel(label);
      setEditing(null);
      router.refresh();
    } catch {
      setToast("Ohne Verbindung nicht möglich");
    }
  }

  /** Tipp auf eine Plakette: beim ersten Mal wird zuerst der Haustyp gewaehlt. */
  function openHouse(house: HouseNumberWithStats) {
    setHouseNumber(house.number);
    setBellLabel("");
    setEditing(null);
    const type = typeOf(house);
    if (!type) setSheet("building");
    else if (type === "MFH") setSheet("bells");
    else setSheet(null);
  }

  /* ------------------------------- Speichern ------------------------------ */

  async function save(
    outcome: VisitOutcome,
    extra: { reasonId?: number | null; reasonNote?: string } = {},
  ): Promise<SaveResult> {
    const bell = activeBell;
    const payload = {
      territoryId,
      streetId,
      houseNumber: currentNumber,
      doorbellLabel: bell?.label ?? "",
      doorbellFloor: bell?.floor ?? "",
      outcome,
      reasonId: extra.reasonId ?? null,
      reasonNote: extra.reasonNote ?? "",
      energyType: outcome === "SALE" ? product : "",
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
    };

    // Die gerade erfasste Tuer gilt sofort als erledigt - im Mehrfamilienhaus
    // die einzelne Klingel, sonst die Hausnummer.
    const markDone = () => {
      if (!currentKey) return;
      if (bell) {
        const key = `${currentKey}:${bellKey(bell.label)}`;
        setJustDoneBells((prev) => new Set(prev).add(key));
        setLastDone({ key, bell: true });
      } else {
        setJustDone((prev) => new Set(prev).add(currentKey));
        setLastDone({ key: currentKey, bell: false });
      }
    };

    /*
     * Im Treppenhaus klingelt man sich durch: die naechste offene Klingel wird
     * gleich vorgewaehlt. Erst wenn keine mehr offen ist, ist das Haus durch
     * und das Feld wird wie gewohnt frei.
     */
    const advance = (): string | null => {
      setNote("");
      if (bell) {
        const next =
          currentBells.find(
            (other) =>
              bellKey(other.label) !== bellKey(bell.label) && !isBellDone(currentKey, other),
          ) ?? null;
        if (next) {
          setBellLabel(next.label);
          return next.label;
        }
      }
      setHouseNumber("");
      setBellLabel("");
      return null;
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
      markDone();
      const nextBell = advance();
      router.refresh();
      return { status: "saved", id: data.id as number, nextBell };
    } catch {
      // Kein Netz: Eintrag lokal puffern, damit nichts verloren geht.
      const label = [
        street?.name ?? "",
        currentNumber,
        bell ? `· ${bell.label}` : "",
        "·",
        OUTCOME_LABEL[outcome],
      ]
        .filter(Boolean)
        .join(" ");
      enqueue(label, payload);
      setLastVisitId(null);
      markDone();
      const nextBell = advance();
      return { status: "queued", nextBell };
    } finally {
      setBusy(false);
    }
  }

  function report(result: SaveResult, savedText: string) {
    if (result.status === "error") return;
    const base =
      result.status === "saved"
        ? savedText
        : "Kein Netz – gespeichert, wird automatisch nachgesendet";
    setToast(result.nextBell ? `${base} · weiter mit ${result.nextBell}` : base);
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
        // Den Vermerk aus dieser Sitzung mitnehmen, sonst bliebe die Klingel
        // durchgestrichen, obwohl der Eintrag weg ist.
        if (lastDone) {
          const drop = (prev: Set<string>) => {
            const next = new Set(prev);
            next.delete(lastDone.key);
            return next;
          };
          if (lastDone.bell) setJustDoneBells(drop);
          else setJustDone(drop);
          setLastDone(null);
        }
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

        {/* Welche Tür ist gerade gemeint? Im Mehrfamilienhaus die Klingel. */}
        {currentType === "MFH" && currentNumber && (
          <div
            className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ background: "color-mix(in srgb, var(--brand-500) 12%, transparent)" }}
          >
            <span className="text-base leading-none">🔔</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {activeBell ? (
                <>
                  {activeBell.label}
                  {activeBell.floor && (
                    <span className="muted font-normal"> · {activeBell.floor}</span>
                  )}
                </>
              ) : currentBells.length === 0 ? (
                "Noch keine Klingelschilder"
              ) : (
                "Keine Klingel gewählt"
              )}
            </span>
            {currentBells.length > 0 && (
              <span className="muted shrink-0 text-xs tabular-nums">
                {doneBellCount}/{currentBells.length}
              </span>
            )}
            <button
              type="button"
              onClick={() => setSheet("bells")}
              className="shrink-0 text-xs font-semibold underline"
            >
              {currentBells.length === 0 ? "anlegen" : "wechseln"}
            </button>
          </div>
        )}

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
            aria-label={
              houses.length > 0 ? "Zur nächsten offenen Hausnummer" : "Hausnummer um 1 erhöhen"
            }
            onClick={() => {
              // Kennt die App die Hausnummern der Straße, springt sie zur
              // nächsten offenen - sonst bleibt es beim schlichten Hochzählen.
              const next = nextHouse();
              if (next) {
                setHouseNumber(next);
                return;
              }
              const match = houseNumber.match(/^(\d+)(.*)$/);
              setHouseNumber(match ? `${Number(match[1]) + 1}${match[2]}` : "1");
            }}
          >
            {houses.length > 0 ? "weiter" : "+1"}
          </button>
        </div>

        {/* Haustyp der getippten Nummer - beim Antippen fragt die App von selbst. */}
        {streetId !== null && currentNumber !== "" && currentType !== "MFH" && (
          <div className="muted mb-4 -mt-2 flex items-center gap-2 text-xs">
            {currentType === "EFH" ? (
              <>
                <span>🏠 Einfamilienhaus</span>
                <button
                  type="button"
                  onClick={() => setSheet("building")}
                  className="font-semibold underline"
                >
                  ändern
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSheet("building")}
                className="font-semibold underline"
              >
                Ein- oder Mehrfamilienhaus?
              </button>
            )}
          </div>
        )}

        {houses.length > 0 && (
          <div className="mb-4">
            <p className="muted mb-1.5 text-xs">
              {houses.filter((h) => !isDone(h)).length} von {houses.length} Häusern offen –
              antippen statt tippen
            </p>
            <ul className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {houses.map((house) => {
                const done = isDone(house);
                const active = sameNumber(house.number, houseNumber);
                const key = doneKey(house.street_id, house.number);
                const mfh = typeOf(house) === "MFH";
                const bells = mfh ? bellsOf(key, house.id) : [];
                const bellsDone = bells.filter((bell) => isBellDone(key, bell)).length;
                return (
                  <li key={house.id}>
                    <button
                      type="button"
                      onClick={() => openHouse(house)}
                      className="rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition"
                      style={{
                        borderColor: active ? "var(--brand-600)" : "var(--line)",
                        background: active
                          ? "color-mix(in srgb, var(--brand-500) 16%, transparent)"
                          : done
                            ? "color-mix(in srgb, var(--ink) 7%, transparent)"
                            : "var(--card)",
                        color: done && !active ? "var(--ink-muted)" : "var(--ink)",
                        textDecoration: done ? "line-through" : undefined,
                      }}
                      title={[
                        mfh ? "Mehrfamilienhaus" : null,
                        mfh && bells.length > 0
                          ? `${bellsDone} von ${bells.length} Klingeln`
                          : null,
                        house.units > 1 ? `${house.units} Wohneinheiten` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined}
                      aria-label={`Hausnummer ${house.number}${
                        mfh
                          ? `, Mehrfamilienhaus mit ${bellsDone} von ${bells.length} erfassten Klingeln`
                          : house.units > 1
                            ? `, ${house.units} Wohneinheiten`
                            : ""
                      }${done ? ", schon erfasst" : ""}`}
                    >
                      {house.number}
                      {mfh && (
                        <span className="ml-1 text-[10px] font-medium opacity-70">
                          {bells.length > 0 ? `${bellsDone}/${bells.length}` : "🔔"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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
                <span className="w-6 text-center">{item.kind === "house" ? "🏢" : "⏳"}</span>
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

      {/* Bottom-Sheet: Ein- oder Mehrfamilienhaus */}
      {sheet === "building" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-base font-bold">
                {street?.name} {currentNumber} – was für ein Haus?
              </h2>
              <p className="muted text-xs">
                Einmal festlegen, dann kennt es die App – auch für alle anderen im Team.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void chooseBuildingType("EFH")}
                className="tap-tile"
                style={{
                  minHeight: "6.5rem",
                  borderColor: suggestMfh ? undefined : "var(--brand-400)",
                }}
              >
                <span className="tap-tile-emoji">🏠</span>
                Einfamilienhaus
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void chooseBuildingType("MFH")}
                className="tap-tile"
                style={{
                  minHeight: "6.5rem",
                  borderColor: suggestMfh ? "var(--brand-400)" : undefined,
                }}
              >
                <span className="tap-tile-emoji">🏢</span>
                Mehrfamilienhaus
              </button>
            </div>

            {suggestMfh && (
              <p className="muted mt-3 text-center text-xs">
                Die Karte kennt hier {currentHouse?.units} Wohneinheiten.
              </p>
            )}

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

      {/* Bottom-Sheet: Klingelschilder */}
      {sheet === "bells" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => {
            setSheet(null);
            setEditing(null);
          }}
        >
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold">
                  Klingelschilder · {street?.name} {currentNumber}
                </h2>
                <p className="muted text-xs">
                  {currentBells.length === 0
                    ? "Namen vom Klingelbrett abtippen – oder einfach die Anzahl."
                    : `${doneBellCount} von ${currentBells.length} Klingeln erfasst – antippen und erfassen.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheet("building")}
                className="muted shrink-0 text-xs font-semibold underline"
              >
                Haustyp
              </button>
            </div>

            {currentBells.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {currentBells.map((bell) => {
                  const bellDone = isBellDone(currentKey, bell);
                  const chosen = bellKey(bell.label) === bellKey(bellLabel);

                  if (editing && bell.id !== null && bell.id === editing.id) {
                    return (
                      <li key={`edit-${bell.id}`} className="flex flex-wrap items-center gap-2">
                        <input
                          className="input min-w-0 flex-1"
                          value={editing.label}
                          onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                          placeholder="Name"
                          aria-label="Name auf dem Schild"
                        />
                        <input
                          className="input w-24 shrink-0"
                          value={editing.floor}
                          onChange={(e) => setEditing({ ...editing, floor: e.target.value })}
                          placeholder="Etage"
                          aria-label="Etage"
                        />
                        <button
                          type="button"
                          className="btn btn-success px-3 py-2 text-sm"
                          onClick={() => void saveRename()}
                        >
                          Sichern
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost px-3 py-2 text-sm"
                          onClick={() => setEditing(null)}
                        >
                          Zurück
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={bell.id ?? `neu-${bellKey(bell.label)}`} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => chooseBell(bell)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition"
                        style={{
                          borderColor: chosen ? "var(--brand-600)" : "var(--line)",
                          background: chosen
                            ? "color-mix(in srgb, var(--brand-500) 14%, transparent)"
                            : "var(--card)",
                        }}
                        aria-label={`Klingel ${bell.label}${bellDone ? ", schon erfasst" : ""}`}
                      >
                        <span className="w-6 shrink-0 text-center">
                          {bellDone
                            ? outcomeEmoji(bell.last_outcome ?? "", bell.last_reason_emoji)
                            : "🔔"}
                        </span>
                        <span
                          className="min-w-0 flex-1 truncate font-semibold"
                          style={{
                            textDecoration: bellDone ? "line-through" : undefined,
                            color: bellDone && !chosen ? "var(--ink-muted)" : undefined,
                          }}
                        >
                          {bell.label}
                        </span>
                        {bell.floor && (
                          <span className="muted shrink-0 text-xs">{bell.floor}</span>
                        )}
                      </button>

                      {bell.id !== null && (
                        <button
                          type="button"
                          className="muted shrink-0 px-1.5 py-2 text-sm"
                          aria-label={`${bell.label} umbenennen`}
                          onClick={() =>
                            setEditing({
                              id: bell.id as number,
                              original: bell.label,
                              label: bell.label,
                              floor: bell.floor,
                            })
                          }
                        >
                          ✏️
                        </button>
                      )}
                      {!bellDone && (
                        <button
                          type="button"
                          className="muted shrink-0 px-1.5 py-2 text-sm"
                          aria-label={`${bell.label} entfernen`}
                          onClick={() => void removeBell(bell)}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="hairline border-t pt-4">
              <label className="label" htmlFor="bell-names">
                Namen vom Klingelbrett
              </label>
              <textarea
                id="bell-names"
                className="textarea"
                rows={4}
                placeholder={"Müller, 2. OG\nSchmidt\nKaya, EG"}
                value={bellDraft}
                onChange={(e) => setBellDraft(e.target.value)}
              />
              <p className="muted mt-1 text-[11px]">
                Ein Name pro Zeile. Nach dem Komma darf die Etage stehen.
              </p>
              <button
                type="button"
                disabled={busy}
                className="btn btn-primary mt-2 w-full"
                onClick={submitBellDraft}
              >
                Schilder anlegen
              </button>

              <div className="mt-4 flex items-end gap-2">
                <div className="w-24 shrink-0">
                  <label className="label" htmlFor="bell-count">
                    Anzahl
                  </label>
                  <input
                    id="bell-count"
                    className="input"
                    inputMode="numeric"
                    placeholder={suggestMfh ? String(currentHouse?.units) : "6"}
                    value={bellCount}
                    onChange={(e) => setBellCount(e.target.value.slice(0, 3))}
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  className="btn btn-ghost flex-1"
                  onClick={submitBellCount}
                >
                  Ohne Namen anlegen
                </button>
              </div>
              <p className="muted mt-1 text-[11px]">
                Legt „Klingel 1“, „Klingel 2“ … an – Namen kannst du später nachtragen.
              </p>
            </div>

            <button
              type="button"
              className="btn btn-ghost mt-4 w-full"
              onClick={() => {
                setSheet(null);
                setEditing(null);
              }}
            >
              Fertig
            </button>
          </div>
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

/** Schluessel eines Hauses in den Merklisten dieser Sitzung. */
function doneKey(streetId: number, number: string): string {
  return `${streetId}:${number.trim().replace(/\s+/g, "").toLowerCase()}`;
}

/** Zwei Hausnummern meinen dasselbe Haus - Leerzeichen und Grossschreibung egal. */
function sameNumber(a: string, b: string): boolean {
  return (
    a.trim().replace(/\s+/g, "").toLowerCase() ===
    b.trim().replace(/\s+/g, "").toLowerCase()
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
