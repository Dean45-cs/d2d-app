"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapView, type UserLocation } from "@/components/map/MapView";
import { badgeMarker } from "@/components/map/markers";
import type { MapEngine, MapLayer } from "@/components/map/types";
import { cssColor } from "@/components/map-colors";
import { plural } from "@/components/ui";
import { IconNavigate } from "@/components/icons";
import { whenLabel } from "@/lib/doors";
import type { LatLng } from "@/lib/geo/area";
import { distanceLabel, durationLabel, meters, planRoute } from "@/lib/geo/route";
import { routeUrl } from "@/lib/map";

export type DoorState = "open" | "retry" | "appointment" | "sale" | "done" | "blocked";

/** Eine Tuer (Hausnummer) auf der Arbeitskarte. */
export interface WorkDoor {
  id: number;
  streetId: number;
  street: string;
  number: string;
  lat: number;
  lng: number;
  state: DoorState;
  units: number;
  /** Erfolglose Versuche am Haus */
  attempts: number;
  bells: number;
  bellsDone: number;
  lastAt: string | null;
  lastBy: string | null;
}

/** Strasse ohne einzelne Hausnummern - dann steht nur die Strasse auf der Karte. */
export interface WorkStreet {
  id: number;
  name: string;
  lat: number;
  lng: number;
  state: "open" | "active" | "done";
  hint: string;
}

export interface HourBucket {
  label: string;
  total: number;
  met: number;
}

interface Props {
  area: LatLng[] | null;
  doors: WorkDoor[];
  streets: WorkStreet[];
  hours: HourBucket[];
}

type Filter = "all" | "todo" | "retry" | "appointment" | "sale" | "finished";

const STATE_LABEL: Record<DoorState, string> = {
  open: "Noch nicht besucht",
  retry: "Nochmal versuchen",
  appointment: "Termin vereinbart",
  sale: "Abschluss",
  done: "Erledigt",
  blocked: "Gesperrt",
};

/** Farben der Tueren - kraeftig fuer "hier lohnt es sich", blass fuer "erledigt". */
function stateColors(): Record<DoorState, string> {
  return {
    open: cssColor("--tint", "#0a84ff"),
    retry: "#ff9f0a",
    appointment: "#bf5af2",
    sale: cssColor("--ok-ink", "#30a14e"),
    done: "#a1a1aa",
    blocked: cssColor("--danger-ink", "#e5484d"),
  };
}

const TODO: DoorState[] = ["open", "retry"];

function matches(state: DoorState, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "todo":
      return TODO.includes(state);
    case "retry":
      return state === "retry";
    case "appointment":
      return state === "appointment";
    case "sale":
      return state === "sale";
    case "finished":
      return state === "done" || state === "blocked";
  }
}

function tourLink(door: WorkDoor): string {
  return `/tour?street=${door.streetId}&house=${encodeURIComponent(door.number)}`;
}

/**
 * Arbeitskarte eines Gebiets - das Werkzeug fuer unterwegs: jede Tuer mit
 * ihrem Stand, der eigene Standort, die naechste offene Tuer und eine
 * Laufroute durch alles, was noch offen ist.
 */
