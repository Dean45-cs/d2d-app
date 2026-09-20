"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { routeUrl } from "@/lib/map";
import type {
  AppointmentRow,
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
import {
  doorFinished,
  doorStatus,
  MAX_NOT_HOME_ATTEMPTS,
  whenLabel,
  type DoorFacts,
} from "@/lib/doors";
import { IconArrowRight, IconCheck } from "@/components/icons";
import { StatTile } from "@/components/ui";
import { SignaturePad } from "@/components/SignaturePad";
import {
  normalizeSlot,
  quickSlots,
  toSlot,
  slotDate,
  slotLabel,
  slotOverdue,
  slotTime,
  slotToday,
} from "@/lib/appointments";
import { orderProblems } from "@/lib/orders";
import { readDraft, writeDraft, type LocalVisits } from "@/lib/tour-draft";
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
  not_home_count: number;
  met_count: number;
  last_outcome: VisitOutcome | null;
  last_reason_emoji: string | null;
  last_visit_at: string | null;
  last_visit_user: string | null;
  blocked_at: string | null;
  blocked_by_name: string | null;
}

/** Eine frisch angelegte Klingel - noch nichts passiert. */
const NEW_BELL = {
  id: null,
  visit_count: 0,
  not_home_count: 0,
  met_count: 0,
  last_outcome: null,
  last_reason_emoji: null,
  last_visit_at: null,
  last_visit_user: null,
  blocked_at: null,
  blocked_by_name: null,
} as const;

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
  /** Nur die Teamleitung darf eine Sperre wieder aufheben. */
  isLeader: boolean;
  todayTotals: Totals;
  recent: VisitRow[];
  /** Offene Termine von heute und aelter - der Rueckweg des Tages. */
  appointments: AppointmentRow[];
  tarifrechnerUrl: string;
}

/** Die Auftragsdaten, so wie sie im Sheet stehen - alles als Text. */
interface OrderForm {
  /** Vom Geraet vergeben, sobald das Sheet aufgeht. */
  ref: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  tariff: string;
  previousProvider: string;
  meterStrom: string;
  meterGas: string;
  usageStrom: string;
  usageGas: string;
  startDate: string;
  note: string;
  signature: string;
  withdrawalGiven: boolean;
  privacyGiven: boolean;
}

