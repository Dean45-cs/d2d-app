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
  | "grid"
  | "feed"
  | "trophy";

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

const MORE: NavItem = { href: MORE_HREF, label: "Mehr", short: "Mehr", icon: "grid", group: "" };

/** Reiter nach Adresse auswaehlen, der Rest landet unter "Mehr". */
function split(items: NavItem[], tabHrefs: string[]): Navigation {
  const tabs = tabHrefs.map((href) => items.find((item) => item.href === href)!);
  const more = items.filter((item) => !tabHrefs.includes(item.href));
  return { items, tabs: more.length > 0 ? [...tabs, MORE] : tabs, more };
}

/**
 * Bewusst ohne "use client": die Navigation wird in einer Server-Komponente
 * zusammengestellt und als Prop an die Client-Leisten uebergeben.
 */
export function navigation(role: Role): Navigation {
  if (role === "LEADER") {
    return split(
      [
        { href: "/start", label: "Übersicht", short: "Übersicht", icon: "home", group: "Vertrieb" },
        { href: "/gebiete", label: "Gebiete", short: "Gebiete", icon: "map", group: "Vertrieb" },
        { href: "/tour", label: "Klinken", short: "Klinken", icon: "door", group: "Vertrieb" },
        { href: "/termine", label: "Termine", short: "Termine", icon: "calendar", group: "Vertrieb" },
        { href: "/feed", label: "Feed", short: "Feed", icon: "feed", group: "Community" },
        { href: "/vergleich", label: "Vergleich", short: "Vergleich", icon: "trophy", group: "Community" },
        { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt", group: "Analyse" },
        { href: "/auswertung", label: "Auswertung", short: "Zahlen", icon: "chart", group: "Analyse" },
        { href: "/team", label: "Team", short: "Team", icon: "users", group: "Verwaltung" },
        { href: "/einstellungen", label: "Einstellungen", short: "Einstellungen", icon: "cog", group: "Verwaltung" },
      ],
      ["/start", "/gebiete", "/tour", "/termine"],
    );
  }
  // Im Aussendienst stehen Tuer, Feed und Vergleich vorn: das ist, was man
  // unterwegs zwischen zwei Haeusern aufmacht. Das Gebiet waehlt man in
  // "Klinken" selbst - die Gebietsliste rutscht unter "Mehr".
  return split(
    [
      { href: "/tour", label: "Klinken", short: "Klinken", icon: "door", group: "Vertrieb" },
      { href: "/termine", label: "Meine Termine", short: "Termine", icon: "calendar", group: "Vertrieb" },
      { href: "/gebiete", label: "Meine Gebiete", short: "Gebiete", icon: "map", group: "Vertrieb" },
      { href: "/feed", label: "Feed", short: "Feed", icon: "feed", group: "Community" },
      { href: "/vergleich", label: "Vergleich", short: "Vergleich", icon: "trophy", group: "Community" },
      { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt", group: "Analyse" },
      { href: "/auswertung", label: "Meine Zahlen", short: "Zahlen", icon: "chart", group: "Analyse" },
    ],
    ["/tour", "/feed", "/vergleich", "/termine"],
  );
}