export function TerritoryWorkspace({ area, doors, streets, hours }: Props) {
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [layers, setLayers] = useState<{ base: MapLayer; route: MapLayer; doors: MapLayer } | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [routeOn, setRouteOn] = useState(false);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: doors.length, todo: 0, retry: 0, appointment: 0, sale: 0, finished: 0 };
    for (const door of doors) {
      (Object.keys(result) as Filter[]).forEach((key) => {
        if (key !== "all" && matches(door.state, key)) result[key]++;
      });
    }
    return result;
  }, [doors]);

  const todo = useMemo(() => doors.filter((d) => TODO.includes(d.state)), [doors]);

  // Der Standort zaehlt nur, wenn man in der Naehe des Gebiets ist.
  const nearby = useMemo(() => {
    if (!location || doors.length === 0) return null;
    const closest = Math.min(...doors.map((d) => meters(location.point, [d.lat, d.lng])));
    return closest < 3000 ? location.point : null;
  }, [location, doors]);

  const next = useMemo(() => {
    if (!nearby || todo.length === 0) return null;
    let best = todo[0];
    let bestDistance = Infinity;
    for (const door of todo) {
      const d = meters(nearby, [door.lat, door.lng]);
      if (d < bestDistance) {
        best = door;
        bestDistance = d;
      }
    }
    return { door: best, distance: bestDistance };
  }, [nearby, todo]);

  // Die Route wird einmal geplant, wenn man sie einschaltet - sonst wuerde
  // sie bei jedem Schritt neu sortiert.
  const [route, setRoute] = useState<ReturnType<typeof planRoute<WorkDoor>> | null>(null);
  function toggleRoute() {
    if (routeOn) {
      setRouteOn(false);
      setRoute(null);
      return;
    }
    setRoute(planRoute(todo, nearby));
    setRouteOn(true);
    setFilter("todo");
  }

  /* -------------------------------- Karte -------------------------------- */

  const allPoints = useMemo<LatLng[]>(
    () => [...(area ?? []), ...doors.map((d) => [d.lat, d.lng] as LatLng), ...streets.map((s) => [s.lat, s.lng] as LatLng)],
    [area, doors, streets],
  );

  const fitAll = useCallback(
    (animate: boolean) => engine?.fit(allPoints, { padding: 30, maxZoom: 18, animate }),
    [engine, allPoints],
  );

  useEffect(() => {
    if (!engine) {
      setLayers(null);
      return;
    }
    setLayers({ base: engine.layer(), route: engine.layer(), doors: engine.layer() });
  }, [engine]);

  useEffect(() => {
    if (!layers) return;
    fitAll(false);
    // Nur beim ersten Zeichnen ins Bild holen, nicht bei jedem Filterwechsel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  // Flaeche und Strassen ohne Hausnummern
  useEffect(() => {
    const layer = layers?.base;
    if (!layer) return;
    const tint = cssColor("--tint", "#0a84ff");
    if (area && area.length >= 3) {
      layer.polygon(area, { color: tint, weight: 2.5, fillOpacity: 0.07 });
    }
    const colors = { open: stateColors().open, active: "#ff9f0a", done: stateColors().done };
    for (const street of streets) {
      layer.dot([street.lat, street.lng], {
        color: colors[street.state],
        radius: 8,
        ring: true,
        title: street.name,
        subtitle: street.hint,
        actions: [
          { label: "Hier klingeln", href: `/tour?street=${street.id}`, primary: true },
          { label: "Route", href: routeUrl(street.lat, street.lng, "walk"), external: true },
        ],
      });
    }
    return () => layer.clear();
  }, [layers, area, streets]);

  // Tueren
  useEffect(() => {
    const layer = layers?.doors;
    if (!layer) return;
    const colors = stateColors();
    for (const door of doors) {
      const shown = matches(door.state, filter);
      const lines = [
        door.state === "retry"
          ? `${door.attempts}. Versuch ohne Erfolg – nochmal klingeln`
          : STATE_LABEL[door.state],
        door.bells > 0
          ? `${door.bellsDone} von ${door.bells} Klingeln erledigt`
          : door.units > 1
            ? `${door.units} Wohneinheiten`
            : "",
        door.lastAt ? `Zuletzt: ${door.lastBy ?? "?"} · ${whenLabel(door.lastAt)}` : "",
      ].filter(Boolean);
      layer.dot([door.lat, door.lng], {
        color: colors[door.state],
        radius: shown ? (door.state === "sale" || door.state === "appointment" ? 7 : 6) : 3,
        opacity: shown ? 0.95 : 0.25,
        ring: shown,
        title: `${door.street} ${door.number}`,
        subtitle: lines.join("\n"),
        actions: shown
          ? [
              { label: "Hier klingeln", href: tourLink(door), primary: true },
              { label: "Route", href: routeUrl(door.lat, door.lng, "walk"), external: true },
            ]
          : undefined,
      });
    }
    return () => layer.clear();
  }, [layers, doors, filter]);

  // Laufroute
  useEffect(() => {
    const layer = layers?.route;
    if (!layer || !route || route.stops.length === 0) return;
    const tint = cssColor("--tint", "#0a84ff");
    const path: LatLng[] = [
      ...(nearby && routeOn ? [nearby] : []),
      ...route.stops.map((s) => [s.lat, s.lng] as LatLng),
    ];
    layer.line(path, { color: tint, weight: 4 });
    // Nur die ersten Stationen nummerieren - danach wird es auf der Karte zu voll.
    route.stops.slice(0, 5).forEach((stop, index) => {
      layer.marker([stop.lat, stop.lng], {
        ...badgeMarker(tint, String(index + 1), 22),
        priority: 20 - index,
      });
    });
    return () => layer.clear();
    // Der Standort bewegt nur den Anfang der Linie, die Reihenfolge bleibt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, route]);

  /* ------------------------------- Ansicht ------------------------------- */

  const filters: Array<{ key: Filter; label: string; color?: string }> = [
    { key: "todo", label: "Offen", color: "var(--tint)" },
    { key: "retry", label: "Nochmal", color: "#ff9f0a" },
    { key: "appointment", label: "Termine", color: "#bf5af2" },
    { key: "sale", label: "Abschlüsse", color: "var(--ok-ink)" },
    { key: "finished", label: "Erledigt", color: "#a1a1aa" },
    { key: "all", label: "Alle" },
  ];

  const bestHour = hours.reduce<HourBucket | null>(
    (best, h) => (h.total >= 5 && (!best || h.met / h.total > best.met / best.total) ? h : best),
    null,
  );
  const hourTotal = hours.reduce((sum, h) => sum + h.total, 0);

  return (
    <div className="space-y-3">
      {doors.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Türen filtern">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`map-filter ${filter === f.key ? "is-active" : ""}`}
            >
              {f.color && <span className="h-2 w-2 rounded-full" style={{ background: f.color }} aria-hidden />}
              {f.label}
              <span className="tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--r-md)] border" style={{ borderColor: "var(--line)" }}>
        <MapView
          className="h-[58vh] min-h-[320px] w-full"
          onEngine={setEngine}
          onFit={allPoints.length > 0 ? () => fitAll(true) : undefined}
          autoLocate
          onLocation={setLocation}
        >
          {todo.length > 1 && (
            <div className="pointer-events-none absolute inset-x-2 top-2 z-[500] flex flex-col items-start gap-1.5">
              <button
                type="button"
                className={`map-chip pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] ${
                  routeOn ? "!bg-[var(--tint)] !text-white" : "text-[var(--ink)]"
                }`}
                onClick={toggleRoute}
                aria-pressed={routeOn}
              >
                <IconNavigate className="h-3.5 w-3.5" />
                {routeOn ? "Route beenden" : "Laufroute planen"}
              </button>
              {routeOn && route && (
                <span className="map-chip pointer-events-auto px-3 py-1.5 text-[12px] text-[var(--ink)] tabular-nums">
                  {plural(route.stops.length, "Tür", "Türen")} · {distanceLabel(route.meters)} · ca.&nbsp;
                  {durationLabel(route.minutes)}
                </span>
              )}
            </div>
          )}
        </MapView>
      </div>

      {/* Naechste Tuer: das Wichtigste unterwegs, direkt unter der Karte. */}
      {next ? (
        <div className="rounded-[var(--r-md)] border px-3.5 py-3" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white"
              style={{ background: stateColors()[next.door.state] }}
              aria-hidden
            >
              <IconNavigate className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="muted text-[11.5px] font-semibold">
                Nächste offene Tür · {distanceLabel(next.distance)}
              </p>
              <p className="truncate text-[15px] font-semibold">
                {next.door.street} {next.door.number}
              </p>
              <p className="muted truncate text-[12px]">
                {next.door.state === "retry"
                  ? `${next.door.attempts}. Versuch war erfolglos`
                  : "Noch nicht besucht"}
                {next.door.units > 1 && ` · ${next.door.units} Wohneinheiten`}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={routeUrl(next.door.lat, next.door.lng, "walk")}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm btn-pill"
            >
              Route
            </a>
            <a href={tourLink(next.door)} className="btn btn-primary btn-sm btn-pill">
              Hier klingeln
            </a>
          </div>
        </div>
      ) : todo.length > 0 ? (
        <p className="muted px-1 text-[12px]">
          Mit freigegebenem Standort zeigt die Karte hier die nächste offene Tür – Knopf mit dem
          Pfeil auf der Karte.
        </p>
      ) : doors.length > 0 ? (
        <p className="px-1 text-[13px] font-semibold text-ok">Alle Türen in diesem Gebiet sind erledigt.</p>
      ) : null}

      {routeOn && route && route.stops.length > 0 && (
        <ol className="rounded-[var(--r-md)] border px-3.5 py-2" style={{ borderColor: "var(--line)" }}>
          {route.stops.slice(0, 8).map((stop, index) => (
            <li key={stop.id} className="flex items-center gap-2.5 border-t py-2 text-[13.5px] first:border-t-0" style={{ borderColor: "var(--line)" }}>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--tint)] text-[11px] font-bold text-white">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {stop.street} {stop.number}
              </span>
              <a href={tourLink(stop)} className="text-[12.5px] font-semibold text-tint">
                Klingeln
              </a>
            </li>
          ))}
          {route.stops.length > 8 && (
            <li className="muted border-t py-2 text-[12px]" style={{ borderColor: "var(--line)" }}>
              … und {route.stops.length - 8} weitere – die Nummern auf der Karte zeigen die Reihenfolge.
            </li>
          )}
        </ol>
      )}

      {/* Wann macht hier jemand auf? Aus den bisherigen Besuchen im Gebiet. */}
      {hourTotal >= 15 && (
        <div className="rounded-[var(--r-md)] border px-3.5 py-3" style={{ borderColor: "var(--line)" }}>
          <p className="text-[13px] font-semibold">Wann trifft man hier jemanden an?</p>
          {bestHour && (
            <p className="muted mb-2 text-[12px]">
              Am besten {bestHour.label} Uhr – {Math.round((bestHour.met / bestHour.total) * 100)} % machen auf.
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {hours.map((h) => {
              const rate = h.total ? h.met / h.total : 0;
              return (
                <div key={h.label} className="text-center">
                  <div className="mx-auto flex h-16 w-full max-w-[3.5rem] items-end overflow-hidden rounded-md bg-[var(--card-inset)]">
                    <div
                      className="w-full rounded-md"
                      style={{
                        height: `${Math.max(4, rate * 100)}%`,
                        background: h === bestHour ? "var(--ok-ink)" : "var(--tint)",
                        opacity: h.total ? 1 : 0.2,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] font-semibold tabular-nums">
                    {h.total ? `${Math.round(rate * 100)} %` : "–"}
                  </p>
                  <p className="muted text-[10.5px]">{h.label}</p>
                </div>
              );
            })}
          </div>
          <p className="muted mt-2 text-[10.5px]">Anteil der Türen, an denen jemand geöffnet hat · {hourTotal} Besuche</p>
        </div>
      )}
    </div>
  );
}
