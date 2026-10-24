import type { PermissionSet } from "./permission-definitions";
import type { Role } from "./types";

/*
 * Informationsarchitektur der App - an einer Stelle.
 *
 * Fuenf Ziele, nach Rolle und Rechten zugeschnitten:
 *   Uebersicht (Zahlen, Termine, Team)  - nur mit "reports.team"
 *   Klinken    (die Tuer; Termine fuer den Vertrieb)
 *   Karte      (Gebiete und Energiepreise als zwei Ansichten)
 *   Team       (Feed, Rangliste, Erfolge, Profile der Kollegen)
 *   Profil     (Konto, Benachrichtigungen, Verwaltung)
 *
 * Bewusst ohne "use client": die Navigation entsteht auf dem Server und
 * geht als Prop an die Leisten.
 */

export type IconName =
  | "chart"
  | "door"
  | "map"
  | "team"
  | "profile"
  | "calendar"
  | "contacts"
  | "bolt"
  | "comment"
  | "trophy"
  | "sparkles"
  | "users"
  | "invite"
  | "shield"
  | "list"
  | "cog";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Weitere Pfade, die zu diesem Punkt gehoeren (Reiter-Markierung). */
  match?: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface Navigation {
  /** Reiterleiste auf dem Handy - hoechstens fuenf. */
  tabs: NavItem[];
  /** Seitenleiste auf iPad und Rechner, in Abschnitten. */
  sidebar: NavSection[];
  /** Verwaltung - im Profil und im Abschnitt "Verwaltung" der Seitenleiste. */
  admin: NavItem[];
  /** Alles Erreichbare, flach. */
  items: NavItem[];
}

export function navigation(role: Role, rights: PermissionSet, userId?: number): Navigation {
  const reports = rights["reports.team"];
  // Eigenes Profil und eigene Visitenkarte gehoeren zum Reiter "Profil" - fremde Profile zum Team.
  const me = userId ? [`/profil/${userId}`, "/profil/visitenkarte"] : ["/profil/visitenkarte"];

  const start: NavItem = {
    href: "/start",
    label: reports ? "Übersicht" : "Meine Zahlen",
    icon: "chart",
    match: reports ? ["/termine"] : [],
  };
  const tour: NavItem = { href: "/tour", label: "Klinken", icon: "door", match: reports ? [] : ["/termine"] };
  const termine: NavItem = {
    href: "/termine",
    label: rights["appointments.team"] ? "Termine" : "Meine Termine",
    icon: "calendar",
  };
  // Kundenliste: wer hinter den Abschluessen steht, fuer den Anruf nach Vertragsende.
  const kunden: NavItem[] = rights["customers.manage"] ? [{ href: "/kunden", label: "Kunden", icon: "contacts" }] : [];
  const gebiete: NavItem = {
    href: "/gebiete",
    label: rights["territories.view_all"] ? "Gebiete" : "Meine Gebiete",
    icon: "map",
  };
  const preise: NavItem = { href: "/karte", label: "Preise", icon: "bolt" };
  const feed: NavItem = { href: "/team", label: "Feed", icon: "comment", match: ["/profil/"] };
  const rangliste: NavItem = { href: "/team/rangliste", label: "Rangliste", icon: "trophy" };
  const erfolge: NavItem = { href: "/team/erfolge", label: "Erfolge", icon: "sparkles" };

  const admin: NavItem[] = [
    ...(rights["team.manage"] || rights["structure.manage"] || rights["team.roles"]
      ? [{ href: "/einstellungen/mitglieder", label: "Mitglieder", icon: "users" as const }]
      : []),
    ...(rights["invitations.create"] || rights["invitations.approve"]
      ? [{ href: "/einstellungen/einladungen", label: "Einladungen", icon: "invite" as const }]
      : []),
    ...(rights["permissions.manage"]
      ? [{ href: "/einstellungen/rechte", label: "Rechte", icon: "shield" as const }]
      : []),
    ...(rights["settings.reasons"]
      ? [{ href: "/einstellungen/gruende", label: "Ablehnungsgründe", icon: "list" as const }]
      : []),
    ...(rights["energy.reference"] || rights["energy.manage"] || rights["energy.refresh"]
      ? [{ href: "/einstellungen/energie", label: "Energie & Tarif", icon: "cog" as const }]
      : []),
  ];

  const tabs: NavItem[] = [
    ...(reports ? [start] : []),
    tour,
    { href: "/gebiete", label: "Karte", icon: "map", match: ["/karte"] },
    { href: "/team", label: "Team", icon: "team", match: ["/profil/"] },
    // Ohne Teamrecht fuehrt "Meine Zahlen" aus dem Profil - dann bleibt dieser Reiter markiert.
    {
      href: "/profil",
      label: "Profil",
      icon: "profile",
      match: ["/einstellungen", "/kunden", ...me, ...(reports ? [] : ["/start"])],
    },
  ];

  const sidebar: NavSection[] = [
    { items: [start, tour, termine, ...kunden] },
    { title: "Karte", items: [gebiete, preise] },
    { title: "Team", items: [feed, rangliste, erfolge] },
    ...(admin.length > 0 ? [{ title: "Verwaltung", items: admin }] : []),
  ];

  return {
    tabs,
    sidebar,
    admin,
    items: [start, tour, termine, ...kunden, gebiete, preise, feed, rangliste, erfolge, ...admin],
  };
}

/** Passt der Pfad zu einem Punkt? Genauer Treffer oder Unterseite. */
function covers(pathname: string, prefix: string): boolean {
  if (prefix.endsWith("/")) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Der aktive Punkt einer Liste: der genaueste Treffer gewinnt - so ist auf
 * "/team/rangliste" die Rangliste markiert und nicht zusaetzlich der Feed,
 * und das eigene Profil gehoert zum Reiter "Profil", fremde zum Team.
 */
export function activeHref(items: NavItem[], pathname: string): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of items) {
    for (const prefix of [item.href, ...(item.match ?? [])]) {
      if (!covers(pathname, prefix)) continue;
      const length = prefix.length + (prefix === item.href ? 0.5 : 0);
      if (!best || length > best.length) best = { href: item.href, length };
    }
  }
  return best?.href ?? null;
}
