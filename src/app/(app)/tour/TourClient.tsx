"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PendingSales } from "@/components/PendingSales";
import { useToast } from "@/components/Toast";
import { EmptyState, OutcomeGlyph } from "@/components/ui";
import { IconBan, IconCalendar, IconCheck, IconMap, IconPhone, IconSparkles } from "@/components/icons";
import { beginSaleDraft } from "@/lib/sale-drafts-client";
import type {
  AppointmentRow,
  DoorbellWithStats,
  HouseNumberWithStats,
  StreetWithStats,
  Totals,
  VisitRow,
} from "@/lib/queries";
import type { RejectionReason, TeamFace, VisitOutcome } from "@/lib/types";
import { BUILDING_TYPE_LABEL, OUTCOME_LABEL } from "@/lib/types";
import { bellKey, hasNamedBells, isNumberedLabel, numberedBells, type DoorbellInput } from "@/lib/doorbells";
import { MAX_NOT_HOME_ATTEMPTS, doorFinished, doorStatus, whenLabel, type DoorFacts } from "@/lib/doors";
import { slotLabel, slotOverdue, slotToday } from "@/lib/appointments";
import {
  createVisitRequestId,
  discard as discardQueued,
  enqueue,
  fetchWithTimeout,
  flush,
  forgetQueuedBell,
} from "@/lib/offline-queue";
import { routeUrl } from "@/lib/map";
import { firstName } from "@/lib/ranking";
import type { LevelProgress } from "@/lib/levels";
import { levelFeedbackText, type LevelFeedback } from "@/lib/level-feedback";
import { BellBoard, type BellRow } from "./BellBoard";
import { DoorHero, type DoorStatusLine } from "./DoorHero";
import { HouseStrip, type ChipState, type HouseChip } from "./HouseStrip";
import { OutcomeTray } from "./OutcomeTray";
import { TourHeader } from "./TourHeader";
import {
  AppointmentSheet,
  BlockSheet,
  DaySheet,
  HouseSheet,
  NumberSheet,
  ReasonSheet,
  SaleSheet,
  StreetSheet,
} from "./sheets";
import {
  bellSlot,
  doneKey,
  numberSuggestions,
  sameNumber,
  type Bell,
  type EnergyType,
  type SavedDoor,
  type SaveResult,
  type SheetName,
  type TerritoryLite,
} from "./model";
import { useDoorBook } from "./useDoorBook";
import { useQueue } from "./useQueue";

interface Props {
  userId: number;
  initialProgress: LevelProgress;
  territories: TerritoryLite[];
  streets: StreetWithStats[];
  /** Gebiete, deren Hausnummern und Klingeln mitgekommen sind - die anderen kommen bei Bedarf. */
  loadedTerritories: number[];
  houseNumbers: HouseNumberWithStats[];
  doorbells: DoorbellWithStats[];
  reasons: RejectionReason[];
  /** Darf Sperren wieder aufheben ("doors.unblock"). */
  canUnblock: boolean;
  /** Name und Profilbild der Kollegen - fuer "zuletzt hier war ...". */
  team: TeamFace[];
  todayTotals: Totals;
  recent: VisitRow[];
  /** Offene eigene Termine - was davon heute ist, entscheidet das Geraet. */
  appointments: AppointmentRow[];
  tarifrechnerUrl: string;
}

/** Merker im Geraet lesen - im privaten Modus oder bei gesperrtem Speicher eben keiner. */
function recall(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Merker im Geraet setzen (null entfernt ihn). Nur ein Komfort: ist der
 * Speicher voll oder gesperrt, darf das weder Abschluss noch Strassenwahl aufhalten.
 */
function remember(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Dann startet die Tuer beim naechsten Mal eben ohne Merker.
  }
}

/**
 * Wann ein Eintrag gemerkt statt verworfen wird: Serverproblem (5xx) oder
 * abgelaufene Anmeldung (401). Die Warteschlange sendet ihn nach - nach der
 * neuen Anmeldung unter demselben Konto.
 */
function mustQueue(status: number): boolean {
  return status === 401 || status >= 500;
}

const LOGGED_OUT = "Abgemeldet – gemerkt. Bitte neu anmelden, dann wird nachgesendet";

/**
 * Klinken - die Tuer. Ein Bildschirm fuer eine Hand: oben, wo man ist;
 * in der Mitte die Hausnummer; unten im Daumenbereich die vier Ergebnisse.
 * Nach dem Speichern springt die App zur naechsten offenen Tuer, ein
 * Fehltipp laesst sich im Toast zuruecknehmen.
 */