const EMPTY_ORDER: OrderForm = {
  ref: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  tariff: "",
  previousProvider: "",
  meterStrom: "",
  meterGas: "",
  usageStrom: "",
  usageGas: "",
  startDate: "",
  note: "",
  signature: "",
  withdrawalGiven: false,
  privacyGiven: false,
};

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
  isLeader,
  todayTotals,
  recent,
  appointments,
  tarifrechnerUrl,
}: Props) {
  const router = useRouter();

  const [territoryId, setTerritoryId] = useState<number | null>(
    territories[0]?.id ?? null,
  );
  const [streetId, setStreetId] = useState<number | null>(null);
  const [houseNumber, setHouseNumber] = useState("");
  const [product, setProduct] = useState<EnergyType>("BEIDES");
  const [sheet, setSheet] = useState<
    null | "reason" | "building" | "bells" | "block" | "appointment" | "order"
  >(null);
  const [note, setNote] = useState("");
  /** Name der gerade gewaehlten Klingel - leer im Einfamilienhaus. */
  const [bellLabel, setBellLabel] = useState("");
  const [bellDraft, setBellDraft] = useState("");
  const [bellCount, setBellCount] = useState("");
  const [blockNote, setBlockNote] = useState("");
  /** Termin: Ortszeit "2026-09-21 18:00", dazu der Ansprechpartner. */
  const [slot, setSlot] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  /** Auftrag an der Tuer - erst im Sheet, dann in einem Zug gespeichert. */
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [orderMore, setOrderMore] = useState(false);
  const [editing, setEditing] = useState<
    { id: number; original: string; label: string; floor: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToastState] = useState<{ text: string; undo: boolean } | null>(null);
  /** Kurze Rueckmeldung. Die Aufrufe bleiben schlicht: setToast("..."). */
  const setToast = useCallback(
    (text: string) => setToastState({ text, undo: false }),
    [],
  );
  const [lastVisitId, setLastVisitId] = useState<number | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [online, setOnline] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  /*
   * Die Uhr des Geraets - erst nach dem Einblenden gesetzt. Auf dem Server
   * gibt es sie nicht, und "heute" wuerde dort womoeglich anders ausfallen
   * als hier vor der Tuer.
   */
  const [now, setNow] = useState<Date | null>(null);

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
    setNow(new Date());
    // Ueber einen langen Vormittag darf die Liste nicht einfrieren.
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
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
    // Mit Rueckgaengig-Knopf laenger stehen lassen - ein Fehltipp faellt
    // erst auf, wenn man den Namen nochmal liest.
    const timer = setTimeout(() => setToastState(null), toast.undo ? 5200 : 2600);
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
        // Erst wenn nichts mehr wartet, kennt der Server alles - dann darf der
        // lokale Zuschlag weg, sonst wuerde er ein zweites Mal mitgezaehlt.
        if (result.remaining === 0) {
          setLocalVisits(new Map());
          setLocalBlocked(new Set());
        }
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
   * In dieser Sitzung erfasste Versuche und gesetzte Sperren, als Zuschlag auf
   * den Serverstand. Der Server weiss davon erst nach dem Neuladen, ohne Netz
   * gar nicht - deshalb wird hier mitgezaehlt, damit die Plakette sofort
   * umspringt.
   */
  const [localVisits, setLocalVisits] = useState<Map<string, LocalVisits>>(new Map());
  const [localBlocked, setLocalBlocked] = useState<Set<string>>(new Set());

  /**
   * Gerade online gespeicherte Eintraege, bis der Server sie zurueckmeldet.
   *
   * Getrennt von der gepufferten Liste oben: sobald frische Serverdaten da
   * sind, stecken diese Eintraege dort drin. Der Zuschlag muss deshalb in
   * derselben Render-Runde verschwinden, in der die neuen Daten ankommen -
   * sonst zaehlt ein Versuch doppelt und die Tuer waere zu frueh durch.
   */
  const [fresh, setFresh] = useState<{
    from: HouseNumberWithStats[];
    visits: Map<string, LocalVisits>;
  }>(() => ({ from: houseNumbers, visits: EMPTY_VISITS }));
  const freshVisits = fresh.from === houseNumbers ? fresh.visits : EMPTY_VISITS;
  const [lastDone, setLastDone] = useState<
    { key: string; notHome: boolean; houseNumber: string; label: string } | null
  >(null);

  /**
   * Haustyp und Klingelschilder, die gerade erst entstanden sind. Steckt der
   * Eintrag noch in der Warteschlange, kennt der Server sie nicht - angezeigt
   * werden muessen sie trotzdem sofort.
   */
  const [localTypes, setLocalTypes] = useState<Map<string, BuildingType>>(new Map());
  const [localBells, setLocalBells] = useState<Map<string, DoorbellInput[]>>(new Map());

  /*
   * Zwischenstand aus dem Geraet holen und danach bei jeder Aenderung
   * sichern. Erst nach dem Lesen schreiben, sonst wuerde der leere
   * Anfangszustand den gespeicherten Stand ueberbuegeln.
   */
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setLocalTypes(new Map(draft.types));
      setLocalBells(new Map(draft.bells));
      setLocalVisits(new Map(draft.visits));
      setLocalBlocked(new Set(draft.blocked));
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    writeDraft({
      types: [...localTypes],
      bells: [...localBells],
      visits: [...localVisits],
      blocked: [...localBlocked],
    });
  }, [draftLoaded, localTypes, localBells, localVisits, localBlocked]);

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
        not_home_count: bell.not_home_count,
        met_count: bell.met_count,
        last_outcome: bell.last_outcome,
        last_reason_emoji: bell.last_reason_emoji,
        last_visit_at: bell.last_visit_at,
        last_visit_user: bell.last_visit_user,
        blocked_at: bell.blocked_at,
        blocked_by_name: bell.blocked_by_name,
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
        out.push({ ...NEW_BELL, label: entry.label, floor: entry.floor });
      }
      return out;
    },
    [serverBells, localBells],
  );

  /**
   * Serverstand plus das, was in dieser Sitzung dazukam. Daraus ergibt sich
   * der Bearbeitungsstand der Tuer - auch ohne Netz.
   */
  const factsOf = useCallback(
    (key: string, base: DoorFacts): DoorFacts => {
      const queued = localVisits.get(key);
      const online = freshVisits.get(key);
      return {
        blocked_at: localBlocked.has(key) ? (base.blocked_at ?? "lokal") : base.blocked_at,
        not_home_count:
          base.not_home_count + (queued?.notHome ?? 0) + (online?.notHome ?? 0),
        met_count: base.met_count + (queued?.met ?? 0) + (online?.met ?? 0),
      };
    },
    [localVisits, freshVisits, localBlocked],
  );

  const bellFacts = useCallback(
    (key: string, bell: Bell) => factsOf(bellSlot(key, bell.label), bell),
    [factsOf],
  );

  const isBellDone = useCallback(
    (key: string, bell: Bell) => doorFinished(bellFacts(key, bell)),
    [bellFacts],
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
      return doorFinished(factsOf(key, house));
    },
    [typeOf, bellsOf, isBellDone, factsOf],
  );

  /** Termine, die heute anstehen oder schon ueberfaellig sind. */
  const dueAppointments = useMemo(() => {
    if (!now) return [];
    return appointments.filter(
      (item) => slotToday(item.follow_up_at, now) || slotOverdue(item.follow_up_at, now),
    );
  }, [appointments, now]);

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
  /** Die Klingel, bei der es weitergeht - im Sheet hervorgehoben. */
  const nextOpenBell =
    currentBells.find((bell) => !isBellDone(currentKey, bell)) ?? null;

  /** Stand der Tuer, an der man gerade steht - Haus oder gewaehlte Klingel. */
  const currentHouseFacts: DoorFacts = currentKey
    ? factsOf(currentKey, currentHouse ?? { blocked_at: null, not_home_count: 0, met_count: 0 })
    : { blocked_at: null, not_home_count: 0, met_count: 0 };
  const currentDoorFacts: DoorFacts =
    activeBell && currentKey ? bellFacts(currentKey, activeBell) : currentHouseFacts;
  const currentDoorStatus = doorStatus(currentDoorFacts);
  /** Gesperrt ist gesperrt - auch wenn nur das Haus gesperrt wurde. */
  const doorLocked = currentDoorStatus === "BLOCKED" || Boolean(currentHouseFacts.blocked_at);
  const lastAt = activeBell ? activeBell.last_visit_at : (currentHouse?.last_visit_at ?? null);
  const lastBy = activeBell ? activeBell.last_visit_user : (currentHouse?.last_visit_user ?? null);
  const lastWhat = activeBell ? activeBell.last_outcome : (currentHouse?.last_outcome ?? null);
  const blockedBy = activeBell
    ? (activeBell.blocked_by_name ?? currentHouse?.blocked_by_name ?? null)
    : (currentHouse?.blocked_by_name ?? null);

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
    patch: {
      buildingType?: BuildingType;
      doorbells?: DoorbellInput[];
      blocked?: boolean;
      blockedNote?: string;
    },
    label: string,
    rollback?: () => void,
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
        // Der Server hat abgelehnt - dann darf auch lokal nichts stehen
        // bleiben, sonst zeigt die Liste Schilder, die es nirgends gibt.
        rollback?.();
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
    const key = currentKey;
    const before = localTypes.get(key);
    setLocalTypes((prev) => new Map(prev).set(key, type));
    setBellLabel("");
    setSheet(type === "MFH" ? "bells" : null);
    await describeHouse(
      { buildingType: type },
      `${street?.name ?? ""} ${currentNumber} · ${BUILDING_TYPE_LABEL[type]}`,
      () =>
        setLocalTypes((prev) => {
          const next = new Map(prev);
          if (before === undefined) next.delete(key);
          else next.set(key, before);
          return next;
        }),
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
    const key = currentKey;
    await describeHouse(
      { buildingType: "MFH", doorbells: fresh },
      `${street?.name ?? ""} ${currentNumber} · ${fresh.length} Klingelschilder`,
      () => {
        const rejected = new Set(fresh.map((entry) => bellKey(entry.label)));
        setLocalBells((prev) => {
          const next = new Map(prev);
          next.set(
            key,
            (next.get(key) ?? []).filter((entry) => !rejected.has(bellKey(entry.label))),
          );
          return next;
        });
      },
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

  /**
   * Tuer sperren oder freigeben.
   *
   * Gesperrt wird die gewaehlte Klingel, sonst das ganze Haus - man steht ja
   * vor genau dieser Tuer. Lokal gilt die Sperre sofort, damit auch ohne Netz
   * niemand weiterklingelt.
   */
  async function setBlocked(blocked: boolean) {
    if (!streetId || !currentNumber) return;
    const bell = activeBell;
    const key = bell ? bellSlot(currentKey, bell.label) : currentKey;

    setLocalBlocked((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(key);
      else next.delete(key);
      return next;
    });
    setSheet(null);

    const note = blockNote.trim();
    setBlockNote("");

    // Eine Klingel mit ID laeuft ueber ihre eigene Route, alles andere ueber
    // das Haus - dort reichen Strasse und Hausnummer, also auch ohne Netz.
    if (bell && bell.id !== null) {
      try {
        const response = await fetch(`/api/doorbells/${bell.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocked, blockedNote: note }),
        });
        const data = await response.json();
        if (!response.ok) {
          setLocalBlocked((prev) => {
            const next = new Set(prev);
            if (blocked) next.delete(key);
            else next.add(key);
            return next;
          });
          setToast(data.error ?? "Nicht möglich");
          return;
        }
        setToast(blocked ? "Klingel gesperrt" : "Sperre aufgehoben");
        router.refresh();
      } catch {
        setToast("Ohne Verbindung nicht möglich");
      }
      return;
    }

    await describeHouse(
      { blocked, blockedNote: note },
      `${street?.name ?? ""} ${currentNumber} · ${blocked ? "gesperrt" : "Sperre aufgehoben"}`,
      () =>
        setLocalBlocked((prev) => {
          const next = new Set(prev);
          if (blocked) next.delete(key);
          else next.add(key);
          return next;
        }),
    );
    if (blocked) setToast("Adresse gesperrt");
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

  /** Tipp auf einen Termin: Strasse und Hausnummer stehen sofort richtig. */
  function goToAppointment(item: AppointmentRow) {
    const target = item.street_id ? streets.find((s) => s.id === item.street_id) : null;
    if (target) {
      setTerritoryId(target.territory_id);
      chooseStreet(target.id);
    }
    setHouseNumber(item.house_number);
    setBellLabel(item.doorbell_label ?? "");
    setSheet(null);
    setToast(`${item.contact_name || "Termin"} · ${slotLabel(item.follow_up_at, now ?? undefined)}`);
  }

  /* ------------------------------- Speichern ------------------------------ */

  async function save(
    outcome: VisitOutcome,
    extra: {
      reasonId?: number | null;
      reasonNote?: string;
      followUpAt?: string;
      contactName?: string;
      contactPhone?: string;
      /** Auftragsdaten - fahren beim Abschluss im selben Aufruf mit. */
      order?: Record<string, unknown>;
    } = {},
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
      followUpAt: extra.followUpAt ?? "",
      contactName: extra.contactName ?? "",
      contactPhone: extra.contactPhone ?? "",
      ...(extra.order ? { order: extra.order } : {}),
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
    };

    // Die gerade erfasste Tuer gilt sofort als erledigt - im Mehrfamilienhaus
    // die einzelne Klingel, sonst die Hausnummer.
    const markDone = (queued: boolean) => {
      if (!currentKey) return;
      const key = bell ? bellSlot(currentKey, bell.label) : currentKey;
      const notHome = outcome === "NOT_HOME";
      const add = (prev: Map<string, LocalVisits>) => {
        const next = new Map(prev);
        const seen = next.get(key) ?? { notHome: 0, met: 0 };
        next.set(key, {
          notHome: seen.notHome + (notHome ? 1 : 0),
          met: seen.met + (notHome ? 0 : 1),
        });
        return next;
      };
      // Gepuffert: bleibt liegen, bis die Warteschlange durch ist.
      // Online: gilt nur bis zur naechsten Antwort des Servers.
      if (queued) setLocalVisits(add);
      else setFresh((prev) => ({ from: houseNumbers, visits: add(prev.from === houseNumbers ? prev.visits : EMPTY_VISITS) }));
      setLastDone({ key, notHome, houseNumber: currentNumber, label: bell?.label ?? "" });
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
      markDone(false);
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
        extra.order ? `· Auftrag ${String(extra.order.customerName ?? "")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      enqueue(label, payload);
      setLastVisitId(null);
      markDone(true);
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
    const text = result.nextBell ? `${base} · weiter mit ${result.nextBell}` : base;
    // Rueckgaengig nur, wenn der Server den Eintrag bestaetigt hat - ohne ID
    // gibt es nichts zu loeschen.
    setToastState({ text, undo: result.status === "saved" });
  }

  /**
   * Im Mehrfamilienhaus gehoert jeder Eintrag an eine Klingel. Ohne sie waere
   * die Tuer nirgends zugeordnet und das Klingelbrett kaeme nicht voran -
   * deshalb fuehrt der Tipp dann zur Liste statt ins Leere.
   */
  function bellMissing(): boolean {
    if (currentType !== "MFH" || activeBell) return false;
    setSheet("bells");
    setToast(
      currentBells.length === 0
        ? "Erst die Klingelschilder anlegen"
        : "An welcher Klingel warst du?",
    );
    return true;
  }

  async function handleOutcome(outcome: VisitOutcome) {
    if (bellMissing()) return;
    if (outcome === "MET_NO_SALE") {
      setSheet("reason");
      return;
    }
    if (outcome === "APPOINTMENT") {
      openAppointment();
      return;
    }
    const result = await save(outcome);
    report(result, "Nicht angetroffen gespeichert");
  }

  /* -------------------------------- Termin -------------------------------- */

  /**
   * Ein Termin ohne Uhrzeit ist keiner: er taucht nirgends wieder auf und der
   * Weg zurueck faellt aus. Deshalb fragt die App hier kurz nach - mit
   * Vorschlaegen, damit es beim Tippen bleibt.
   */
  function openAppointment() {
    const slots = quickSlots();
    setSlot(slots[0]?.value ?? "");
    // Am Klingelbrett steht der Name schon - den muss niemand abtippen.
    setContactName(activeBell?.label ?? "");
    setContactPhone("");
    setNote("");
    setSheet("appointment");
  }

  async function submitAppointment() {
    if (!slot) {
      setToast("Bitte Tag und Uhrzeit wählen");
      return;
    }
    const result = await save("APPOINTMENT", {
      followUpAt: slot,
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      reasonNote: note.trim(),
    });
    if (result.status === "error") return;
    setSheet(null);
    report(result, `Termin ${slotLabel(slot)} gespeichert`);
    setSlot("");
    setContactName("");
    setContactPhone("");
  }

  /* -------------------------------- Auftrag ------------------------------- */

  /** Abschluss: erst der Auftrag, dann der Eintrag - beides in einem Zug. */
  function openOrder() {
    if (bellMissing()) return;
    setOrder({
      ...EMPTY_ORDER,
      ref: newClientRef(),
      // Der Name vom Klingelschild ist fast immer der des Kunden.
      customerName: activeBell?.label ?? "",
    });
    setOrderMore(false);
    setSheet("order");
  }

  /**
   * Auftrag speichern.
   *
   * Der Tarifrechner des Partners wird - wenn gewuenscht - SOFORT beim Tippen
   * geoeffnet, sonst blockt der Browser das Fenster.
   */
  async function submitOrder(withCalculator: boolean) {
    const problems = orderProblems({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      signature: order.signature,
      withdrawalGiven: order.withdrawalGiven,
      privacyGiven: order.privacyGiven,
    });
    if (problems.length > 0) {
      setToast(problems[0]);
      return;
    }

    const win = withCalculator
      ? window.open(tarifrechnerUrl, "_blank", "noopener,noreferrer")
      : null;

    const result = await save("SALE", {
      order: {
        clientRef: order.ref,
        customerName: order.customerName.trim(),
        customerPhone: order.customerPhone.trim(),
        customerEmail: order.customerEmail.trim(),
        energyType: product,
        tariff: order.tariff.trim(),
        previousProvider: order.previousProvider.trim(),
        meterStrom: order.meterStrom.trim(),
        meterGas: order.meterGas.trim(),
        usageStrom: order.usageStrom,
        usageGas: order.usageGas,
        startDate: order.startDate,
        note: order.note.trim(),
        signature: order.signature,
        withdrawalGiven: order.withdrawalGiven,
        privacyGiven: order.privacyGiven,
      },
    });
    if (result.status === "error") return;

    setSheet(null);
    setOrder(EMPTY_ORDER);
    report(result, `Auftrag für ${order.customerName.trim()} gespeichert`);
    if (withCalculator && !win) window.location.href = tarifrechnerUrl;
  }

  /** Abschluss ohne Auftragsdaten - zaehlt mit, aber ohne Unterlagen. */
  async function saleWithoutOrder() {
    if (bellMissing()) return;
    const result = await save("SALE");
    if (result.status === "error") return;
    setSheet(null);
    setOrder(EMPTY_ORDER);
    report(result, "Abschluss gezählt – Auftragsdaten fehlen noch");
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
          // Den Zuschlag muss hier niemand zuruecknehmen: rueckgaengig gibt es
          // nur fuer online gespeicherte Eintraege, und der Refresh gleich
          // darunter bringt den Serverstand ohne diesen Eintrag zurueck.
          // Zurueck an die Tuer, an der der Fehltipp passiert ist - sonst
          // muesste man sie sich nach dem Auto-Weiter wieder heraussuchen.
          setHouseNumber(lastDone.houseNumber);
          setBellLabel(lastDone.label);
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

      {/* Termine, die heute anstehen - der Rueckweg gehoert an den Anfang. */}
      {dueAppointments.length > 0 && (
        <div className="card mb-3 p-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              📅 {dueAppointments.length === 1 ? "1 Termin" : `${dueAppointments.length} Termine`}{" "}
              heute
            </p>
            <Link href="/auftraege" className="shrink-0 text-xs font-semibold text-brand-600">
              alle →
            </Link>
          </div>
          <ul className="space-y-1">
            {dueAppointments.slice(0, 3).map((item) => {
              const late = slotOverdue(item.follow_up_at, now ?? undefined);
              return (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToAppointment(item)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-brand-500/8"
                  >
                    <span
                      className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-bold tabular-nums"
                      style={{
                        background: late
                          ? "color-mix(in srgb, var(--signal-500) 15%, transparent)"
                          : "color-mix(in srgb, var(--brand-500) 14%, transparent)",
                        color: late ? "var(--signal-600)" : "var(--brand-600)",
                      }}
                    >
                      {slotLabel(item.follow_up_at, now ?? undefined)}
                    </span>
                    {/* Der Name steht vorn: die Strasse kennt man, den Kunden
                        muss man wiedererkennen. */}
                    <span className="min-w-0 flex-1 truncate">
                      {item.contact_name || "Termin"}
                      <span className="muted">
                        {" · "}
                        {item.street_name ?? ""} {item.house_number}
                      </span>
                    </span>
                  </button>
                  {item.contact_phone && (
                    <a
                      href={`tel:${item.contact_phone.replace(/[^+\d]/g, "")}`}
                      className="shrink-0 rounded-lg px-2 py-1.5 text-base leading-none"
                      aria-label={`${item.contact_name || "Kunde"} anrufen`}
                    >
                      📞
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
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
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--brand-400)" }}
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

        {/* Haustyp und Sperre der gewaehlten Nummer. */}
        {streetId !== null && currentNumber !== "" && (
          <div className="muted mb-2 -mt-2 flex items-center gap-2 text-xs">
            {currentType === "" ? (
              <button
                type="button"
                onClick={() => setSheet("building")}
                className="font-semibold underline"
              >
                Ein- oder Mehrfamilienhaus?
              </button>
            ) : (
              <>
                <span>
                  {currentType === "EFH" ? "🏠 Einfamilienhaus" : "🏢 Mehrfamilienhaus"}
                </span>
                <button
                  type="button"
                  onClick={() => setSheet("building")}
                  className="font-semibold underline"
                >
                  ändern
                </button>
              </>
            )}
            <span className="flex-1" />
            {doorLocked ? (
              isLeader ? (
                <button
                  type="button"
                  onClick={() => void setBlocked(false)}
                  className="font-semibold underline"
                >
                  Sperre aufheben
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => setSheet("block")}
                className="font-semibold underline"
              >
                🚫 Sperren
              </button>
            )}
          </div>
        )}

        {/* Wer war zuletzt hier? Verhindert, dass zwei Leute dieselbe Tür laufen. */}
        {currentNumber !== "" && !doorLocked && lastAt && (
          <div
            className="mb-4 flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
            style={{
              background:
                currentDoorStatus === "RETRY"
                  ? "color-mix(in srgb, var(--gas-500) 14%, transparent)"
                  : "color-mix(in srgb, var(--ink) 6%, transparent)",
            }}
          >
            <span className="shrink-0 text-base leading-none">
              {outcomeEmoji(lastWhat ?? "", null)}
            </span>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate">
                Zuletzt {lastBy ? <strong>{lastBy}</strong> : "jemand"}, {whenLabel(lastAt)}
              </span>
              <span className="muted block truncate">
                {lastWhat ? OUTCOME_LABEL[lastWhat] : ""}
                {currentDoorStatus === "RETRY"
                  ? `${lastWhat ? " · " : ""}${currentDoorFacts.not_home_count}. von ${MAX_NOT_HOME_ATTEMPTS} Versuchen`
                  : ""}
              </span>
            </span>
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
                const facts = factsOf(key, house);
                const blocked = Boolean(facts.blocked_at);
                // Gelb heisst: hier war schon jemand, aber es ist noch offen.
                const retry = !blocked && !mfh && doorStatus(facts) === "RETRY";
                const badge = blocked
                  ? "🚫"
                  : mfh
                    ? bells.length > 0
                      ? `${bellsDone}/${bells.length}`
                      : "🔔"
                    : retry
                      ? `${facts.not_home_count}/${MAX_NOT_HOME_ATTEMPTS}`
                      : "";
                const wasHere = house.last_visit_user
                  ? `${house.last_visit_user}, ${whenLabel(house.last_visit_at)}`
                  : "";
                return (
                  <li key={house.id}>
                    <button
                      type="button"
                      onClick={() => openHouse(house)}
                      className="rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums transition"
                      style={{
                        borderColor: active
                          ? "var(--brand-600)"
                          : blocked
                            ? "var(--signal-500)"
                            : retry
                              ? "var(--gas-500)"
                              : "var(--line)",
                        background: active
                          ? "color-mix(in srgb, var(--brand-500) 16%, transparent)"
                          : blocked
                            ? "color-mix(in srgb, var(--signal-500) 14%, transparent)"
                            : retry
                              ? "color-mix(in srgb, var(--gas-500) 14%, transparent)"
                              : done
                                ? "color-mix(in srgb, var(--ink) 7%, transparent)"
                                : "var(--card)",
                        color: blocked
                          ? "var(--signal-600)"
                          : done && !active
                            ? "var(--ink-muted)"
                            : "var(--ink)",
                        textDecoration: done && !blocked ? "line-through" : undefined,
                      }}
                      title={[
                        blocked ? "Gesperrt – nicht mehr anlaufen" : null,
                        mfh ? "Mehrfamilienhaus" : null,
                        mfh && bells.length > 0
                          ? `${bellsDone} von ${bells.length} Klingeln`
                          : null,
                        retry
                          ? `${facts.not_home_count}. Versuch von ${MAX_NOT_HOME_ATTEMPTS}`
                          : null,
                        wasHere ? `zuletzt: ${wasHere}` : null,
                        house.units > 1 ? `${house.units} Wohneinheiten` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined}
                      aria-label={`Hausnummer ${house.number}${
                        blocked ? ", gesperrt" : ""
                      }${
                        mfh
                          ? `, Mehrfamilienhaus mit ${bellsDone} von ${bells.length} erfassten Klingeln`
                          : retry
                            ? `, ${facts.not_home_count} von ${MAX_NOT_HOME_ATTEMPTS} Versuchen`
                            : ""
                      }${wasHere ? `, zuletzt ${wasHere}` : ""}${
                        done && !blocked ? ", abgearbeitet" : ""
                      }`}
                    >
                      {house.number}
                      {badge && (
                        <span className="ml-1 text-[10px] font-medium opacity-70">{badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {doorLocked ? (
          <div
            className="rounded-xl border p-4 text-center"
            style={{
              borderColor: "var(--signal-500)",
              background: "color-mix(in srgb, var(--signal-500) 10%, transparent)",
            }}
          >
            <p className="text-base font-bold" style={{ color: "var(--signal-600)" }}>
              🚫 Hier nicht mehr klingeln
            </p>
            <p className="muted mt-1 text-xs">
              {blockedBy ? `${blockedBy} hat diese Tür gesperrt.` : "Diese Tür ist gesperrt."}{" "}
              Hier wurde ausdrücklich widersprochen – weiteres Anlaufen wäre rechtlich
              angreifbar.
            </p>
            {isLeader && (
              <button
                type="button"
                className="btn btn-ghost mt-3 w-full"
                onClick={() => void setBlocked(false)}
              >
                Sperre aufheben
              </button>
            )}
          </div>
        ) : (
          <>
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
          onClick={openOrder}
          className="btn btn-success mt-2 w-full py-5 text-lg"
        >
          <IconCheck />
          Abschluss – Auftrag aufnehmen
          <IconArrowRight />
        </button>
        <p className="muted mt-2 text-center text-[11px]">
          Kundendaten, Unterschrift und Widerrufsbelehrung – danach öffnet der
          Tarifrechner des Partners.
        </p>
          </>
        )}

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
                    : "Klingel antippen, dann unten das Ergebnis."}
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
              <div className="mb-3">
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="muted">
                    {doneBellCount} von {currentBells.length} erledigt
                  </span>
                  <span className="font-semibold">
                    {currentBells.length - doneBellCount === 0
                      ? "Haus fertig"
                      : `noch ${currentBells.length - doneBellCount}`}
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "color-mix(in srgb, var(--ink) 12%, transparent)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(doneBellCount / currentBells.length) * 100}%`,
                      background: "var(--brand-600)",
                    }}
                  />
                </div>
              </div>
            )}

            {currentBells.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {currentBells.map((bell, index) => {
                  const bellDone = isBellDone(currentKey, bell);
                  const chosen = bellKey(bell.label) === bellKey(bellLabel);
                  const isNext =
                    !bellDone && nextOpenBell !== null && bell === nextOpenBell && !chosen;
                  const facts = bellFacts(currentKey, bell);
                  const bellBlocked = Boolean(facts.blocked_at);
                  const retry = doorStatus(facts) === "RETRY";
                  const sub = bellBlocked
                    ? `gesperrt${bell.blocked_by_name ? ` von ${bell.blocked_by_name}` : ""}`
                    : bell.last_visit_at
                      ? [
                          bell.last_visit_user ?? "",
                          whenLabel(bell.last_visit_at),
                          retry
                            ? `${facts.not_home_count}/${MAX_NOT_HOME_ATTEMPTS} Versuche`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "";

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
                        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-sm transition"
                        style={{
                          borderColor: chosen
                            ? "var(--brand-600)"
                            : bellBlocked
                              ? "var(--signal-500)"
                              : retry
                                ? "var(--gas-500)"
                                : isNext
                                  ? "var(--brand-400)"
                                  : "var(--line)",
                          background: chosen
                            ? "color-mix(in srgb, var(--brand-500) 14%, transparent)"
                            : bellBlocked
                              ? "color-mix(in srgb, var(--signal-500) 10%, transparent)"
                              : "var(--card)",
                          opacity: bellDone && !chosen && !bellBlocked ? 0.65 : 1,
                        }}
                        aria-label={`Klingel ${index + 1}, ${bell.label}${
                          bell.floor ? `, ${bell.floor}` : ""
                        }${bellDone ? ", schon erfasst" : isNext ? ", hier geht es weiter" : ""}`}
                      >
                        {/* Die Nummer vom Klingelbrett - so findet der Daumen
                            die Zeile wieder, ohne den Namen zu lesen. */}
                        <span className="muted w-4 shrink-0 text-right text-xs tabular-nums">
                          {index + 1}
                        </span>
                        <span className="w-6 shrink-0 text-center text-base leading-none">
                          {bellBlocked
                            ? "🚫"
                            : bellDone
                              ? outcomeEmoji(bell.last_outcome ?? "", bell.last_reason_emoji)
                              : "🔔"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block truncate font-semibold"
                            style={{
                              textDecoration: bellDone && !bellBlocked ? "line-through" : undefined,
                              color: bellBlocked
                                ? "var(--signal-600)"
                                : bellDone && !chosen
                                  ? "var(--ink-muted)"
                                  : undefined,
                            }}
                          >
                            {bell.label}
                          </span>
                          {sub && (
                            <span className="muted block truncate text-[11px]">{sub}</span>
                          )}
                        </span>
                        {isNext && (
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              background: "color-mix(in srgb, var(--brand-500) 18%, transparent)",
                              color: "var(--brand-600)",
                            }}
                          >
                            weiter
                          </span>
                        )}
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
                        <>
                          <button
                            type="button"
                            className="muted shrink-0 px-1.5 py-2 text-sm"
                            aria-label={`${bell.label} sperren`}
                            onClick={() => {
                              setBellLabel(bell.label);
                              setSheet("block");
                            }}
                          >
                            🚫
                          </button>
                          <button
                            type="button"
                            className="muted shrink-0 px-1.5 py-2 text-sm"
                            aria-label={`${bell.label} entfernen`}
                            onClick={() => void removeBell(bell)}
                          >
                            ✕
                          </button>
                        </>
                      )}
                      {bellBlocked && isLeader && (
                        <button
                          type="button"
                          className="muted shrink-0 px-1.5 py-2 text-[11px] underline"
                          onClick={() => {
                            setBellLabel(bell.label);
                            void setBlocked(false);
                          }}
                        >
                          aufheben
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

      {/* Bottom-Sheet: Tür sperren */}
      {sheet === "block" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold">
              {activeBell
                ? `„${activeBell.label}" sperren?`
                : `${street?.name ?? ""} ${currentNumber} sperren?`}
            </h2>
            <p className="muted mt-2 text-xs">
              Gilt fürs ganze Team und dauerhaft – hier klingelt danach niemand mehr.
              Richtig, wenn ausdrücklich widersprochen wurde oder ein Schild „Keine
              Werbung" bzw. „Für Vertreter verboten" hängt: ein erkennbares Verbot zu
              missachten ist eine unzumutbare Belästigung. Aufheben kann die Sperre
              nur die Teamleitung.
            </p>

            <div className="mt-4">
              <label className="label" htmlFor="block-note">
                Grund (optional)
              </label>
              <input
                id="block-note"
                className="input"
                placeholder="z. B. Schild „Keine Werbung“"
                value={blockNote}
                onChange={(e) => setBlockNote(e.target.value.slice(0, 200))}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              className="btn btn-danger mt-4 w-full py-4 text-base"
              onClick={() => void setBlocked(true)}
            >
              🚫 Sperren
            </button>
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full"
              onClick={() => {
                setSheet(null);
                setBlockNote("");
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Bottom-Sheet: Termin vereinbaren */}
      {sheet === "appointment" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-base font-bold">Wann passt es?</h2>
              <p className="muted text-xs">
                {street?.name} {currentNumber}
                {activeBell ? ` · ${activeBell.label}` : ""} – ein Termin ohne Uhrzeit
                geht unter.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {quickSlots(now ?? undefined).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSlot(option.value)}
                  className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                    slot === option.value
                      ? "border-transparent bg-brand-600 text-white"
                      : "hairline border"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="slot-date">
                  Tag
                </label>
                <input
                  id="slot-date"
                  type="date"
                  className="input"
                  value={slotDate(slot)}
                  onChange={(e) =>
                    setSlot(
                      normalizeSlot(`${e.target.value} ${slotTime(slot) || "18:00"}`),
                    )
                  }
                />
              </div>
              <div className="w-32 shrink-0">
                <label className="label" htmlFor="slot-time">
                  Uhrzeit
                </label>
                <input
                  id="slot-time"
                  type="time"
                  className="input"
                  value={slotTime(slot)}
                  onChange={(e) =>
                    setSlot(
                      normalizeSlot(
                        `${slotDate(slot) || toSlot(now ?? new Date()).slice(0, 10)} ${
                          e.target.value
                        }`,
                      ),
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="contact-name">
                  Name
                </label>
                <input
                  id="contact-name"
                  className="input"
                  autoComplete="off"
                  placeholder="z. B. Frau Müller"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value.slice(0, 120))}
                />
              </div>
              <div className="w-40 shrink-0">
                <label className="label" htmlFor="contact-phone">
                  Telefon
                </label>
                <input
                  id="contact-phone"
                  className="input"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="optional"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value.slice(0, 40))}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="label" htmlFor="appointment-note">
                Notiz (optional)
              </label>
              <input
                id="appointment-note"
                className="input"
                placeholder="z. B. letzte Abrechnung bereitlegen"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <p className="muted mt-3 text-[11px]">
              Mit Rufnummer lässt sich der Termin vorher kurz bestätigen – das spart den
              vergeblichen Weg.
            </p>

            <button
              type="button"
              disabled={busy || !slot}
              className="btn btn-primary mt-3 w-full py-4 text-base"
              onClick={() => void submitAppointment()}
            >
              📅 Termin speichern
              {slot ? ` · ${slotLabel(slot, now ?? undefined)}` : ""}
            </button>
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full"
              onClick={() => setSheet(null)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Bottom-Sheet: Auftrag aufnehmen */}
      {sheet === "order" && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setSheet(null)}
        >
          <div
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:max-w-lg md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4">
              <h2 className="text-base font-bold">Auftrag aufnehmen</h2>
              <p className="muted text-xs">
                {street?.name} {currentNumber}
                {activeBell ? ` · ${activeBell.label}` : ""}
                {territory?.postal_code || territory?.city
                  ? ` · ${territory?.postal_code ?? ""} ${territory?.city ?? ""}`.trimEnd()
                  : ""}
              </p>
            </div>

            <div className="mb-3">
              <p className="label">Produkt</p>
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

            <div className="mb-3">
              <label className="label" htmlFor="order-name">
                Kunde
              </label>
              <input
                id="order-name"
                className="input"
                autoComplete="off"
                placeholder="Vor- und Nachname"
                value={order.customerName}
                onChange={(e) =>
                  setOrder({ ...order, customerName: e.target.value.slice(0, 120) })
                }
              />
            </div>

            <div className="mb-3 flex gap-2">
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="order-phone">
                  Telefon
                </label>
                <input
                  id="order-phone"
                  className="input"
                  inputMode="tel"
                  autoComplete="off"
                  value={order.customerPhone}
                  onChange={(e) =>
                    setOrder({ ...order, customerPhone: e.target.value.slice(0, 40) })
                  }
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="label" htmlFor="order-mail">
                  E-Mail
                </label>
                <input
                  id="order-mail"
                  className="input"
                  inputMode="email"
                  autoComplete="off"
                  value={order.customerEmail}
                  onChange={(e) =>
                    setOrder({ ...order, customerEmail: e.target.value.slice(0, 120) })
                  }
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOrderMore((v) => !v)}
              className="muted mb-3 w-full text-left text-xs font-semibold underline"
            >
              {orderMore ? "Weitere Angaben ausblenden" : "Zähler, Verbrauch, Anbieter …"}
            </button>

            {orderMore && (
              <div className="mb-3 rounded-xl border p-3 hairline">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="order-usage-strom">
                      Strom kWh/Jahr
                    </label>
                    <input
                      id="order-usage-strom"
                      className="input"
                      inputMode="numeric"
                      value={order.usageStrom}
                      onChange={(e) =>
                        setOrder({ ...order, usageStrom: e.target.value.slice(0, 7) })
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="order-usage-gas">
                      Gas kWh/Jahr
                    </label>
                    <input
                      id="order-usage-gas"
                      className="input"
                      inputMode="numeric"
                      value={order.usageGas}
                      onChange={(e) =>
                        setOrder({ ...order, usageGas: e.target.value.slice(0, 7) })
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="order-meter-strom">
                      Zähler Strom
                    </label>
                    <input
                      id="order-meter-strom"
                      className="input"
                      autoComplete="off"
                      value={order.meterStrom}
                      onChange={(e) =>
                        setOrder({ ...order, meterStrom: e.target.value.slice(0, 40) })
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="order-meter-gas">
                      Zähler Gas
                    </label>
                    <input
                      id="order-meter-gas"
                      className="input"
                      autoComplete="off"
                      value={order.meterGas}
                      onChange={(e) =>
                        setOrder({ ...order, meterGas: e.target.value.slice(0, 40) })
                      }
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="label" htmlFor="order-provider">
                    Bisheriger Anbieter
                  </label>
                  <input
                    id="order-provider"
                    className="input"
                    autoComplete="off"
                    value={order.previousProvider}
                    onChange={(e) =>
                      setOrder({ ...order, previousProvider: e.target.value.slice(0, 120) })
                    }
                  />
                </div>

                <div className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="order-tariff">
                      Tarif
                    </label>
                    <input
                      id="order-tariff"
                      className="input"
                      autoComplete="off"
                      value={order.tariff}
                      onChange={(e) =>
                        setOrder({ ...order, tariff: e.target.value.slice(0, 120) })
                      }
                    />
                  </div>
                  <div className="w-44 shrink-0">
                    <label className="label" htmlFor="order-start">
                      Lieferbeginn
                    </label>
                    <input
                      id="order-start"
                      type="date"
                      className="input"
                      value={order.startDate}
                      onChange={(e) => setOrder({ ...order, startDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="label" htmlFor="order-note">
                    Notiz
                  </label>
                  <input
                    id="order-note"
                    className="input"
                    placeholder="z. B. Zählerstand 12345"
                    value={order.note}
                    onChange={(e) => setOrder({ ...order, note: e.target.value.slice(0, 500) })}
                  />
                </div>
              </div>
            )}

            {/* Pflichtteil: ohne diese drei Punkte ist der Auftrag nicht sauber. */}
            <div className="mb-3 space-y-2">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-600)]"
                  checked={order.withdrawalGiven}
                  onChange={(e) => setOrder({ ...order, withdrawalGiven: e.target.checked })}
                />
                <span>
                  Widerrufsbelehrung ausgehändigt und erklärt
                  <span className="muted block text-[11px]">
                    14 Tage Widerrufsrecht ab heute – das gilt an der Haustür immer.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-600)]"
                  checked={order.privacyGiven}
                  onChange={(e) => setOrder({ ...order, privacyGiven: e.target.checked })}
                />
                <span>
                  Datenschutzhinweis übergeben
                  <span className="muted block text-[11px]">
                    Der Kunde weiß, wofür seine Daten erfasst werden.
                  </span>
                </span>
              </label>
            </div>

            <div className="mb-4">
              <p className="label">Unterschrift des Kunden</p>
              <SignaturePad
                value={order.signature}
                onChange={(signature) => setOrder((prev) => ({ ...prev, signature }))}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              className="btn btn-success w-full py-4 text-base"
              onClick={() => void submitOrder(true)}
            >
              <IconCheck />
              Auftrag speichern & Tarifrechner
              <IconArrowRight />
            </button>
            <button
              type="button"
              disabled={busy}
              className="btn btn-ghost mt-2 w-full"
              onClick={() => void submitOrder(false)}
            >
              Nur speichern – Tarifrechner später
            </button>
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                className="muted text-xs font-semibold underline"
                onClick={() => setSheet(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={busy}
                className="muted text-xs font-semibold underline"
                onClick={() => void saleWithoutOrder()}
              >
                Abschluss ohne Auftragsdaten zählen
              </button>
            </div>
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
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-full bg-brand-900 py-2 pl-4 pr-2 text-center text-sm font-semibold text-white shadow-lg md:bottom-8">
          <span className="min-w-0">{toast.text}</span>
          {toast.undo && lastVisitId !== null && (
            <button
              type="button"
              onClick={() => void undo()}
              className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-bold"
            >
              Rückgängig
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const EMPTY_VISITS: Map<string, LocalVisits> = new Map();

/**
 * Kennung fuer einen Auftrag, vom Geraet vergeben.
 *
 * Sie entsteht, sobald das Auftrags-Sheet aufgeht, und faehrt durch die
 * Warteschlange mit: egal wie oft der Eintrag nachgesendet wird, der Server
 * legt daraus genau einen Auftrag an.
 */
function newClientRef(): string {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, "");
}

/** Schluessel einer einzelnen Klingel in den Merklisten dieser Sitzung. */
function bellSlot(houseKey: string, label: string): string {
  return `${houseKey}:${bellKey(label)}`;
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
