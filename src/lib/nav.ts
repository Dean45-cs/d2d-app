import type { Role } from "./types";

export type IconName =
  | "home"
  | "door"
  | "map"
  | "bolt"
  | "chart"
  | "users"
  | "calendar"
  | "cog"
  | "grid";

export interface NavItem {
  href: string;
  label: string;
  /** Kurzform fuer die Leiste am unteren Bildschirmrand */
  short: string;
  icon: IconName;
  /** Ueberschrift der Gruppe in der Seitenleiste */
  group: string;
}

export interface Navigation {
  /** Alles, gruppiert - fuer die Seitenleiste am Rechner. */
  items: NavItem[];
  /** Hoechstens fuenf Reiter - mehr passen auf dem Handy nicht sauber nebeneinander. */
  tabs: NavItem[];
  /** Was nicht in die Reiter passt, steht unter "Mehr". */
  more: NavItem[];
}

export const MORE_HREF = "/mehr";

/**
 * Bewusst ohne "use client": die Navigation wird in einer Server-Komponente
 * zusammengestellt und als Prop an die Client-Leisten uebergeben.
 */
export function navigation(role: Role): Navigation {
  if (role === "LEADER") {
    const items: NavItem[] = [
      { href: "/start", label: "Übersicht", short: "Übersicht", icon: "home", group: "Vertrieb" },
      { href: "/gebiete", label: "Gebiete", short: "Gebiete", icon: "map", group: "Vertrieb" },
      { href: "/tour", label: "Klinken", short: "Klinken", icon: "door", group: "Vertrieb" },
      { href: "/termine", label: "Termine", short: "Termine", icon: "calendar", group: "Vertrieb" },
      { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt", group: "Analyse" },
      { href: "/auswertung", label: "Auswertung", short: "Zahlen", icon: "chart", group: "Analyse" },
      { href: "/team", label: "Team", short: "Team", icon: "users", group: "Verwaltung" },
      { href: "/einstellungen", label: "Einstellungen", short: "Einstellungen", icon: "cog", group: "Verwaltung" },
    ];
    return {
      items,
      tabs: [
        ...items.slice(0, 4),
        { href: MORE_HREF, label: "Mehr", short: "Mehr", icon: "grid", group: "" },
      ],
      more: items.slice(4),
    };
  }
  const items: NavItem[] = [
    { href: "/tour", label: "Klinken", short: "Klinken", icon: "door", group: "Vertrieb" },
    { href: "/termine", label: "Meine Termine", short: "Termine", icon: "calendar", group: "Vertrieb" },
    { href: "/gebiete", label: "Meine Gebiete", short: "Gebiete", icon: "map", group: "Vertrieb" },
    { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt", group: "Analyse" },
    { href: "/auswertung", label: "Meine Zahlen", short: "Zahlen", icon: "chart", group: "Analyse" },
  ];
  return { items, tabs: items, more: [] };
}
