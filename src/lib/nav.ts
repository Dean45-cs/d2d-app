import type { Role } from "./types";

export type IconName =
  | "home"
  | "door"
  | "map"
  | "bolt"
  | "chart"
  | "users"
  | "doc"
  | "cog";

export interface NavItem {
  href: string;
  label: string;
  /** Kurzform fuer die Leiste am unteren Bildschirmrand */
  short: string;
  icon: IconName;
}

/**
 * Bewusst ohne "use client": die Navigation wird in einer Server-Komponente
 * zusammengestellt und als Prop an die Client-Leisten uebergeben.
 */
export function navItems(role: Role): NavItem[] {
  if (role === "LEADER") {
    return [
      { href: "/start", label: "Übersicht", short: "Start", icon: "home" },
      { href: "/gebiete", label: "Gebiete", short: "Gebiete", icon: "map" },
      { href: "/tour", label: "Klinken", short: "Klinken", icon: "door" },
      { href: "/auftraege", label: "Aufträge", short: "Auftrag", icon: "doc" },
      { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt" },
      { href: "/auswertung", label: "Auswertung", short: "Zahlen", icon: "chart" },
      { href: "/team", label: "Team", short: "Team", icon: "users" },
      { href: "/einstellungen", label: "Einstellungen", short: "Mehr", icon: "cog" },
    ];
  }
  return [
    { href: "/tour", label: "Klinken", short: "Klinken", icon: "door" },
    { href: "/auftraege", label: "Aufträge & Termine", short: "Auftrag", icon: "doc" },
    { href: "/gebiete", label: "Meine Gebiete", short: "Gebiete", icon: "map" },
    { href: "/karte", label: "Energiekarte", short: "Karte", icon: "bolt" },
    { href: "/auswertung", label: "Meine Zahlen", short: "Zahlen", icon: "chart" },
  ];
}