export function TourClient({
  userId,
  initialProgress,
  territories,
  streets,
  loadedTerritories,
  houseNumbers,
  doorbells,
  reasons,
  canUnblock,
  team,
  todayTotals,
  recent,
  appointments,
  tarifrechnerUrl,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  /* ------------------------------ Level --------------------------------- */

  const [level, setLevel] = useState(initialProgress);
  useEffect(() => setLevel(initialProgress), [initialProgress]);
  const receiveProgress = useCallback(
    (feedback?: LevelFeedback, quiet = false) => {
      if (!feedback) return;
      setLevel(feedback.progress);
      // Nach dem Speichern meldet der Ergebnis-Toast den Aufstieg mit.
      if (feedback.levelUp && !quiet) {
        toast(`Level ${feedback.progress.level} · ${feedback.progress.title}`, {
          icon: <IconSparkles className="h-5 w-5 text-accent-ink" />,
          duration: 4000,
        });
      }
    },
    [toast],
  );

  /* ------------------------------ Auswahl -------------------------------- */

  const [territoryId, setTerritoryId] = useState<number | null>(territories[0]?.id ?? null);
  const [streetId, setStreetId] = useState<number | null>(null);
  const [houseNumber, setHouseNumber] = useState("");
  const [bellLabel, setBellLabel] = useState("");
  const [product, setProduct] = useState<EnergyType>("BEIDES");
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    id: number;
    door: SavedDoor;
    text: string;
  } | null>(null);
  /** Was gesperrt werden soll - eine Klingel oder das ganze Haus. */
  const [blockTarget, setBlockTarget] = useState<Bell | "house" | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastTyped, setLastTyped] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  /* Die Uhr des Geraets - erst nach dem Einblenden; "heute" entscheidet die Tuer. */
  const [now, setNow] = useState<Date | null>(null);

  // Der Toast "nachgesendet" nennt den Aufstieg schon - kein zweiter.
  const receiveQuietly = useCallback((feedback?: LevelFeedback) => receiveProgress(feedback, true), [receiveProgress]);
  const { pending, online, sendNow } = useQueue(userId, receiveQuietly, toast);
  const book = useDoorBook(houseNumbers, doorbells, pending);

  /* --------------------------- Geraet & Umgebung ------------------------- */

  useEffect(() => {
    const storedProduct = recall("d2d_product");
    if (storedProduct === "STROM" || storedProduct === "GAS" || storedProduct === "BEIDES") setProduct(storedProduct);
  }, []);

  /*
   * Welche Strasse offen ist. Nach jedem Speichern kommen frische Serverdaten
   * - dann bleibt die gewaehlte Strasse, solange es sie gibt. Neu gewaehlt
   * wird nur beim ersten Oeffnen oder wenn sie weggefallen ist (Gebiet
   * uebergeben); sonst stuende die Hausnummer ploetzlich in einer anderen Strasse.
   */
  const streetRef = useRef<number | null>(null);
  streetRef.current = streetId;
  const streetPicked = useRef(false);
  useEffect(() => {
    // "Hier klingeln" von der Karte: /tour?street=12&house=7a oeffnet genau dieses Haus.
    const params = new URLSearchParams(window.location.search);
    const linked = streets.find((s) => s.id === Number(params.get("street")));
    if (linked) {
      streetPicked.current = true;
      setTerritoryId(linked.territory_id);
      setStreetId(linked.id);
      remember("d2d_street", String(linked.id));
      setHouseNumber(params.get("house") ?? "");
      setBellLabel("");
      // Das Gebiet der verlinkten Strasse bleibt beim Nachladen nach dem Speichern dabei.
      window.history.replaceState(null, "", `${window.location.pathname}?gebiet=${linked.territory_id}`);
      return;
    }
    if (params.get("street")) {
      // Nicht still in eine andere Strasse springen - dort landete sonst die naechste Tuer.
      toast("Diese Straße ist nicht in deiner Tour – das Gebiet ist fertig oder übergeben.");
      window.history.replaceState(null, "", window.location.pathname);
    }
    const current = streetRef.current;
    if (current !== null ? streets.some((s) => s.id === current) : streetPicked.current) return;
    streetPicked.current = true;
    const storedStreet = Number(recall("d2d_street"));
    const next =
      streets.find((s) => s.id === storedStreet) ??
      streets.find((s) => s.territory_id === (territories[0]?.id ?? null)) ??
      streets[0];
    if (current !== null) {
      setHouseNumber("");
      setBellLabel("");
    }
    setStreetId(next?.id ?? null);
    if (next) setTerritoryId(next.territory_id);
  }, [streets, territories]);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    // Mitlaufen statt einmal beim Oeffnen: sonst traegt jeder Eintrag der Tour
    // die Stelle, an der die App aufging - und die Route zum Termin fuehrt dorthin.
    const watch = navigator.geolocation.watchPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setPosition(null),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  // Der Toast steht ueber der Ergebnisleiste, solange diese Seite offen ist.
  useEffect(() => {
    document.documentElement.dataset.tray = "on";
    return () => {
      delete document.documentElement.dataset.tray;
    };
  }, []);

  /* ---------------------------- Abgeleitetes ----------------------------- */

  const faces = useMemo(() => new Map(team.map((person) => [person.id, person])), [team]);
  const faceOf = useCallback((id: number | null | undefined) => (id ? (faces.get(id) ?? null) : null), [faces]);

  const territory = territories.find((t) => t.id === territoryId) ?? null;
  const street = useMemo(() => streets.find((s) => s.id === streetId) ?? null, [streets, streetId]);

  /*
   * Liegt die gewaehlte Strasse in einem Gebiet, dessen Haeuser noch nicht
   * geladen sind (Teamleitung in einem fremden Gebiet), holt die Seite es
   * nach - ohne die Tuer-Ansicht zu verlassen.
   */
  const loaded = useMemo(() => new Set(loadedTerritories), [loadedTerritories]);
  /*
   * Bis dahin ist ueber die Tueren dieser Strasse nichts bekannt - eine
   * besuchte, gesperrte oder als Mehrfamilienhaus angelegte Tuer saehe aus
   * wie eine neue. Darum ruht in der Zeit alles, was an der Tuer etwas
   * festlegt (Haustyp, Klingeln, Sperre, Ergebnis).
   */
  const housesPending = street !== null && !loaded.has(street.territory_id);
  // Ohne Netz wartet das Nachladen auf Empfang (experimental.useOffline).
  const pendingText = online ? "Hausnummern werden geladen …" : "Kein Netz – Hausnummern kommen bei Empfang";
  useEffect(() => {
    if (!housesPending || !street) return;
    router.replace(`/tour?gebiet=${street.territory_id}`, { scroll: false });
  }, [housesPending, street, router]);
  const streetsOfTerritory = useMemo(
    () => streets.filter((s) => s.territory_id === territoryId),
    [streets, territoryId],
  );
  const houses = useMemo(
    () => (streetId ? houseNumbers.filter((h) => h.street_id === streetId) : []),
    [houseNumbers, streetId],
  );

  /** Offen/gesamt je Strasse - fuer die Strassenwahl. */
  const progress = useMemo(() => {
    const map = new Map<number, { open: number; total: number }>();
    for (const house of houseNumbers) {
      const entry = map.get(house.street_id) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (!book.isDone(house)) entry.open += 1;
      map.set(house.street_id, entry);
    }
    return map;
  }, [houseNumbers, book]);

  const openHouses = houses.filter((h) => !book.isDone(h));

  // Keine Nummer gewaehlt: die erste offene Tuer der Strasse steht bereit.
  useEffect(() => {
    if (houseNumber || houses.length === 0) return;
    const first = houses.find((h) => !book.isDone(h));
    if (first) setHouseNumber(first.number);
    // Nur beim Wechsel der Strasse oder wenn die Auswahl leer wurde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseNumber, houses]);

  const currentHouse = useMemo(
    () => houses.find((h) => sameNumber(h.number, houseNumber)) ?? null,
    [houses, houseNumber],
  );
  /** Schreibweise aus der Liste gewinnt, damit "12 A" und "12a" eins bleiben. */
  const currentNumber = currentHouse?.number ?? houseNumber.trim();
  const currentKey = streetId && currentNumber ? doneKey(streetId, currentNumber) : "";
  const currentType = currentKey ? (book.localTypes.get(currentKey) ?? currentHouse?.building_type ?? "") : "";
  const currentBells = useMemo(
    () => (currentKey ? book.bellsOf(currentKey, currentHouse?.id ?? null) : []),
    [currentKey, currentHouse, book],
  );
  const activeBell = currentBells.find((bell) => bellKey(bell.label) === bellKey(bellLabel)) ?? null;
  const suggestMfh = (currentHouse?.units ?? 0) > 1;
  const namedBells = hasNamedBells(currentBells.map((bell) => bell.label));
  const nextOpenBell = namedBells ? null : (currentBells.find((bell) => !book.isBellDone(currentKey, bell)) ?? null);

  const houseFacts: DoorFacts = currentKey
    ? book.factsOf(currentKey, currentHouse ?? { blocked_at: null, not_home_count: 0, met_count: 0 })
    : { blocked_at: null, not_home_count: 0, met_count: 0 };
  const doorFacts: DoorFacts = activeBell && currentKey ? book.bellFacts(currentKey, activeBell) : houseFacts;
  const doorLocked = doorStatus(doorFacts) === "BLOCKED" || Boolean(houseFacts.blocked_at);

  const dueAppointments = useMemo(
    () =>
      now
        ? appointments.filter((item) => slotToday(item.follow_up_at, now) || slotOverdue(item.follow_up_at, now))
        : [],
    [appointments, now],
  );

  /* ------------------------------ Auswahl -------------------------------- */

  const chooseStreet = useCallback((id: number | null) => {
    setStreetId(id);
    setHouseNumber("");
    setBellLabel("");
    remember("d2d_street", id ? String(id) : null);
  }, []);

  function pickHouse(number: string) {
    setHouseNumber(number);
    setBellLabel("");
  }

  const currentIndex = houses.findIndex((h) => sameNumber(h.number, currentNumber));
  function step(delta: 1 | -1) {
    if (houses.length === 0) return;
    const index = currentIndex < 0 ? (delta > 0 ? -1 : houses.length) : currentIndex;
    const target = houses[index + delta];
    if (target) pickHouse(target.number);
  }

  /** Naechste offene Tuer nach der aktuellen - der Weg die Strasse hinauf. */
  function nextOpenAfter(number: string): string | null {
    const index = houses.findIndex((h) => sameNumber(h.number, number));
    const after = houses.slice(index + 1).find((h) => !book.isDone(h));
    const before = houses.slice(0, Math.max(0, index)).find((h) => !book.isDone(h));
    return (after ?? before)?.number ?? null;
  }

  function goToAppointment(item: AppointmentRow) {
    const target = item.street_id ? streets.find((s) => s.id === item.street_id) : null;
    if (!target) {
      // Die Strasse liegt nicht in den offenen Gebieten (fertig oder uebergeben):
      // nicht die Hausnummer in die aktuelle Strasse setzen, sondern den Termin zeigen.
      router.push(`/termine?termin=${item.id}`);
      return;
    }
    setTerritoryId(target.territory_id);
    setStreetId(target.id);
    remember("d2d_street", String(target.id));
    setHouseNumber(item.house_number);
    setBellLabel(item.doorbell_label ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------------------------- Haus beschreiben --------------------------- */

  /**
   * Haustyp, Schilder, Sperre. Der Aufruf kennt nur Strasse, Hausnummer und
   * Namen - deshalb darf er gefahrlos in die Warteschlange.
   */
  async function describeHouse(
    patch: {
      buildingType?: "EFH" | "MFH";
      doorbells?: DoorbellInput[];
      blocked?: boolean;
      blockedNote?: string;
      /** Sperre nur fuer diese Klingel - auch eine, die noch keine ID vom Server hat. */
      bellLabel?: string;
      bellFloor?: string;
    },
    label: string,
    rollback?: () => void,
  ): Promise<"ok" | "queued" | "error"> {
    if (!streetId || !currentNumber) return "error";
    const payload = { streetId, houseNumber: currentNumber, ...patch };
    let loggedOut = false;
    try {
      const response = await fetchWithTimeout("/api/houses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      loggedOut = response.status === 401;
      if (mustQueue(response.status)) throw new Error("merken");
      const data = await response.json();
      if (!response.ok) {
        rollback?.();
        toast(data.error ?? "Speichern fehlgeschlagen");
        return "error";
      }
      router.refresh();
      return "ok";
    } catch {
      try {
        enqueue(label, payload, { url: "/api/houses", kind: "house", ownerUserId: userId });
        toast(loggedOut ? LOGGED_OUT : "Offline gemerkt – wird nachgesendet");
        return "queued";
      } catch (error) {
        rollback?.();
        toast(error instanceof Error ? error.message : "Nicht gespeichert");
        return "error";
      }
    }
  }

  async function chooseType(type: "EFH" | "MFH") {
    if (!currentKey || housesPending) return;
    const rollback = book.setType(currentKey, type);
    setBellLabel("");
    if (type === "MFH" && currentBells.length === 0) setSheet("house");
    await describeHouse(
      { buildingType: type },
      `${street?.name ?? ""} ${currentNumber} · ${BUILDING_TYPE_LABEL[type]}`,
      rollback,
    );
  }

  async function addBells(entries: DoorbellInput[]) {
    if (!currentKey || entries.length === 0 || housesPending) return;
    const known = new Set(currentBells.map((bell) => bellKey(bell.label)));
    const fresh = entries.filter((entry) => {
      const key = bellKey(entry.label);
      if (known.has(key)) return false;
      known.add(key);
      return true;
    });
    if (fresh.length === 0) {
      toast("Diese Namen stehen schon am Brett");
      return;
    }
    const rollback = book.addBells(currentKey, fresh);
    // Der Haustyp faehrt mit - falls der Aufruf von vorhin das Netz verpasst hat.
    await describeHouse(
      { buildingType: "MFH", doorbells: fresh },
      `${street?.name ?? ""} ${currentNumber} · ${fresh.length} Klingelschilder`,
      rollback,
    );
  }

  /** Haengen an der Klingel schon Eintraege - beim Server oder gerade erst hier erfasst? */
  function bellUsed(bell: Bell): boolean {
    const facts = book.bellFacts(currentKey, bell);
    return bell.visit_count > 0 || facts.not_home_count + facts.met_count > 0;
  }

  async function removeBell(bell: Bell) {
    if (bellUsed(bell)) {
      toast("An dieser Klingel hängen schon Einträge");
      return;
    }
    book.dropBell(currentKey, bell.label);
    if (bellKey(bell.label) === bellKey(bellLabel)) setBellLabel("");
    if (bell.id === null) {
      // Nur auf dem Geraet: auch aus der Warteschlange nehmen, sonst kaeme es beim Nachsenden zurueck.
      if (streetId && currentNumber) forgetQueuedBell(userId, streetId, currentNumber, bell.label);
      return;
    }
    try {
      const response = await fetch(`/api/doorbells/${bell.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) toast(data.error ?? "Nicht möglich");
      else router.refresh();
    } catch {
      toast("Ohne Verbindung nicht möglich");
    }
  }

  async function renameBell(bell: Bell, label: string, floor: string) {
    if (bell.id === null || !label.trim()) return;
    try {
      const response = await fetch(`/api/doorbells/${bell.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), floor: floor.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Nicht möglich");
        return;
      }
      if (bellKey(bellLabel) === bellKey(bell.label)) setBellLabel(label.trim());
      router.refresh();
    } catch {
      toast("Ohne Verbindung nicht möglich");
    }
  }

  /**
   * Tuer sperren oder freigeben - die Klingel oder das ganze Haus. Lokal
   * gilt die Sperre sofort, damit auch ohne Netz niemand weiterklingelt.
   */
  async function setBlocked(target: Bell | "house", blocked: boolean, note = "") {
    if (!streetId || !currentNumber || housesPending) return;
    const bell = target === "house" ? null : target;
    const key = bell ? bellSlot(currentKey, bell.label) : currentKey;
    book.setBlocked(key, blocked);
    setSheet(null);
    setBlockTarget(null);
    const undo = () => book.setBlocked(key, !blocked);

    // Klingeln werden ueber ihren Namen gesperrt - auch eine, die gerade erst
    // (womoeglich ohne Netz) angelegt wurde. So geht die Sperre auch im
    // Funkloch in die Warteschlange, und nie wird versehentlich das ganze Haus gesperrt.
    const outcome = await describeHouse(
      bell ? { blocked, blockedNote: note, bellLabel: bell.label, bellFloor: bell.floor } : { blocked, blockedNote: note },
      `${street?.name ?? ""} ${currentNumber}${bell ? ` · ${bell.label}` : ""} · ${blocked ? "gesperrt" : "Sperre aufgehoben"}`,
      undo,
    );
    // Offline und Fehler melden sich schon selbst.
    if (outcome === "ok") toast(blocked ? (bell ? "Klingel gesperrt" : "Adresse gesperrt") : "Sperre aufgehoben");
  }

  /* ------------------------------ Speichern ------------------------------ */

  async function save(
    outcome: VisitOutcome,
    extra: { reasonId?: number | null; reasonNote?: string; followUpAt?: string; contactName?: string; contactPhone?: string } = {},
  ): Promise<SaveResult> {
    const bell = activeBell;
    const named = hasNamedBells(currentBells.map((item) => item.label));
    const number = currentNumber;
    const payload = {
      clientRequestId: createVisitRequestId(),
      ownerUserId: userId,
      territoryId,
      streetId,
      houseNumber: number,
      doorbellLabel: bell?.label ?? "",
      doorbellFloor: bell?.floor ?? "",
      outcome,
      reasonId: extra.reasonId ?? null,
      reasonNote: extra.reasonNote ?? "",
      energyType: outcome === "SALE" ? product : "",
      followUpAt: extra.followUpAt ?? "",
      followUpTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      contactName: extra.contactName ?? "",
      contactPhone: extra.contactPhone ?? "",
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
    };

    // Zaehlt sofort - bis der Server den Eintrag selbst kennt, auch ohne Netz.
    const markDone = () => {
      if (!currentKey) return;
      const base = bell ?? currentHouse ?? { blocked_at: null, not_home_count: 0, met_count: 0 };
      book.countVisit(bell ? bellSlot(currentKey, bell.label) : currentKey, base, outcome === "NOT_HOME");
    };

    /*
     * Weiter geht es so: im Mehrfamilienhaus zur naechsten offenen Klingel
     * (bei Namen am Brett waehlt man selbst), sonst zur naechsten offenen
     * Hausnummer der Strasse.
     */
    const advance = (): { nextBell: string | null; pickBell: boolean } => {
      if (bell) {
        const open = currentBells.filter(
          (other) => bellKey(other.label) !== bellKey(bell.label) && !book.isBellDone(currentKey, other),
        );
        if (open.length > 0) {
          if (named) {
            setBellLabel("");
            return { nextBell: null, pickBell: true };
          }
          setBellLabel(open[0].label);
          return { nextBell: open[0].label, pickBell: false };
        }
      }
      setBellLabel("");
      if (houses.length === 0) {
        setLastTyped(number);
        setHouseNumber("");
      } else {
        setHouseNumber(nextOpenAfter(number) ?? "");
      }
      return { nextBell: null, pickBell: false };
    };

    setBusy(true);
    let loggedOut = false;
    try {
      const response = await fetchWithTimeout("/api/visits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      loggedOut = response.status === 401;
      if (mustQueue(response.status)) throw new Error("merken");
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Speichern fehlgeschlagen");
        // Meist hat sich an der Tuer etwas geaendert (inzwischen gesperrt,
        // Gebiet uebergeben) - den aktuellen Stand zeigen statt des alten.
        router.refresh();
        return { status: "error" };
      }
      receiveProgress(data.progression, true);
      if (data.deleted || data.id === null) {
        toast("Dieser Eintrag wurde bereits zurückgenommen");
        router.refresh();
        return { status: "error" };
      }
      markDone();
      const { nextBell, pickBell } = advance();
      router.refresh();
      return {
        status: "saved",
        id: data.id as number,
        door: { streetId: streetId!, number, label: bell?.label ?? "", notHome: outcome === "NOT_HOME" },
        nextBell,
        pickBell,
        progression: data.progression,
      };
    } catch {
      // Kein Netz: lokal puffern, damit nichts verloren geht.
      const label = [street?.name ?? "", number, bell ? `· ${bell.label}` : "", "·", OUTCOME_LABEL[outcome]]
        .filter(Boolean)
        .join(" ");
      try {
        enqueue(label, payload, { ownerUserId: userId });
      } catch (error) {
        toast(error instanceof Error ? error.message : "Nicht gespeichert");
        return { status: "error" };
      }
      markDone();
      const { nextBell, pickBell } = advance();
      return { status: "queued", nextBell, pickBell, loggedOut };
    } finally {
      setBusy(false);
    }
  }

  /** Rueckmeldung nach dem Speichern - mit "Rückgängig", wenn der Server bestaetigt hat. */
  function report(result: SaveResult, text: string) {
    if (result.status === "error") return;
    const base =
      result.status === "saved"
        ? [
            text,
            levelFeedbackText(result.progression),
            result.progression?.levelUp ? result.progression.progress.title : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : result.loggedOut
          ? `${text} · ${LOGGED_OUT}`
          : `${text} · offline gemerkt`;
    // Rueckgaengig bleibt auch nach dem Toast erreichbar (Tagesblatt).
    setLastSaved(result.status === "saved" ? { id: result.id, door: result.door, text } : null);
    const line = result.nextBell ? `${base} · weiter: ${result.nextBell}` : result.pickBell ? `${base} · Klingel wählen` : base;
    toast(
      line,
      result.status === "saved"
        ? { action: { label: "Rückgängig", onClick: () => void undo(result.id, result.door) } }
        : {},
    );
  }

  async function undo(id: number, door: SavedDoor) {
    try {
      const response = await fetch(`/api/visits/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        toast(data.error ?? "Nicht möglich");
        return;
      }
      setLastSaved(null);
      receiveProgress(data.progression, true);
      const xp = Number(data.progression?.awardedXp ?? 0);
      toast(xp < 0 ? `Zurückgenommen · ${xp.toLocaleString("de-DE").replace("-", "−")} XP` : "Zurückgenommen");
      // Der Eintrag ist weg - die sofortige Zaehlung an der Tuer auch.
      const house = doneKey(door.streetId, door.number);
      book.uncountVisit(door.label ? bellSlot(house, door.label) : house, door.notHome);
      // Zurueck an die Tuer, an der der Fehltipp passiert ist - auch aus einer anderen Strasse.
      if (door.streetId !== streetId && streets.some((s) => s.id === door.streetId)) {
        setStreetId(door.streetId);
        remember("d2d_street", String(door.streetId));
      }
      setHouseNumber(door.number);
      setBellLabel(door.label);
      router.refresh();
    } catch {
      toast("Ohne Verbindung nicht möglich");
    }
  }

  /** Was die Ergebnisknoepfe gerade blockiert - in einem Wort. */
  const trayHint: string | null = !street
    ? "Straße wählen"
    : housesPending
    ? "Hausnummern werden geladen"
    : !currentNumber
    ? "Hausnummer wählen"
    : doorLocked
      ? "Gesperrt – hier nicht klingeln"
      : currentType === ""
        ? "Erst Haustyp wählen"
        : currentType === "MFH" && currentBells.length === 0
          ? "Erst Klingelschilder anlegen"
          : currentType === "MFH" && !activeBell
            ? "Klingel wählen"
            : null;

  const place = `${street?.name ?? ""} ${currentNumber}${activeBell ? ` · ${activeBell.label}` : ""}`.trim();

  async function notHome() {
    const result = await save("NOT_HOME");
    report(result, `Nr. ${currentNumber} nicht da`);
  }

  async function chooseReason(reason: RejectionReason, note: string) {
    const result = await save("MET_NO_SALE", { reasonId: reason.id, reasonNote: note });
    if (result.status === "error") return;
    setSheet(null);
    report(result, reason.label);
  }

  async function submitAppointment(values: { slot: string; name: string; phone: string; note: string }) {
    const result = await save("APPOINTMENT", {
      followUpAt: values.slot,
      contactName: values.name,
      contactPhone: values.phone,
      reasonNote: values.note,
    });
    if (result.status === "error") return;
    setSheet(null);
    report(result, `Termin ${slotLabel(values.slot)}`);
  }

  /**
   * Abschluss: den Vorgang dauerhaft vormerken, dann den Tarifrechner im
   * selben Tipp oeffnen. Erst die Bestaetigung erzeugt den Verkauf.
   */
  function startSale(choice: EnergyType) {
    setProduct(choice);
    remember("d2d_product", choice);
    try {
      beginSaleDraft(
        userId,
        {
          territoryId,
          streetId,
          houseNumber: currentNumber,
          doorbellLabel: activeBell?.label ?? "",
          doorbellFloor: activeBell?.floor ?? "",
          energyType: choice,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        },
        place,
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Auftrag konnte nicht vorgemerkt werden");
      return;
    }
    // Ohne "noopener", damit window.open das Fenster liefert - die Verbindung
    // wird gleich danach gekappt.
    const win = window.open(tarifrechnerUrl, "_blank");
    if (win) win.opener = null;
    setSheet(null);
    toast("Auftrag vorgemerkt – danach bestätigen");
    void flush(userId).then((result) => {
      receiveProgress(result.progression);
      if (result.sent > 0 && navigator.onLine) router.refresh();
    });
    if (!win) window.location.href = tarifrechnerUrl;
  }

  /* ------------------------------- Ansicht ------------------------------- */

  if (territories.length === 0) {
    return (
      <div className="page-narrow pt-12">
        <PendingSales userId={userId} onProgress={receiveProgress} />
        <EmptyState
          boxed
          icon={<IconMap className="h-6 w-6" />}
          title="Noch kein Gebiet"
          text="Sobald dir ein Gebiet zugeteilt ist, geht es hier los."
        />
      </div>
    );
  }

  const status = statusLine();
  function statusLine(): DoorStatusLine | null {
    if (!currentNumber) return null;
    if (housesPending) return { text: pendingText };
    const facts = doorFacts;
    if (doorStatus(facts) === "BLOCKED" || houseFacts.blocked_at) {
      const by = activeBell?.blocked_by_name ?? currentHouse?.blocked_by_name ?? null;
      return {
        glyph: <IconBan className="h-4 w-4 text-danger" />,
        text: by ? `Gesperrt von ${by}` : "Gesperrt",
      };
    }
    const lastAt = activeBell ? activeBell.last_visit_at : (currentHouse?.last_visit_at ?? null);
    const lastBy = activeBell ? activeBell.last_visit_user : (currentHouse?.last_visit_user ?? null);
    const lastWhat = activeBell ? activeBell.last_outcome : (currentHouse?.last_outcome ?? null);
    const last = lastAt ? `${lastBy ? firstName(lastBy) : "Jemand"}, ${whenLabel(lastAt)}` : null;
    if (currentType === "MFH" && !activeBell) return null;
    if (doorStatus(facts) === "RETRY") {
      return { text: [`${facts.not_home_count}. Versuch von ${MAX_NOT_HOME_ATTEMPTS}`, last].filter(Boolean).join(" · ") };
    }
    if (doorFinished(facts) && lastWhat) {
      return {
        glyph: <OutcomeGlyph outcome={lastWhat} size="sm" />,
        text: [OUTCOME_LABEL[lastWhat], last].filter(Boolean).join(" · "),
      };
    }
    if (doorFinished(facts)) return { glyph: <IconCheck className="h-4 w-4" />, text: "Erledigt" };
    return { text: last ? `Zuletzt ${last}` : "Noch niemand hier" };
  }

  const doneBells = currentBells.filter((bell) => book.isBellDone(currentKey, bell)).length;
  const detail = housesPending
    ? null
    : currentType === "MFH"
      ? currentBells.length > 0
        ? `Mehrfamilienhaus · ${doneBells} von ${currentBells.length} Klingeln`
        : "Mehrfamilienhaus · noch keine Schilder"
      : suggestMfh
        ? `${currentHouse?.units} Wohneinheiten`
        : null;

  const chips: HouseChip[] = houses
    .filter((house) => !onlyOpen || !book.isDone(house) || sameNumber(house.number, currentNumber))
    .map((house) => {
      const key = doneKey(house.street_id, house.number);
      const mfh = book.typeOf(house) === "MFH";
      const bells = mfh ? book.bellsOf(key, house.id) : [];
      const facts = book.factsOf(key, house);
      const blocked = Boolean(facts.blocked_at);
      const done = book.isDone(house);
      const retry = !mfh && doorStatus(facts) === "RETRY";
      const state: ChipState = blocked
        ? "blocked"
        : house.sale_count > 0
          ? "sale"
          : house.last_outcome === "APPOINTMENT"
            ? "appointment"
            : done
              ? "done"
              : retry
                ? "retry"
                : "open";
      const suffix = mfh
        ? bells.length > 0
          ? `${bells.filter((bell) => book.isBellDone(key, bell)).length}/${bells.length}`
          : undefined
        : retry
          ? `${facts.not_home_count}/${MAX_NOT_HOME_ATTEMPTS}`
          : undefined;
      return {
        id: house.id,
        number: house.number,
        state,
        suffix,
        needsBells: mfh && bells.length === 0,
        label: `Hausnummer ${house.number}${blocked ? ", gesperrt" : ""}${done && !blocked ? ", erledigt" : ""}${
          suffix ? `, ${suffix}` : ""
        }`,
      };
    });

  const bellRows: BellRow[] = currentBells.map((bell) => ({
    bell,
    facts: book.bellFacts(currentKey, bell),
    done: book.isBellDone(currentKey, bell),
  }));

  const streetDone = houses.length > 0 && openHouses.length === 0 && !currentNumber;
  // Offline gemerkte Tueren von heute zaehlen schon mit - der Server kennt sie erst nach dem Senden.
  const today = new Date().toDateString();
  const queuedToday = pending.filter(
    (entry) => (entry.url ?? "/api/visits") === "/api/visits" && new Date(entry.createdAt).toDateString() === today,
  ).length;
  const nextStreet = streetsOfTerritory.find((s) => s.id !== streetId && (progress.get(s.id)?.open ?? 0) > 0) ?? null;

  const lastLine = (() => {
    const at = currentHouse?.last_visit_at;
    if (!at) return null;
    return `${currentHouse?.last_visit_user ?? "Jemand"}, ${whenLabel(at)}`;
  })();

  return (
    <div className="mx-auto max-w-xl lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
      <div className="lg:col-span-2">
        <TourHeader
          street={street}
          territory={territory}
          todayDoors={(todayTotals.doors ?? 0) + queuedToday}
          dueCount={dueAppointments.length}
          pendingCount={pending.length}
          online={online}
          onStreet={() => setSheet("street")}
          onDay={() => setSheet("day")}
        />
      </div>

      {/* Rechts auf dem Rechner, oben auf dem Handy: die Tuer selbst. */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-2">
        {dueAppointments.length > 0 && (
          <ul className="list list-icons" aria-label="Termine heute">
            {dueAppointments.slice(0, 3).map((item) => {
              const late = slotOverdue(item.follow_up_at, now ?? undefined);
              const phone = item.contact_phone.replace(/[^+\d]/g, "");
              return (
                <li key={item.id} className="cell pr-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => goToAppointment(item)}
                  >
                    <span className="glyph glyph-round">
                      <IconCalendar className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{item.contact_name || "Termin"}</span>
                      <span className="block truncate text-footnote text-muted">
                        {late && <span className="font-semibold text-danger">Überfällig · </span>}
                        {slotLabel(item.follow_up_at, now ?? undefined)} · {item.street_name ?? ""} {item.house_number}
                        {item.doorbell_label && ` · ${item.doorbell_label}`}
                      </span>
                    </span>
                  </button>
                  {phone && (
                    <a href={`tel:${phone}`} className="icon-btn icon-btn-fill" aria-label={`${item.contact_name || "Kunde"} anrufen`}>
                      <IconPhone className="h-5 w-5" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <PendingSales userId={userId} onProgress={receiveProgress} />

        <DoorHero
          number={currentNumber || null}
          bell={activeBell ? { label: activeBell.label, floor: activeBell.floor } : null}
          status={status}
          detail={detail}
          canPrev={houses.length > 0 && currentIndex !== 0}
          canNext={houses.length > 0 && currentIndex < houses.length - 1}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onOpen={() => {
            if (!housesPending) setSheet("house");
          }}
          onType={() => setSheet("number")}
          empty={
            streetDone ? (
              <div className="flex flex-col items-center gap-2">
                <span className="glyph glyph-lg glyph-round glyph-result check-pop">
                  <IconCheck className="h-6 w-6" />
                </span>
                <p className="text-title-3">Straße erledigt</p>
                {nextStreet && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => chooseStreet(nextStreet.id)}>
                    Weiter: {nextStreet.name}
                  </button>
                )}
              </div>
            ) : !street ? (
              <button type="button" className="btn btn-primary" onClick={() => setSheet("street")}>
                Straße wählen
              </button>
            ) : housesPending ? (
              <p className="text-subhead text-muted" role="status">
                {pendingText}
              </p>
            ) : (
              <button type="button" className="kpi text-title-1 text-muted" onClick={() => setSheet("number")}>
                Nr. eingeben
              </button>
            )
          }
        />

        {/* Haustyp einmal festlegen - gilt danach fuers ganze Team. Ohne ihn
            waere ein Mehrfamilienhaus nach dem ersten Eintrag "erledigt". */}
        {currentNumber && currentType === "" && !doorLocked && !housesPending && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Haustyp">
            <button
              type="button"
              className={`btn ${suggestMfh ? "btn-secondary" : "btn-primary"}`}
              onClick={() => void chooseType("EFH")}
            >
              Einzeltür
            </button>
            <button
              type="button"
              className={`btn ${suggestMfh ? "btn-primary" : "btn-secondary"}`}
              onClick={() => void chooseType("MFH")}
            >
              Mehrfamilienhaus
            </button>
          </div>
        )}
        {currentNumber && currentType === "MFH" && currentBells.length === 0 && !doorLocked && !housesPending && (
          <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet("house")}>
            Klingelschilder anlegen
          </button>
        )}

        <OutcomeTray
          disabled={busy || trayHint !== null}
          hint={trayHint}
          onNotHome={() => void notHome()}
          onMet={() => setSheet("reason")}
          onAppointment={() => setSheet("appointment")}
          onSale={() => setSheet("sale")}
        />
      </div>

      <div className="mt-6 space-y-6 lg:col-start-1 lg:row-start-2 lg:mt-0">
        {currentType === "MFH" && currentBells.length > 0 && !housesPending && (
          <BellBoard
            rows={bellRows}
            selected={bellLabel}
            next={nextOpenBell?.label ?? null}
            faceOf={faceOf}
            onPick={setBellLabel}
            onEdit={() => setSheet("house")}
          />
        )}
        {houses.length > 0 && (
          <HouseStrip
            chips={chips}
            current={currentNumber || null}
            openCount={openHouses.length}
            onlyOpen={onlyOpen}
            onToggleOpen={() => setOnlyOpen((value) => !value)}
            onPick={pickHouse}
          />
        )}
        <div className="tray-space" aria-hidden="true" />
      </div>

      {sheet === "street" && (
        <StreetSheet
          territories={territories}
          territoryId={territoryId}
          streets={streetsOfTerritory}
          streetId={streetId}
          progress={progress}
          onTerritory={(id) => {
            setTerritoryId(id);
            // Sonst stuende die Strasse eines anderen Gebiets unter dem neuen Namen.
            chooseStreet(streets.find((s) => s.territory_id === id)?.id ?? null);
          }}
          onPick={(id) => {
            chooseStreet(id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "reason" && (
        <ReasonSheet
          place={place}
          reasons={reasons}
          busy={busy}
          onPick={(reason, note) => void chooseReason(reason, note)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "appointment" && (
        <AppointmentSheet
          place={place}
          contact={activeBell && !isNumberedLabel(activeBell.label) ? activeBell.label : ""}
          now={now}
          busy={busy}
          onSubmit={(values) => void submitAppointment(values)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "sale" && (
        <SaleSheet place={place} product={product} busy={busy} onPick={startSale} onClose={() => setSheet(null)} />
      )}
      {sheet === "house" && currentNumber && !housesPending && (
        <HouseSheet
          title={`${street?.name ?? ""} ${currentNumber}`}
          type={currentType}
          units={currentHouse?.units ?? 0}
          bells={currentBells.map((bell) => ({
            bell,
            used: bellUsed(bell),
            blocked: Boolean(book.bellFacts(currentKey, bell).blocked_at),
          }))}
          lastLine={lastLine}
          attempts={houseFacts.not_home_count}
          blocked={Boolean(houseFacts.blocked_at)}
          blockedBy={currentHouse?.blocked_by_name ?? null}
          canUnblock={canUnblock}
          route={currentHouse?.lat != null && currentHouse?.lng != null ? routeUrl(currentHouse.lat, currentHouse.lng, "walk") : null}
          busy={busy}
          onType={(type) => void chooseType(type)}
          onAddBells={(entries) => void addBells(entries)}
          onAddCount={(count) => void addBells(numberedBells(count, currentBells.map((bell) => bell.label)))}
          onRename={(bell, label, floor) => void renameBell(bell, label, floor)}
          onRemoveBell={(bell) => void removeBell(bell)}
          onBlockBell={(bell) => {
            setBlockTarget(bell);
            setSheet("block");
          }}
          onUnblockBell={(bell) => void setBlocked(bell, false)}
          onBlock={() => {
            setBlockTarget("house");
            setSheet("block");
          }}
          onUnblock={() => void setBlocked("house", false)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "block" && blockTarget && (
        <BlockSheet
          target={blockTarget === "house" ? `${street?.name ?? ""} ${currentNumber}` : `„${blockTarget.label}“`}
          busy={busy}
          onConfirm={(note) => void setBlocked(blockTarget, true, note)}
          onClose={() => {
            setSheet(null);
            setBlockTarget(null);
          }}
        />
      )}
      {sheet === "day" && (
        <DaySheet
          totals={todayTotals}
          level={level}
          pending={pending}
          online={online}
          recent={recent}
          last={
            lastSaved
              ? {
                  text: lastSaved.text,
                  onUndo: () => {
                    setSheet(null);
                    void undo(lastSaved.id, lastSaved.door);
                  },
                }
              : null
          }
          onSend={() => void sendNow()}
          onDiscard={(localId) => {
            if (!discardQueued(localId)) toast("Eintrag konnte nicht entfernt werden");
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "number" && (
        <NumberSheet
          suggestions={numberSuggestions(lastTyped || currentNumber)}
          onOpen={(number) => {
            pickHouse(number);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
