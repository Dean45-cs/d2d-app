"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DoorbellWithStats, HouseNumberWithStats } from "@/lib/queries";
import type { BuildingType } from "@/lib/types";
import { bellKey, type DoorbellInput } from "@/lib/doorbells";
import { doorFinished, type DoorFacts } from "@/lib/doors";
import { readDraft, writeDraft, type LocalVisits } from "@/lib/tour-draft";
import type { QueuedWrite } from "@/lib/offline-queue";
import { EMPTY_VISITS, NEW_BELL, bellSlot, doneKey, type Bell } from "./model";

/**
 * Das "Tuerbuch" dieser Sitzung: Serverstand plus alles, was an der Tuer
 * gerade dazukam - auch ohne Netz.
 *
 *  - gepufferte Eintraege bleiben als Zuschlag, bis die Warteschlange leer ist
 *  - online gespeicherte gelten nur, bis frische Serverdaten da sind
 *  - Haustyp, neue Schilder und Sperren stehen sofort, gesichert im Geraet
 *
 * Daraus ergibt sich fuer jede Tuer: offen, nochmal, erledigt, gesperrt.
 */
export function useDoorBook(
  houseNumbers: HouseNumberWithStats[],
  doorbells: DoorbellWithStats[],
  pending: QueuedWrite[],
) {
  const [localTypes, setLocalTypes] = useState<Map<string, BuildingType>>(new Map());
  const [localBells, setLocalBells] = useState<Map<string, DoorbellInput[]>>(new Map());
  const [localVisits, setLocalVisits] = useState<Map<string, LocalVisits>>(new Map());
  const [localBlocked, setLocalBlocked] = useState<Set<string>>(new Set());
  const [draftLoaded, setDraftLoaded] = useState(false);

  /*
   * Gerade online gespeicherte Eintraege, bis der Server sie zurueckmeldet.
   * Sobald frische Serverdaten da sind, stecken sie dort drin - der Zuschlag
   * verschwindet in derselben Render-Runde, sonst zaehlte ein Versuch doppelt.
   */
  const [fresh, setFresh] = useState<{ from: HouseNumberWithStats[]; visits: Map<string, LocalVisits> }>(
    () => ({ from: houseNumbers, visits: EMPTY_VISITS }),
  );
  const freshVisits = fresh.from === houseNumbers ? fresh.visits : EMPTY_VISITS;

  // Zwischenstand aus dem Geraet holen, danach bei jeder Aenderung sichern.
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

  /*
   * Wartet kein Tuereintrag mehr, kennt der Server alles - dann muss der
   * lokale Zuschlag weg, gleich wer die Warteschlange geleert hat.
   */
  const hadQueuedDoors = useRef(false);
  useEffect(() => {
    const queued = pending.some((item) => item.url !== "/api/sale-drafts");
    if (hadQueuedDoors.current && !queued) {
      setLocalVisits(new Map());
      setLocalBlocked(new Set());
    }
    hadQueuedDoors.current = queued;
  }, [pending]);

  /** Klingeln je Hausnummer, einmal vorsortiert. */
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
        last_visit_user_id: bell.last_visit_user_id,
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

  /** Serverstand plus Zuschlag - daraus der Stand der Tuer, auch ohne Netz. */
  const factsOf = useCallback(
    (key: string, base: DoorFacts): DoorFacts => {
      const queued = localVisits.get(key);
      const online = freshVisits.get(key);
      return {
        blocked_at: localBlocked.has(key) ? (base.blocked_at ?? "lokal") : base.blocked_at,
        not_home_count: base.not_home_count + (queued?.notHome ?? 0) + (online?.notHome ?? 0),
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

  /** Ein Mehrfamilienhaus ist erst fertig, wenn jede Klingel dran war. */
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

  /** Eine erfasste Tuer sofort zaehlen - gepuffert oder bis zur Serverantwort. */
  const countVisit = useCallback(
    (key: string, notHome: boolean, queued: boolean) => {
      const add = (prev: Map<string, LocalVisits>) => {
        const next = new Map(prev);
        const seen = next.get(key) ?? { notHome: 0, met: 0 };
        next.set(key, { notHome: seen.notHome + (notHome ? 1 : 0), met: seen.met + (notHome ? 0 : 1) });
        return next;
      };
      if (queued) setLocalVisits(add);
      else
        setFresh((prev) => ({
          from: houseNumbers,
          visits: add(prev.from === houseNumbers ? prev.visits : EMPTY_VISITS),
        }));
    },
    [houseNumbers],
  );

  /** Haustyp lokal setzen; liefert die Ruecknahme fuer den Fall einer Ablehnung. */
  const setType = useCallback(
    (key: string, type: BuildingType) => {
      const before = localTypes.get(key);
      setLocalTypes((prev) => new Map(prev).set(key, type));
      return () =>
        setLocalTypes((prev) => {
          const next = new Map(prev);
          if (before === undefined) next.delete(key);
          else next.set(key, before);
          return next;
        });
    },
    [localTypes],
  );

  const addBells = useCallback((key: string, entries: DoorbellInput[]) => {
    setLocalBells((prev) => {
      const next = new Map(prev);
      next.set(key, [...(next.get(key) ?? []), ...entries]);
      return next;
    });
    return () => {
      const rejected = new Set(entries.map((entry) => bellKey(entry.label)));
      setLocalBells((prev) => {
        const next = new Map(prev);
        next.set(key, (next.get(key) ?? []).filter((entry) => !rejected.has(bellKey(entry.label))));
        return next;
      });
    };
  }, []);

  const dropBell = useCallback((key: string, label: string) => {
    setLocalBells((prev) => {
      const next = new Map(prev);
      next.set(key, (next.get(key) ?? []).filter((entry) => bellKey(entry.label) !== bellKey(label)));
      return next;
    });
  }, []);

  const setBlocked = useCallback((key: string, blocked: boolean) => {
    setLocalBlocked((prev) => {
      const next = new Set(prev);
      if (blocked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return {
    localTypes,
    typeOf,
    bellsOf,
    factsOf,
    bellFacts,
    isBellDone,
    isDone,
    countVisit,
    setType,
    addBells,
    dropBell,
    setBlocked,
  };
}

export type DoorBook = ReturnType<typeof useDoorBook>;
