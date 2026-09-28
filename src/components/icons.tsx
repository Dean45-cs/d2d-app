type IconProps = { className?: string };

const base = "h-5 w-5 shrink-0";

export function IconDoor({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21h16" /><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" /><circle cx="14.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function IconMap({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 4-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 7 9 4Z" /><path d="M9 4v13" /><path d="M15 7v12.5" />
    </svg>
  );
}
export function IconBolt({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  );
}
export function IconChart({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="7" rx="1" /><rect x="12.5" y="7" width="3" height="11" rx="1" /><rect x="18" y="13" width="3" height="5" rx="1" />
    </svg>
  );
}
export function IconUsers({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.3" /><path d="M17.8 14.4A6.2 6.2 0 0 1 21.6 20" />
    </svg>
  );
}
export function IconHome({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 10.5 9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" />
    </svg>
  );
}
export function IconCog({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.4 6.4 4.7 4.7M19.3 19.3l-1.7-1.7M17.6 6.4l1.7-1.7M4.7 19.3l1.7-1.7" />
    </svg>
  );
}
export function IconLogout({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" />
    </svg>
  );
}
export function IconCalendar({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M3 10h18" /><path d="M8 14h3" />
    </svg>
  );
}
export function IconPlus({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function IconCheck({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}
export function IconArrowRight({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13" /><path d="m13 6 6 6-6 6" />
    </svg>
  );
}

/* ==========================================================================
   Symbole der Tuer-Erfassung und der Gebietsplanung.

   Alle im selben Raster gezeichnet: 24er-Feld, Strichstaerke 1.8, runde
   Enden. Dadurch stehen sie nebeneinander ruhig - anders als Emoji, die
   auf jedem Geraet anders aussehen.
   ========================================================================== */

export function IconBell({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconBuilding({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21" /><path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21" /><path d="M3 21h18" />
      <path d="M7.5 8h1.5M11 8h1.5M7.5 12h1.5M11 12h1.5M7.5 16h1.5M11 16h1.5M18 14h-1M18 17.5h-1" />
    </svg>
  );
}

export function IconPerson({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.4" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

export function IconBan({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><path d="m6.2 6.2 11.6 11.6" />
    </svg>
  );
}

export function IconClock({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconPhone({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 3.5 9.8 8l-2 1.7a12.5 12.5 0 0 0 6.5 6.5l1.7-2 4.5 2.3-1 3.2a2 2 0 0 1-2.2 1.3C11 20.1 3.9 13 3 7.7A2 2 0 0 1 4.3 5.5l3.2-2Z" />
    </svg>
  );
}

export function IconNavigate({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 3.5 3.8 10.1a.6.6 0 0 0 .05 1.12l7.03 2.4 2.4 7.03a.6.6 0 0 0 1.12.05L20.5 3.5Z" />
    </svg>
  );
}

export function IconCrosshair({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" /><path d="M12 2v2.8M12 19.2V22M2 12h2.8M19.2 12H22" />
    </svg>
  );
}

export function IconSearch({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function IconPin({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11Z" /><circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

/** Umkreis abstecken: Mittelpunkt mit Radius. */
export function IconCircleArea({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /><path d="M12 12h8" />
    </svg>
  );
}

/** Flaeche zeichnen: Vieleck mit Eckpunkten. */
export function IconPolygonArea({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 7 7-3.5L20 8l-2.5 9L9 20 5 7Z" />
      <circle cx="5" cy="7" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="3.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8" r="1.6" fill="currentColor" stroke="none" /><circle cx="9" cy="20" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSplit({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h6a2 2 0 0 1 2 2v10a2 2 0 0 0 2 2h6" /><path d="M20 5h-6a2 2 0 0 0-2 2" /><path d="m17 2 3 3-3 3M17 16l3 3-3 3" />
    </svg>
  );
}

export function IconList({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconChevronRight({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9.5 5 7 7-7 7" />
    </svg>
  );
}

export function IconChevronLeft({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

export function IconChevronDown({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 9.5 7 7 7-7" />
    </svg>
  );
}

export function IconX({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconMinus({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconPencil({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m14.5 6.5 3 3" />
    </svg>
  );
}

export function IconUndo({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h11a5 5 0 0 1 0 10h-5" /><path d="m8 5-4 4 4 4" />
    </svg>
  );
}

export function IconOffline({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8.5a15.5 15.5 0 0 1 5-3.1M12 4.5c3.4 0 6.6 1.3 9.5 3.9" /><path d="M6 12.2a10 10 0 0 1 3-1.8M15.2 10.6a10 10 0 0 1 2.8 1.6" /><path d="M9.4 15.8a5 5 0 0 1 5.2 0" /><circle cx="12" cy="19.3" r="1.2" fill="currentColor" stroke="none" /><path d="m3 3 18 18" />
    </svg>
  );
}

export function IconCloudUp({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 18.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.2A3.8 3.8 0 0 1 18 18.5h-1" /><path d="M12 21v-8" /><path d="m9 15.5 3-3 3 3" />
    </svg>
  );
}

export function IconInfo({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSignature({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c3.5 0 4-11 7-11s1.8 9 4.5 9c1.6 0 2-2.5 3.5-2.5 1 0 1.6 1 3 1" /><path d="M3 21h18" />
    </svg>
  );
}

export function IconTarget({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Kartenebenen - wechselt zwischen Karte und Satellit. */
export function IconLayers({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

/** Rahmen mit Pfeilen - holt den ganzen Inhalt zurueck ins Bild. */
export function IconFit({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5a1 1 0 0 1 1-1h4" /><path d="M15 4h4a1 1 0 0 1 1 1v4" /><path d="M20 15v4a1 1 0 0 1-1 1h-4" /><path d="M9 20H5a1 1 0 0 1-1-1v-4" />
    </svg>
  );
}

export function IconChevronUp({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 14.5 7-7 7 7" />
    </svg>
  );
}

/** Drei Punkte - oeffnet ein Menue mit weiteren Aktionen. */
export function IconMore({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" />
    </svg>
  );
}

/** Vier Kacheln - der Reiter "Mehr" am unteren Rand. */
export function IconGrid({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </svg>
  );
}

/** Pfeil aus dem Kasten - der Verweis fuehrt aus der App hinaus. */
export function IconExternal({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function IconKey({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7" /><path d="m16.5 6.5 2.5 2.5" /><path d="m14 9 2 2" />
    </svg>
  );
}

export function IconShield({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconImage({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m20.5 15.5-4.5-4.5-8.5 8.5" />
    </svg>
  );
}

export function IconRefresh({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" />
    </svg>
  );
}

export function IconEye({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4" /><path d="M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 5.4-1.7" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" />
    </svg>
  );
}

export function IconUserPlus({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="3.5" /><path d="M3.5 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6" /><path d="M16 11h6" />
    </svg>
  );
}

export function IconMail({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

export function IconTrash({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" /><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" /><path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Abgeschlossener Verkauf - Haekchen im Kreis. */
export function IconCheckCircle({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.2 9.5" />
    </svg>
  );
}

/** Sprechblase - ein Gespraech ohne Abschluss. */
export function IconChat({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 18.5 3.5 21l.7-4A8 8 0 1 1 7.5 19.3" /><path d="M8.5 11h7M8.5 14h4" />
    </svg>
  );
}

/* ==========================================================================
   Feed, Vergleich und Profil.
   ========================================================================== */

/** Feed - gestapelte Beitraege. */
export function IconFeed({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3.5" width="16" height="7" rx="2" /><rect x="4" y="13.5" width="16" height="7" rx="2" /><path d="M7.5 7h5M7.5 17h8" />
    </svg>
  );
}

/** Pokal - die Rangliste. */
export function IconTrophy({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" /><path d="M7.5 6H4.5v1.5A3 3 0 0 0 7.6 10.5" /><path d="M16.5 6h3v1.5a3 3 0 0 1-3.1 3" /><path d="M12 13.5V17" /><path d="M8.5 20.5h7" />
    </svg>
  );
}

/** Herz - "Gefällt mir". Gefuellt, sobald man es gesetzt hat. */
export function IconHeart({ className = base, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
    </svg>
  );
}

/** Sprechblase ohne Zeilen - Kommentare. */
export function IconComment({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12a7.5 7.5 0 1 1 3.4 6.3L4 19.5l1.2-3.6A7.4 7.4 0 0 1 4.5 12Z" />
    </svg>
  );
}

/** Papierflieger - absenden. */
export function IconSend({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 3.5 10 14" /><path d="m20.5 3.5-6.5 17-4-6.5-6.5-4 17-6.5Z" />
    </svg>
  );
}

/** Glocke mit Haken - abonniert, Push kommt. */
export function IconBellCheck({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /><path d="m9.5 9.5 1.8 1.8 3.2-3.3" />
    </svg>
  );
}

/** Flamme - Serie von Tagen mit Abschluss. */
export function IconFlame({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-11-2.5 2-4.5 4.5-4.5 7.5-1-.5-1.8-1.6-2-2.8C6.3 9.8 5.5 12 5.5 14.5A6.5 6.5 0 0 0 12 21Z" />
    </svg>
  );
}

/** Pfeil nach oben - Platz gewonnen. */
export function IconTrendUp({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5" /><path d="m6 11 6-6 6 6" />
    </svg>
  );
}

/** Pfeil nach unten - Platz verloren. */
export function IconTrendDown({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" /><path d="m6 13 6 6 6-6" />
    </svg>
  );
}
