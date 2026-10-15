"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DoorbellWithStats, HouseNumberWithStats } from "@/lib/queries";
import type { BuildingType } from "@/lib/types";
import { bellKey, type DoorbellInput } from "@/lib/doorbells";
import { doorFinished, type DoorFacts } from "@/lib/doors";
import { readDraft, writeDraft, type LocalVisits } from "@/lib/tour-draft";
import { onDropped, type QueuedWrite } from "@/lib/offline-queue";
import { NEW_BELL, bellSlot, doneKey, type Bell } from "./model";

/**
 * Das "Tuerbuch" dieser Sitzung: Serverstand plus alles, was an der Tuer
 * gerade dazukam - auch ohne Netz.
 *
 *  - jeder erfasste Eintrag zaehlt sofort und so lange, bis der Server ihn
 *    selbst zaehlt - egal ob er gepuffert war oder online gespeichert wurde,
 *    und egal wie lange das Nachladen im Funkloch dauert
 *  - Haustyp, neue Schilder und Sperren stehen sofort und gelten, bis der
 *    Server sie bestaetigt; danach gilt wieder nur der Server (so tauchen
 *    umbenannte oder geloeschte Schilder nicht als Geister wieder auf)
 *  - was nie beim Server ankommt (verworfen, abgelehnt), wird zurueckgenommen
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

  /** Was der Server je Tuer weiss - zum Abgleich mit dem lokalen Stand. */
  const server = useMemo(() => {
    const facts = new Map<string, DoorFacts>();
    const types = new Map<string, BuildingType>();
    const bells = new Map<string, Set<string>>();
    const keyOf = new Map<number, string>();
    for (const house of houseNumbers) {
      const key = doneKey(house.street_id, house.number);
      keyOf.set(house.id, key);
      facts.set(key, house);
      types.set(key, house.building_type);
    }
    for (const bell of doorbells) {
      const key = keyOf.get(bell.house_number_id);
      if (!key) continue;
      const labels = bells.get(key) ?? new Set<string>();
      labels.add(bellKey(bell.label));
      bells.set(key, labels);
      facts.set(bellSlot(key, bell.label), bell);
    }
    return { facts, types, bells };
  }, [houseNumbers, doorbells]);

  /*
   * Was der Server inzwischen selbst kennt, braucht keinen lokalen Zuschlag
   * mehr. Aufgeraeumt wird erst nach seiner Bestaetigung - nicht schon, wenn
   * die Warteschlange leer ist: dazwischen kann das Nachladen im Funkloch
   * haengen, und die Tuer saehe sonst wieder unbesucht aus.
   */
  useEffect(() => {
    if (!draftLoaded) return;
    setLocalTypes((prev) => without(prev, (type, key) => server.types.get(key) === type));
    setLocalBells((prev) => {
      let changed = false;
      const next = new Map<string, DoorbellInput[]>();
      for (const [key, entries] of prev) {
        const known = server.bells.get(key);
        const open = known ? entries.filter((entry) => !known.has(bellKey(entry.label))) : entries;
        if (open.length !== entries.length) changed = true;
        if (open.length > 0) next.set(key, open);
      }
      return changed ? next : prev;
    });
    setLocalBlocked((prev) => {
      const next = new Set([...prev].filter((key) => !server.facts.get(key)?.blocked_at));
      return next.size === prev.size ? prev : next;
    });
    setLocalVisits((prev) =>
      without(prev, (local, key) => {
        if (local.baseNotHome === undefined) return false; // Altbestand: siehe unten
        const known = server.facts.get(key);
        return Boolean(
          known &&
            known.not_home_count >= local.baseNotHome + local.notHome &&
            known.met_count >= (local.baseMet ?? 0) + local.met,
        );
      }),
    );
  }, [draftLoaded, server]);

  /*
   * Altbestand aus einer aelteren Version kennt keinen Serverstand. Er gilt
   * wie frueher, bis keine Tuer mehr in der Warteschlange wartet.
   */
  const hadQueuedDoors = useRef(false);
  useEffect(() => {
    const queued = pending.some((item) => item.url !== "/api/sale-drafts");
    if (hadQueuedDoors.current && !queued) {
      setLocalVisits((prev) => without(prev, (local) => local.baseNotHome === undefined));
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

  /** Serverstand plus eigene Eintraege - daraus der Stand der Tuer, auch ohne Netz. */
  const factsOf = useCallback(
    (key: string, base: DoorFacts): DoorFacts => {
      const local = localVisits.get(key);
      let notHome = base.not_home_count;
      let met = base.met_count;
      if (local && local.baseNotHome === undefined) {
        notHome += local.notHome;
        met += local.met;
      } else if (local) {
        // Mindestens der Stand von vorher plus die eigenen Eintraege - bis der Server sie selbst zaehlt.
        notHome = Math.max(notHome, local.baseNotHome! + local.notHome);
        met = Math.max(met, (local.baseMet ?? 0) + local.met);
      }
      return {
        blocked_at: localBlocked.has(key) ? (base.blocked_at ?? "lokal") : base.blocked_at,
        not_home_count: notHome,
        met_count: met,
      };
    },
    [localVisits, localBlocked],
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

  /**
   * Eine erfasste Tuer sofort zaehlen. `base` ist der Serverstand der Tuer
   * in diesem Moment - so verschwindet der Zuschlag genau dann, wenn der
   * Server den Eintrag selbst zaehlt.
   */
  const countVisit = useCallback((key: string, base: DoorFacts, notHome: boolean) => {
    setLocalVisits((prev) => {
      const next = new Map(prev);
      const seen = next.get(key);
      const entry: LocalVisits =
        seen && seen.baseNotHome !== undefined
          ? seen
          : {
              notHome: seen?.notHome ?? 0,
              met: seen?.met ?? 0,
              baseNotHome: base.not_home_count,
              baseMet: base.met_count,
            };
      next.set(key, {
        ...entry,
        notHome: entry.notHome + (notHome ? 1 : 0),
        met: entry.met + (notHome ? 0 : 1),
      });
      return next;
    });
  }, []);

  /** Einen sofort gezaehlten Eintrag zuruecknehmen - "Rückgängig", verworfen, abgelehnt. */
  const uncountVisit = useCallback((key: string, notHome: boolean) => {
    setLocalVisits((prev) => {
      const seen = prev.get(key);
      if (!seen) return prev;
      const next = new Map(prev);
      const left = {
        ...seen,
        notHome: Math.max(0, seen.notHome - (notHome ? 1 : 0)),
        met: Math.max(0, seen.met - (notHome ? 0 : 1)),
      };
      if (left.notHome === 0 && left.met === 0) next.delete(key);
      else next.set(key, left);
      return next;
    });
  }, []);

  /*
   * Was nie beim Server ankommt - in "Heute" verworfen oder vom Server
   * abgelehnt -, nimmt die Anzeige wieder zurueck.
   */
  useEffect(
    () =>
      onDropped((entries) => {
        for (const entry of entries) {
          const payload = entry.payload;
          const streetId = Number(payload.streetId);
          const number = String(payload.houseNumber ?? "");
          if (!streetId || !number) continue;
          const house = doneKey(streetId, number);
          const bell = String(payload.bellLabel ?? payload.doorbellLabel ?? "");
          const key = bell ? bellSlot(house, bell) : house;
          if ((entry.url ?? "/api/visits") === "/api/visits") {
            uncountVisit(key, payload.outcome === "NOT_HOME");
          } else if (entry.url === "/api/houses") {
            if (payload.blocked === true) {
              setLocalBlocked((prev) => (prev.has(key) ? new Set([...prev].filter((item) => item !== key)) : prev));
            }
            if (payload.buildingType !== undefined) {
              setLocalTypes((prev) => without(prev, (_type, typeKey) => typeKey === house));
            }
            if (Array.isArray(payload.doorbells)) {
              const dropped = new Set(
                (payload.doorbells as Array<{ label?: unknown }>).map((item) => bellKey(String(item?.label ?? ""))),
              );
              setLocalBells((prev) => {
                const entriesOf = prev.get(house);
                if (!entriesOf) return prev;
                const next = new Map(prev);
                const left = entriesOf.filter((item) => !dropped.has(bellKey(item.label)));
                if (left.length > 0) next.set(house, left);
                else next.delete(house);
                return next;
              });
            }
          }
        }
      }),
    [uncountVisit],
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
    uncountVisit,
    setType,
    addBells,
    dropBell,
    setBlocked,
  };
}

export type DoorBook = ReturnType<typeof useDoorBook>;

/** Eine Map ohne die Eintraege, auf die `drop` zutrifft - dieselbe, wenn nichts wegfaellt. */
function without<V>(map: Map<string, V>, drop: (value: V, key: string) => boolean): Map<string, V> {
  let changed = false;
  const next = new Map<string, V>();
  for (const [key, value] of map) {
    if (drop(value, key)) changed = true;
    else next.set(key, value);
  }
  return changed ? next : map;
}
