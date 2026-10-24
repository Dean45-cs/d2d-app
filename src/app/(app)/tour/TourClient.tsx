"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PendingSales } from "@/components/PendingSales";
import { CardQrSheet, ConfirmSheet, useCardUrl, type Sender } from "@/components/BusinessCard";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { EmptyState, OutcomeGlyph } from "@/components/ui";
import { IconBan, IconBell, IconBuilding, IconCheck, IconHome, IconKeypad, IconMap, IconSparkles } from "@/components/icons";
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
import { confirmationText } from "@/lib/confirmation";
import {
  createVisitRequestId,
  discard as discardQueued,
  enqueue,
  fetchWithTimeout,
  flush,
  forgetQueuedBell,
} from "@/lib/offline-queue";
import { routeUrl } from "@/lib/map";
import type { LatLng } from "@/lib/geo/area";
import { distanceLabel, meters } from "@/lib/geo/route";
import {
  AT_DOOR,
  FAR_FROM_DOOR,
  ROUGH_ACCURACY,
  SUGGEST_ACCURACY,
  USABLE_ACCURACY,
  byDistance,
  distanceText,
  nearest,
  placeHouses,
  streetDistances,
  territoryDistances,
  worthSuggesting,
  type Distance,
} from "@/lib/geo/nearby";
import { firstName } from "@/lib/ranking";
import type { LevelProgress } from "@/lib/levels";
import { levelFeedbackText, type LevelFeedback } from "@/lib/level-feedback";
import { BellBoard, type BellRow } from "./BellBoard";
import { DoorHero, type DoorStatusLine } from "./DoorHero";
import { HouseStrip, type ChipState, type HouseChip } from "./HouseStrip";
import { OutcomeTray, TRAY_ICON, type TrayAction } from "./OutcomeTray";
import { TourAppointments } from "./TourAppointments";
import { TourHeader } from "./TourHeader";
import { TourNearby } from "./TourNearby";
import {
  AppointmentSheet,
  BlockSheet,
  DaySheet,
  HouseSheet,
  NumberSheet,
  ReasonSheet,
  SaleSheet,
  StreetSheet,
  type StreetOrder,
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
import { LOCATION_NOTE, useLocation, type Fix } from "./useLocation";
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
  /** Wer Terminbestaetigungen unterschreibt, samt Visitenkarte (falls eingeschaltet). */
  sender: Sender;
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
  sender,
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
  /** Bestaetigung zum eben vereinbarten Termin - solange der Kunde noch an der Tuer steht. */
  const [confirm, setConfirm] = useState<{ place: string; phone: string; text: string } | null>(null);
  const cardUrl = useCardUrl(sender.cardToken);
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
  /** Strassenwahl nach Naehe oder in der Reihenfolge des Gebiets. */
  const [streetOrder, setStreetOrder] = useState<StreetOrder>("near");
  /** Gerade wird fuer "In meiner Nähe" geortet. */
  const [locating, setLocating] = useState(false);
  /** Weggetippter Hinweis: wo und an welcher Tuer - er kommt erst ein Stueck weiter wieder. */
  const [dismissedNearby, setDismissedNearby] = useState<{ at: LatLng; door: string } | null>(null);
  /** Strasse in einem nahen Gebiet, das gerade laedt - danach geht "In meiner Nähe" dort weiter. */
  const [nearbyAfterLoad, setNearbyAfterLoad] = useState<number | null>(null);
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
    if (recall("d2d_street_order") === "list") setStreetOrder("list");
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
  }, [streets, territories, toast]);

  // Die Uhr fuer "heute faellig" - im Hintergrund steht sie still (Akku) und
  // stellt sich beim Zurueckkommen sofort.
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), 60_000);
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearInterval(timer);
    };
  }, []);

  /*
   * Der Standort laeuft mit, solange die Tour offen ist: fuer "In meiner
   * Nähe" und die Entfernungen - das bleibt auf dem Geraet.
   */
  const location = useLocation();
  const fix = location.fix;
  /*
   * Gespeichert wird er mit jedem Eintrag (die Route zum Termin fuehrt
   * dorthin). Das ist eine Mitarbeiterortung, siehe README. Wer sie nicht
   * will, setzt hier null - "In meiner Nähe" bleibt davon unberuehrt.
   */
  const position = fix ? { lat: fix.point[0], lng: fix.point[1] } : null;

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

  /* ---------------------------- In der Naehe ----------------------------- */

  /** Ein Standort, der fuer Entfernungen taugt - am Rechner kaeme sonst die Ortung ueber die IP. */
  const near = fix && fix.accuracy <= USABLE_ACCURACY ? fix : null;
  const accuracy = near?.accuracy ?? 0;
  const doorDone = book.isDone;

  /** Wo jede Tuer liegt - ohne eigenen Punkt beim Nachbarhaus. */
  const spots = useMemo(() => placeHouses(houseNumbers, streets), [houseNumbers, streets]);

  /** Wo vorgeschlagen werden darf: nicht in Gebieten, die nur wegen eines Termins dabei sind. */
  const workHouses = useMemo(() => {
    const appointmentsOnly = new Set(territories.filter((t) => t.appointmentsOnly).map((t) => t.id));
    const territoryOf = new Map(streets.map((s) => [s.id, s.territory_id]));
    return houseNumbers.filter((house) => {
      const id = territoryOf.get(house.street_id);
      return id !== undefined && !appointmentsOnly.has(id);
    });
  }, [houseNumbers, streets, territories]);

  /** Die naechste offene Tuer ab hier - der Vorschlag wechselt erst, wenn eine andere deutlich naeher ist. */
  const suggested = useRef<number | null>(null);
  const nearestDoor = useMemo(
    () =>
      near
        ? nearest(
            near.point,
            workHouses.filter((house) => !doorDone(house)),
            (house) => spots.get(house.id),
            (house) => house.id === suggested.current,
          )
        : null,
    [near, workHouses, doorDone, spots],
  );
  useEffect(() => {
    suggested.current = nearestDoor?.item.id ?? null;
  }, [nearestDoor]);

  /** Entfernung je Strasse (bis zur naechsten offenen Tuer) und je Gebiet. */
  const streetDistance = useMemo(
    () => (near ? streetDistances(near.point, streets, houseNumbers, spots, (house) => !doorDone(house)) : null),
    [near, streets, houseNumbers, spots, doorDone],
  );
  const territoryDistance = useMemo(
    () => (streetDistance ? territoryDistances(streets, streetDistance) : null),
    [streets, streetDistance],
  );

  const currentSpot = currentHouse ? spots.get(currentHouse.id) : undefined;
  const currentDistance: Distance | null =
    near && currentSpot ? { meters: meters(near.point, currentSpot.point), approx: currentSpot.approx } : null;

  /** "Lindenstraße 14" */
  function addressOf(house: HouseNumberWithStats): string {
    return `${streets.find((s) => s.id === house.street_id)?.name ?? ""} ${house.number}`.trim();
  }

  /*
   * Keine Nummer gewaehlt: eine offene Tuer der Strasse steht bereit - mit
   * Standort die naechstgelegene, denn dort faengt man an; sonst die erste.
   */
  useEffect(() => {
    if (houseNumber || houses.length === 0) return;
    const open = houses.filter((h) => !book.isDone(h));
    const first = (near ? nearest(near.point, open, (h) => spots.get(h.id))?.item : null) ?? open[0];
    if (first) setHouseNumber(first.number);
    // Nur beim Wechsel der Strasse oder wenn die Auswahl leer wurde - nicht bei jedem Schritt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseNumber, houses]);

  /*
   * Gebiete, deren Hausnummern noch nicht geladen sind (Teamleitung in
   * fremden Gebieten), kennen nur den Punkt ihrer Strassen. Liegt so eine
   * Strasse deutlich naeher als jede geladene offene Tuer, ist dort die
   * naechste Tuer zu suchen - nach dem Laden.
   */
  function closerUnloaded(from: LatLng, than: number): { street: StreetWithStats; distance: Distance } | null {
    const candidates = streets.filter(
      (s) => !loaded.has(s.territory_id) && !territories.find((t) => t.id === s.territory_id)?.appointmentsOnly,
    );
    if (candidates.length === 0) return null;
    const distances = streetDistances(from, candidates, [], spots, () => true);
    const [best] = byDistance(candidates, (s) => distances.get(s.id)?.meters);
    const distance = best ? distances.get(best.id) : undefined;
    return best && distance && distance.meters + FAR_FROM_DOOR < than ? { street: best, distance } : null;
  }
  const unloadedNearby = near ? closerUnloaded(near.point, nearestDoor?.distance.meters ?? Infinity) : null;

  function territoryName(id: number): string {
    return territories.find((t) => t.id === id)?.name ?? "Das Gebiet";
  }

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

  /*
   * Haus aus der Liste: bei langen Strassen (iPad hochkant, Raster) ist die
   * grosse Nummer samt Klingelbrett dann oft schon aus dem Bild gerollt.
   * Sie kommt zurueck - nur wenn sie nicht ohnehin zu sehen ist.
   */
  const doorRef = useRef<HTMLDivElement>(null);
  function pickFromStrip(number: string) {
    pickHouse(number);
    const hero = doorRef.current?.querySelector<HTMLElement>(".door-hero");
    if (!hero) return;
    const box = hero.getBoundingClientRect();
    const trayTop = document.querySelector(".tray")?.getBoundingClientRect().top ?? window.innerHeight;
    if (box.top < 0 || box.bottom > trayTop) hero.scrollIntoView({ block: "center", behavior: "smooth" });
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

  /** Eine Tuer einstellen - auch in einer anderen Strasse oder einem anderen Gebiet. */
  function goToHouse(house: HouseNumberWithStats) {
    const target = streets.find((s) => s.id === house.street_id);
    if (!target) return;
    setTerritoryId(target.territory_id);
    if (target.id !== streetId) {
      setStreetId(target.id);
      remember("d2d_street", String(target.id));
    }
    setHouseNumber(house.number);
    setBellLabel("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * "In meiner Nähe": zur naechsten offenen Tuer in allen eigenen Gebieten.
   * Ein alter oder grober Standort wird vorher aufgefrischt - die Tuer soll stimmen.
   */
  async function goNearby() {
    if (locating) return;
    let here: Fix | null = fix;
    let status = location.status;
    if (!here || Date.now() - here.at > 30_000 || here.accuracy > ROUGH_ACCURACY) {
      setLocating(true);
      const fresh = await location.locate();
      setLocating(false);
      here = fresh.fix ?? here;
      status = fresh.status;
    }
    if (!here) {
      toast(LOCATION_NOTE[status === "ok" ? "unavailable" : status]);
      return;
    }
    if (here.accuracy > USABLE_ACCURACY) {
      toast(`Standort zu ungenau (± ${distanceLabel(here.accuracy)}) – kurz warten oder ins Freie gehen`);
      return;
    }
    const open = workHouses.filter((house) => !doorDone(house));
    const found = nearest(here.point, open, (house) => spots.get(house.id));
    const elsewhere = closerUnloaded(here.point, found?.distance.meters ?? Infinity);
    if (elsewhere) {
      openArea(elsewhere.street);
      return;
    }
    if (!found) {
      toast(open.length > 0 ? "Zu den offenen Türen ist keine Lage bekannt" : "Keine offene Tür in deinen Gebieten");
      return;
    }
    setSheet(null);
    const line = `${addressOf(found.item)} · ${distanceText(found.distance, here.accuracy)}`;
    if (found.item.id === currentHouse?.id) {
      toast(`Nächste offene Tür: ${line}`);
      return;
    }
    goToHouse(found.item);
    const spot = spots.get(found.item.id)!;
    toast(
      line,
      // Weiter weg als ein paar Haeuser: der Weg dorthin gleich dazu.
      found.distance.meters > FAR_FROM_DOOR
        ? {
            action: {
              label: "Route",
              onClick: () => {
                window.open(routeUrl(spot.point[0], spot.point[1], "walk"), "_blank", "noopener");
              },
            },
          }
        : {},
    );
  }

  /** Ein nahes, noch nicht geladenes Gebiet oeffnen - sind seine Tueren da, geht "In meiner Nähe" dort weiter. */
  function openArea(target: StreetWithStats) {
    setSheet(null);
    setTerritoryId(target.territory_id);
    chooseStreet(target.id);
    setNearbyAfterLoad(target.id);
    toast(`${territoryName(target.territory_id)} liegt näher – Türen werden geladen`);
  }

  useEffect(() => {
    if (nearbyAfterLoad === null) return;
    // Inzwischen selbst woanders hingewechselt: nicht mehr ungefragt springen.
    if (nearbyAfterLoad !== streetId) {
      setNearbyAfterLoad(null);
      return;
    }
    if (housesPending) return;
    setNearbyAfterLoad(null);
    void goNearby();
    // Nur wenn das Laden fertig ist - goNearby sieht dann die frischen Tueren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyAfterLoad, streetId, housesPending]);

  /**
   * Beim Wechsel ins Gebiet: die naechste Strasse mit offenen Tueren, ohne
   * Standort die erste offene. Ohne geladene Hausnummern ist "offen"
   * unbekannt - dann kommt die Strasse in Frage.
   */
  function entryStreet(territory: number): number | null {
    const list = streets.filter((s) => s.territory_id === territory);
    const open = list.filter((s) => (progress.get(s.id)?.open ?? 1) > 0);
    const pool = open.length > 0 ? open : list;
    const ranked = streetDistance ? byDistance(pool, (s) => streetDistance.get(s.id)?.meters) : pool;
    return ranked[0]?.id ?? null;
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
      const response = await fetchWithTimeout(`/api/doorbells/${bell.id}`, { method: "DELETE" });
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
      const response = await fetchWithTimeout(`/api/doorbells/${bell.id}`, {
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
      const response = await fetchWithTimeout(`/api/visits/${id}`, { method: "DELETE" });
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
        ? "Was für ein Haus ist das?"
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
    // Mit Rufnummer gleich die Bestaetigung anbieten - auch offline, WhatsApp und SMS senden nach.
    if (values.phone) {
      setConfirm({
        place,
        phone: values.phone,
        text: confirmationText({
          contactName: values.name,
          slot: values.slot,
          senderName: sender.name,
          teamName: sender.teamName,
          cardUrl,
        }),
      });
    }
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
  const next = streetDone ? pickNextStreet() : null;
  const nextStreet = next?.street ?? null;

  /*
   * Nach einer fertigen Strasse: die naechste mit offenen Tueren - die
   * naechstgelegene ab dem eigenen Standort, sonst ab dieser Strasse, sonst
   * in der Reihenfolge des Gebiets.
   */
  function pickNextStreet(): { street: StreetWithStats; distance: Distance | null } | null {
    const open = streetsOfTerritory.filter((s) => s.id !== streetId && (progress.get(s.id)?.open ?? 0) > 0);
    if (open.length === 0) return null;
    const from: LatLng | null = near?.point ?? (street?.lat != null && street.lng != null ? [street.lat, street.lng] : null);
    if (!from) return { street: open[0], distance: null };
    const distances =
      near && streetDistance ? streetDistance : streetDistances(from, open, houseNumbers, spots, (house) => !doorDone(house));
    const [best] = byDistance(open, (s) => distances.get(s.id)?.meters);
    // Eine Entfernung nennen nur, wenn sie ab dem eigenen Standort gemessen ist.
    return { street: best, distance: near ? (distances.get(best.id) ?? null) : null };
  }

  /*
   * Hinweis auf eine naehere offene Tuer - nur, wenn die gewaehlte weit weg
   * ist (nach der Fahrt ins Gebiet, die Strasse von gestern ist noch
   * eingestellt). Ohne eigene Lage zaehlt die Strasse der Tuer.
   */
  const nearbyHint = (() => {
    if (!near || housesPending) return null;
    const suggestion = unloadedNearby?.distance ?? nearestDoor?.distance;
    if (!suggestion) return null;
    if (!unloadedNearby && nearestDoor?.item.id === currentHouse?.id) return null;
    if (
      dismissedNearby &&
      dismissedNearby.door === currentKey &&
      meters(dismissedNearby.at, near.point) < FAR_FROM_DOOR
    ) {
      return null;
    }
    const reference = currentDistance ?? (streetId ? (streetDistance?.get(streetId) ?? null) : null);
    if (street && (!reference || !worthSuggesting(reference, suggestion, near.accuracy))) return null;
    if (!street && near.accuracy > SUGGEST_ACCURACY) return null;
    const distance = distanceText(suggestion, near.accuracy);

    if (unloadedNearby) {
      const target = unloadedNearby.street;
      return {
        place: target.name,
        distance,
        context: territoryName(target.territory_id),
        route: target.lat != null && target.lng != null ? routeUrl(target.lat, target.lng, "walk") : null,
        go: () => openArea(target),
      };
    }
    const house = nearestDoor!.item;
    const target = streets.find((s) => s.id === house.street_id);
    const spot = spots.get(house.id)!;
    return {
      place: addressOf(house),
      distance,
      context: target && target.territory_id !== territoryId ? territoryName(target.territory_id) : null,
      route: routeUrl(spot.point[0], spot.point[1], "walk"),
      go: () => goToHouse(house),
    };
  })();

  /* Wie weit die gewaehlte Tuer weg ist - steht man davor (oder ist der Standort zu grob dafuer), nichts. */
  const doorDistance =
    currentDistance && currentDistance.meters >= Math.max(2 * AT_DOOR, accuracy)
      ? `${distanceText(currentDistance, accuracy)} entfernt`
      : null;

  /** Fuer "Nächste offene Tür in meiner Nähe" in der Strassenwahl: wohin, oder warum nicht. */
  const nearbyLine = locating
    ? LOCATION_NOTE.searching
    : near
      ? unloadedNearby
        ? `${territoryName(unloadedNearby.street.territory_id)} · ${distanceText(unloadedNearby.distance, near.accuracy)} – Türen laden`
        : nearestDoor
        ? `${addressOf(nearestDoor.item)} · ${distanceText(nearestDoor.distance, near.accuracy)}`
        : workHouses.some((house) => !doorDone(house))
          ? "Zu den offenen Türen ist keine Lage bekannt"
          : "Keine offene Tür in deinen Gebieten"
      : location.status === "ok"
        ? "Standort zu ungenau"
        : LOCATION_NOTE[location.status];

  const setupActions: TrayAction[] = !street
    ? [{ label: "Straße wählen", icon: <IconMap className={TRAY_ICON} />, onClick: () => setSheet("street"), primary: true }]
    : housesPending
      ? []
      : !currentNumber
        ? streetDone && nextStreet
          ? [{ label: `Weiter: ${nextStreet.name}`, icon: <IconMap className={TRAY_ICON} />, onClick: () => chooseStreet(nextStreet.id), primary: true }]
          : [{ label: "Nummer eingeben", icon: <IconKeypad className={TRAY_ICON} />, onClick: () => setSheet("number"), primary: true }]
        : doorLocked
          ? [{ label: "Haus ansehen", icon: <IconHome className={TRAY_ICON} />, onClick: () => setSheet("house") }]
          : currentType === ""
            ? [
                { label: "Einfamilienhaus", icon: <IconHome className={TRAY_ICON} />, onClick: () => void chooseType("EFH"), primary: !suggestMfh },
                { label: "Mehrfamilienhaus", icon: <IconBuilding className={TRAY_ICON} />, onClick: () => void chooseType("MFH"), primary: suggestMfh },
              ]
            : currentType === "MFH" && currentBells.length === 0
              ? [{ label: "Klingelschilder anlegen", icon: <IconBell className={TRAY_ICON} />, onClick: () => setSheet("house"), primary: true }]
              : currentType === "MFH" && !activeBell
                ? [{ label: "Klingel wählen", icon: <IconBell className={TRAY_ICON} />, onClick: () => setSheet("bells"), primary: true }]
                : [];

  const lastLine = (() => {
    const at = currentHouse?.last_visit_at;
    if (!at) return null;
    return `${currentHouse?.last_visit_user ?? "Jemand"}, ${whenLabel(at)}`;
  })();

  // Aufbau je Geraet (Handy, iPad hochkant/quer): globals.css, "Klinken".
  return (
    <div className="tour">
      <div className="tour-grid">
        <div className="tour-head">
          <TourHeader
            street={street}
            territory={territory}
            todayDoors={(todayTotals.doors ?? 0) + queuedToday}
            dueCount={dueAppointments.length}
            pendingCount={pending.length}
            online={online}
            onStreet={() => setSheet("street")}
            onDay={() => setSheet("day")}
            onCard={sender.cardToken ? () => setSheet("card") : undefined}
          />
        </div>

        {/* Oben auf Handy und iPad hochkant, rechts auf dem iPad quer: die Tuer selbst. */}
        <div ref={doorRef} className="tour-door space-y-4">
          <TourAppointments appointments={dueAppointments} now={now} onPick={goToAppointment} />

          {nearbyHint && (
            <TourNearby
              place={nearbyHint.place}
              distance={nearbyHint.distance}
              context={nearbyHint.context}
              route={nearbyHint.route}
              onGo={nearbyHint.go}
              onDismiss={() => near && setDismissedNearby({ at: near.point, door: currentKey })}
            />
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
            distance={housesPending ? null : doorDistance}
            locating={locating}
            onNearby={() => void goNearby()}
            empty={
              streetDone ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="glyph glyph-lg glyph-round glyph-result check-pop">
                    <IconCheck className="h-6 w-6" />
                  </span>
                  <p className="text-title-3">Straße erledigt</p>
                  {/* "Weiter: …" ist die Hauptaktion in der Leiste darunter - hier nur, wohin es geht. */}
                  {nextStreet && (
                    <p className="text-footnote text-muted">
                      Als Nächstes: {nextStreet.name}
                      {next?.distance && ` · ${distanceText(next.distance, accuracy)}`}
                    </p>
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
        </div>

        {/* Im Daumenbereich - wo genau, regelt globals.css je Geraet. */}
        <OutcomeTray
          disabled={busy}
          hint={streetDone && !housesPending ? "Straße erledigt" : trayHint}
          setupActions={setupActions}
          onNotHome={() => void notHome()}
          onMet={() => setSheet("reason")}
          onAppointment={() => setSheet("appointment")}
          onSale={() => setSheet("sale")}
        />

        <div className="tour-lists space-y-6">
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
              onPick={pickFromStrip}
            />
          )}
          <div className="tray-space" aria-hidden="true" />
        </div>
      </div>

      {sheet === "street" && (
        <StreetSheet
          territories={territories}
          territoryId={territoryId}
          streets={streetsOfTerritory}
          streetId={streetId}
          progress={progress}
          distances={streetDistance}
          territoryDistances={territoryDistance}
          accuracy={accuracy}
          order={streetOrder}
          onOrder={(order) => {
            setStreetOrder(order);
            remember("d2d_street_order", order);
          }}
          nearby={{ line: nearbyLine, busy: locating }}
          onNearby={() => void goNearby()}
          onTerritory={(id) => {
            setTerritoryId(id);
            // Sonst stuende die Strasse eines anderen Gebiets unter dem neuen Namen.
            chooseStreet(entryStreet(id));
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
      {confirm && (
        <ConfirmSheet place={confirm.place} phone={confirm.phone} text={confirm.text} onClose={() => setConfirm(null)} />
      )}
      {sheet === "card" && sender.cardToken && (
        <CardQrSheet
          token={sender.cardToken}
          name={sender.name}
          avatar={team.find((member) => member.id === userId)?.avatar || null}
          teamName={sender.teamName}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "sale" && (
        <SaleSheet place={place} product={product} busy={busy} onPick={startSale} onClose={() => setSheet(null)} />
      )}
      {sheet === "bells" && currentNumber && !housesPending && (
        <Sheet title="Klingel wählen" subtitle={`${street?.name ?? ""} ${currentNumber}`} onClose={() => setSheet(null)}>
          <BellBoard
            rows={bellRows}
            selected={bellLabel}
            next={nextOpenBell?.label ?? null}
            faceOf={faceOf}
            onPick={(label) => {
              setBellLabel(label);
              setSheet(null);
            }}
            onEdit={() => setSheet("house")}
          />
        </Sheet>
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
