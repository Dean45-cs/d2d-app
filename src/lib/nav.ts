import type { PermissionSet } from "./permission-definitions";
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
  | "trophy"
  | "target"
  | "invite"
  | "shield";

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
  const tabs = items.filter((item) => tabHrefs.includes(item.href)).sort((a, b) => tabHrefs.indexOf(a.href) - tabHrefs.indexOf(b.href));
  const more = items.filter((item) => !tabHrefs.includes(item.href));
  return { items, tabs: more.length > 0 ? [...tabs, MORE] : tabs, more };
}

/**
 * Bewusst ohne "use client": die Navigation wird in einer Server-Komponente
 * zusammengestellt und als Prop an die Client-Leisten uebergeben.
 */
export function navigation(role: Role, rights: PermissionSet): Navigation {
  const items: NavItem[] = [
    ...(rights["reports.team"] ? [{ href: "/start", label: "Übersicht", short: "Übersicht", icon: "home" as const, group: "Vertrieb" }] : []),
    { href: "/gebiete", label: rights["territories.view_all"] ? "Gebiete" : "Meine Gebiete", short: "Gebiete", icon: "map", group: "Vertrieb" },
    { href: "/tour", label: "Klinken", short: "Klinken", icon: "door", group: "Vertrieb" },
    { href: "/termine", label: rights["appointments.team"] ? "Termine" : "Meine Termine", short: "Termine", icon: "calendar", group: "Vertrieb" },
    { href: "/feed", label: "Feed", short: "Feed", icon: "feed", group: "Community" },
    { href: "/vergleich", label: "Vergleich", short: "Vergleich", icon: "trophy", group: "Community" },
    { href: "/level", label: "Level & Erfolge", short: "Level", icon: "target", group: "Community" },
    { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt", group: "Analyse" },
    { href: "/auswertung", label: rights["reports.team"] ? "Auswertung" : "Meine Zahlen", short: "Zahlen", icon: "chart", group: "Analyse" },
    ...((rights["team.manage"] || rights["structure.manage"] || rights["team.roles"]) ? [{ href: "/team", label: "Team", short: "Team", icon: "users" as const, group: "Verwaltung" }] : []),
    { href: "/einladungen", label: "Einladungen", short: "Einladen", icon: "invite", group: "Verwaltung" },
    ...(rights["permissions.manage"] ? [{ href: "/berechtigungen", label: "Berechtigungen", short: "Rechte", icon: "shield" as const, group: "Verwaltung" }] : []),
    ...((rights["settings.reasons"] || rights["energy.reference"] || rights["energy.manage"] || rights["energy.refresh"]) ? [{ href: "/einstellungen", label: "Einstellungen", short: "Einstellungen", icon: "cog" as const, group: "Verwaltung" }] : []),
  ];
  return split(items, role === "LEADER" ? ["/start", "/gebiete", "/tour", "/termine"] : ["/tour", "/feed", "/vergleich", "/termine"]);
}
