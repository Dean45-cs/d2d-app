"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapView, type UserLocation } from "@/components/map/MapView";
import { badgeMarker } from "@/components/map/markers";
import type { MapEngine, MapLayer } from "@/components/map/types";
import { cssColor, doorStyle, progressColor, type DoorState } from "@/components/map-colors";
import { Cell, plural } from "@/components/ui";
import { IconDoor, IconNavigate } from "@/components/icons";
import { whenLabel } from "@/lib/doors";
import type { LatLng } from "@/lib/geo/area";
import { shapePoints, type Shape } from "@/lib/geo/shape";
import { distanceLabel, durationLabel, meters, planRoute } from "@/lib/geo/route";
import { routeUrl } from "@/lib/map";

export type { DoorState };

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
  area: Shape | null;
  doors: WorkDoor[];
  streets: WorkStreet[];
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
export function TerritoryWorkspace({ area, doors, streets }: Props) {
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
    () => [
      ...(area ? shapePoints(area) : []),
      ...doors.map((d) => [d.lat, d.lng] as LatLng),
      ...streets.map((s) => [s.lat, s.lng] as LatLng),
    ],
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
    const outline = cssColor("--accent", "#1f9d4c");
    for (const polygon of area ?? []) {
      layer.polygon(polygon, { color: outline, weight: 2.5, fillOpacity: 0.06 });
    }
    for (const street of streets) {
      layer.dot([street.lat, street.lng], {
        color: progressColor(street.state),
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
    for (const door of doors) {
      const shown = matches(door.state, filter);
      const style = doorStyle(door.state);
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
        color: style.color,
        radius: shown ? style.radius : 3,
        opacity: shown ? 1 : 0.25,
        ring: shown,
        ringColor: style.ringColor,
        ringWidth: style.ringWidth,
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
    const tint = cssColor("--ink", "#0b0b0d");
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

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "todo", label: "Offen" },
    { key: "retry", label: "Nochmal" },
    { key: "appointment", label: "Termine" },
    { key: "sale", label: "Abschlüsse" },
    { key: "finished", label: "Erledigt" },
    { key: "all", label: "Alle" },
  ];

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl">
        <MapView
          className="h-[52vh] min-h-80 w-full lg:h-[calc(100dvh-260px)]"
          onEngine={setEngine}
          onFit={allPoints.length > 0 ? () => fitAll(true) : undefined}
          autoLocate
          onLocation={setLocation}
        >
          <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] space-y-2">
            {doors.length > 0 && (
              <div className="chips pointer-events-auto px-2" role="group" aria-label="Türen filtern">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className="map-chip"
                  >
                    {f.label}
                    <span className="font-normal text-ink-2">{counts[f.key]}</span>
                  </button>
                ))}
              </div>
            )}
            {todo.length > 1 && (
              <div className="flex flex-wrap gap-2 px-2">
                <button
                  type="button"
                  className="map-chip pointer-events-auto"
                  onClick={toggleRoute}
                  aria-pressed={routeOn}
                >
                  <IconNavigate className="h-4 w-4" />
                  {routeOn ? "Route beenden" : "Laufroute"}
                </button>
                {routeOn && route && (
                  <span className="map-chip pointer-events-auto">
                    {plural(route.stops.length, "Tür", "Türen")} · {distanceLabel(route.meters)} · ca.{" "}
                    {durationLabel(route.minutes)}
                  </span>
                )}
              </div>
            )}
          </div>
        </MapView>
      </div>

      {/* Naechste Tuer: das Wichtigste unterwegs, direkt unter der Karte. */}
      {next && (
        <ul className="list list-icons">
          <li className="cell pr-2">
            <span className="glyph glyph-round">
              <IconDoor className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body">
                {next.door.street} {next.door.number}
              </span>
              <span className="block truncate text-footnote text-muted">
                Nächste offene Tür · {distanceLabel(next.distance)}
                {next.door.state === "retry" && ` · ${next.door.attempts}. Versuch`}
              </span>
            </span>
            <a
              href={routeUrl(next.door.lat, next.door.lng, "walk")}
              target="_blank"
              rel="noreferrer"
              className="icon-btn icon-btn-fill"
              aria-label="Route zur nächsten Tür"
            >
              <IconNavigate className="h-5 w-5" />
            </a>
            <a href={tourLink(next.door)} className="btn btn-primary btn-sm">
              Klingeln
            </a>
          </li>
        </ul>
      )}

      {routeOn && route && route.stops.length > 0 && (
        <ol className="list list-icons">
          {route.stops.slice(0, 8).map((stop, index) => (
            <li key={stop.id}>
              <Cell
                href={tourLink(stop)}
                icon={<span className="glyph glyph-round kpi text-subhead">{index + 1}</span>}
                title={`${stop.street} ${stop.number}`}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
