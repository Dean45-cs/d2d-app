import type { ReactNode } from "react";

/*
 * Die Zeichen der App - eine Familie im Geist von SF Symbols: 24er-Raster,
 * Strichstaerke 1.75, runde Enden und Ecken, gleiche optische Groesse.
 * Fuer den aktiven Reiter gibt es gefuellte Varianten (…Fill).
 * Alle Zeichen sind dekorativ (aria-hidden); die Bedeutung traegt immer
 * die Beschriftung des Knopfs.
 */

type IconProps = { className?: string };

const BASE = "h-5 w-5 shrink-0";

function Line({ className = BASE, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function Solid({ className = BASE, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/* ------------------------------ Reiter -------------------------------- */

export function IconDoor(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5.5 21V4.75A1.75 1.75 0 0 1 7.25 3h9.5a1.75 1.75 0 0 1 1.75 1.75V21" />
      <path d="M3.5 21h17" />
      <circle cx="15" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
    </Line>
  );
}
export function IconDoorFill(props: IconProps) {
  return (
    <Solid {...props}>
      <path
        fillRule="evenodd"
        d="M7.25 2.25A2.5 2.5 0 0 0 4.75 4.75v15.5H3.5a.75.75 0 0 0 0 1.5h17a.75.75 0 0 0 0-1.5h-1.25V4.75a2.5 2.5 0 0 0-2.5-2.5h-9.5ZM15 13.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
      />
    </Solid>
  );
}

export function IconMap(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m9 4.5-5.5 2.1v13.1L9 17.6l6 2.4 5.5-2.1V4.8L15 6.9 9 4.5Z" />
      <path d="M9 4.5v13.1" />
      <path d="M15 6.9V20" />
    </Line>
  );
}
export function IconMapFill(props: IconProps) {
  return (
    <Solid {...props}>
      <path d="M8.25 3.55v13.6l-4.48 1.71A.95.95 0 0 1 2.5 17.97V6.6c0-.39.24-.75.61-.89L8.25 3.55Z" />
      <path d="M9.75 3.6l4.5 1.8v14.95l-4.5-1.8V3.6Z" />
      <path d="M15.75 5.4l4.48-1.72c.62-.24 1.27.22 1.27.89V17.4c0 .39-.24.75-.61.89l-5.14 1.97V5.4Z" />
    </Solid>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5c.55-3 2.95-5 6-5s5.45 2 6 5" />
      <path d="M15.75 4.9a3.25 3.25 0 0 1 0 6.2" />
      <path d="M17.75 14.6c1.75.75 2.9 2.4 3.25 4.9" />
    </Line>
  );
}
export function IconUsersFill(props: IconProps) {
  return (
    <Solid {...props}>
      <circle cx="9" cy="7.75" r="3.75" />
      <path d="M2.27 19.33C2.86 15.86 5.6 13.75 9 13.75s6.14 2.11 6.73 5.58A1 1 0 0 1 14.75 20.5H3.25a1 1 0 0 1-.98-1.17Z" />
      <path d="M15.6 4.1a3.9 3.9 0 0 1 0 7.55 5.4 5.4 0 0 0 1.15-3.8 5.4 5.4 0 0 0-1.15-3.75Z" />
      <path d="M17.66 13.9c2.36.8 3.87 2.86 4.24 5.43a1 1 0 0 1-.99 1.17h-3.36a6.9 6.9 0 0 0-.01-.54 8.2 8.2 0 0 0-2.43-5.82c.87-.16 1.7-.24 2.55-.24Z" />
    </Solid>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="4" y="12.5" width="4" height="7.5" rx="1.25" />
      <rect x="10" y="7.5" width="4" height="12.5" rx="1.25" />
      <rect x="16" y="4" width="4" height="16" rx="1.25" />
    </Line>
  );
}
export function IconChartFill(props: IconProps) {
  return (
    <Solid {...props}>
      <rect x="3.25" y="11.75" width="5.5" height="9" rx="1.75" />
      <rect x="9.25" y="6.75" width="5.5" height="14" rx="1.75" />
      <rect x="15.25" y="3.25" width="5.5" height="17.5" rx="1.75" />
    </Solid>
  );
}

export function IconPersonCircle(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.3 18.3c1.3-1.9 3.3-3 5.7-3s4.4 1.1 5.7 3" />
    </Line>
  );
}

/* --------------------------- Allgemein ------------------------------- */

export function IconHome(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m3.5 10.5 8.5-7 8.5 7" />
      <path d="M5.75 9v10.25c0 .41.34.75.75.75H10v-5.25h4V20h3.5c.41 0 .75-.34.75-.75V9" />
    </Line>
  );
}
export function IconBuilding(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4.5 21V5a1.5 1.5 0 0 1 1.5-1.5h7.5A1.5 1.5 0 0 1 15 5v16" />
      <path d="M15 9.5h3a1.5 1.5 0 0 1 1.5 1.5v10" />
      <path d="M3 21h18" />
      <path d="M8 7.5h3M8 11h3M8 14.5h3" />
    </Line>
  );
}
export function IconBolt(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M13.25 2.75 5 13.25h6.25l-.75 8 8.25-10.5H12.5l.75-8Z" />
    </Line>
  );
}
export function IconCog(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.4a7.7 7.7 0 0 0 0-2.8l1.9-1.5-1.9-3.3-2.3.9a7.4 7.4 0 0 0-2.4-1.4L14.3 3h-3.8l-.4 2.3a7.4 7.4 0 0 0-2.4 1.4l-2.3-.9-1.9 3.3 1.9 1.5a7.7 7.7 0 0 0 0 2.8l-1.9 1.5 1.9 3.3 2.3-.9a7.4 7.4 0 0 0 2.4 1.4l.4 2.3h3.8l.4-2.3a7.4 7.4 0 0 0 2.4-1.4l2.3.9 1.9-3.3-1.9-1.5Z" />
    </Line>
  );
}
export function IconLogout(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M14 4h3.25A2.75 2.75 0 0 1 20 6.75v10.5A2.75 2.75 0 0 1 17.25 20H14" />
      <path d="m9.5 8-4 4 4 4" />
      <path d="M5.5 12H15" />
    </Line>
  );
}
export function IconCalendar(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </Line>
  );
}
export function IconHistory(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M3.75 12a8.25 8.25 0 1 0 2.4-5.82" />
      <path d="M3.5 4.5v3.5H7" />
      <path d="M12 8v4l2.75 1.75" />
    </Line>
  );
}
export function IconPlus(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 5v14M5 12h14" />
    </Line>
  );
}
export function IconMinus(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5 12h14" />
    </Line>
  );
}
export function IconCheck(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m4.75 12.75 4.5 4.5L19.25 6.75" strokeWidth={2.25} />
    </Line>
  );
}
export function IconX(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" strokeWidth={2} />
    </Line>
  );
}
export function IconChevronRight(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" strokeWidth={2.25} />
    </Line>
  );
}
export function IconChevronLeft(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" strokeWidth={2.25} />
    </Line>
  );
}
export function IconChevronDown(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m5.5 9.5 6.5 6.5 6.5-6.5" strokeWidth={2.25} />
    </Line>
  );
}
export function IconChevronUp(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m5.5 14.5 6.5-6.5 6.5 6.5" strokeWidth={2.25} />
    </Line>
  );
}
export function IconMore(props: IconProps) {
  return (
    <Solid {...props}>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </Solid>
  );
}
export function IconSidebar(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="3.25" />
      <path d="M9.5 4.5v15" />
      <path d="M5.75 8h1.5M5.75 11h1.5" />
    </Line>
  );
}
export function IconInfo(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 11v5.25" />
      <circle cx="12" cy="7.75" r="1.1" fill="currentColor" stroke="none" />
    </Line>
  );
}
export function IconSearch(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="10.75" cy="10.75" r="6.25" />
      <path d="m15.5 15.5 5 5" />
    </Line>
  );
}
export function IconPencil(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 20h4.25L19.4 8.85a2.12 2.12 0 0 0-3-3L5.25 17v3" />
      <path d="m14.75 7.5 3 3" />
    </Line>
  );
}
export function IconTrash(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 6.75h16" />
      <path d="M9.5 6.75v-2a1.25 1.25 0 0 1 1.25-1.25h2.5a1.25 1.25 0 0 1 1.25 1.25v2" />
      <path d="m6 6.75.9 12.4A1.75 1.75 0 0 0 8.65 20.8h6.7a1.75 1.75 0 0 0 1.75-1.65L18 6.75" />
      <path d="M10 11v5.5M14 11v5.5" />
    </Line>
  );
}
export function IconUndo(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4.5 9h10.25a5 5 0 0 1 0 10H10" />
      <path d="m8.5 5-4 4 4 4" />
    </Line>
  );
}
export function IconRefresh(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M20 11.5a8 8 0 0 0-14.1-4.6L4 9" />
      <path d="M4 4.5V9h4.5" />
      <path d="M4 12.5a8 8 0 0 0 14.1 4.6L20 15" />
      <path d="M20 19.5V15h-4.5" />
    </Line>
  );
}
export function IconExternal(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v3.75A2.25 2.25 0 0 1 15.75 20h-9.5A2.25 2.25 0 0 1 4 17.75v-9.5A2.25 2.25 0 0 1 6.25 6H10" />
    </Line>
  );
}
export function IconShare(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 14.5V3.5" />
      <path d="m8 7 4-4 4 4" />
      <path d="M7.5 10.5H6.25A2.25 2.25 0 0 0 4 12.75v5A2.25 2.25 0 0 0 6.25 20h11.5A2.25 2.25 0 0 0 20 17.75v-5a2.25 2.25 0 0 0-2.25-2.25H16.5" />
    </Line>
  );
}
export function IconLink(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-.75.75" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l.75-.75" />
    </Line>
  );
}
export function IconEye(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Line>
  );
}
export function IconEyeOff(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M10.6 5.85a9.4 9.4 0 0 1 1.4-.1c5.75 0 9.25 6.25 9.25 6.25a16 16 0 0 1-2.55 3.3" />
      <path d="M6.6 6.6C4.1 8.3 2.75 12 2.75 12s3.5 6.25 9.25 6.25a9 9 0 0 0 5.2-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </Line>
  );
}
export function IconLayers(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m12 3.5 8.75 4.5L12 12.5 3.25 8 12 3.5Z" />
      <path d="m3.25 12 8.75 4.5 8.75-4.5" />
      <path d="m3.25 16 8.75 4.5 8.75-4.5" />
    </Line>
  );
}
export function IconFit(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </Line>
  );
}
export function IconList(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.75" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.75" cy="17.5" r="1.25" fill="currentColor" stroke="none" />
    </Line>
  );
}
export function IconKeypad(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4 8.5h16.5M3.5 15.5H20" />
    </Line>
  );
}

/* ------------------------------ Personen ------------------------------ */

export function IconPerson(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.75 20c.7-3.6 3.6-6 7.25-6s6.55 2.4 7.25 6" />
    </Line>
  );
}
export function IconUserPlus(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20c.65-3.5 3.25-5.75 6.5-5.75 1.45 0 2.75.45 3.8 1.25" />
      <path d="M18.5 13v6M15.5 16h6" />
    </Line>
  );
}
export function IconKey(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.85 12.15 8.65-8.65" />
      <path d="m16.5 6.5 2.5 2.5M14 9l2 2" />
    </Line>
  );
}
export function IconShield(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 3.25 5 6v5.5c0 4.3 2.95 7.85 7 9.25 4.05-1.4 7-4.95 7-9.25V6l-7-2.75Z" />
      <path d="m9 12 2.1 2.1L15 10.2" />
    </Line>
  );
}

/* ------------------------------ An der Tuer ---------------------------- */

export function IconBell(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.75-2 6.25-2 6.25h16S18 13.75 18 9Z" />
      <path d="M13.75 19a2 2 0 0 1-3.5 0" />
    </Line>
  );
}
export function IconBellCheck(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.75-2 6.25-2 6.25h16S18 13.75 18 9Z" />
      <path d="M13.75 19a2 2 0 0 1-3.5 0" />
      <path d="m9.5 9.75 1.8 1.8 3.2-3.3" />
    </Line>
  );
}
export function IconBan(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="m5.8 5.8 12.4 12.4" />
    </Line>
  );
}
export function IconPhone(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M7.6 3.5 9.9 8l-2 1.7a12.6 12.6 0 0 0 6.4 6.4l1.7-2 4.5 2.3-.95 3.15a2 2 0 0 1-2.2 1.35C10.95 20.05 3.95 13.05 3.1 6.75A2 2 0 0 1 4.45 4.55L7.6 3.5Z" />
    </Line>
  );
}
export function IconNavigate(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M20.25 3.75 3.9 10.1a.6.6 0 0 0 .05 1.13l6.95 2.12 2.12 6.95a.6.6 0 0 0 1.13.05L20.25 3.75Z" />
    </Line>
  );
}
export function IconCrosshair(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Line>
  );
}
export function IconPin(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </Line>
  );
}
export function IconCircleArea(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 12h8" />
    </Line>
  );
}
export function IconPolygonArea(props: IconProps) {
  return (
    <Line {...props}>
      <path d="m5 7 7-3.5L20 8l-2.5 9L9 20 5 7Z" />
      <circle cx="5" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="9" cy="20" r="1.6" fill="currentColor" stroke="none" />
    </Line>
  );
}
export function IconOffline(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M2.75 8.75A15 15 0 0 1 7.6 5.6M12 4.75c3.3 0 6.45 1.25 9.25 3.75" />
      <path d="M6 12.25a10 10 0 0 1 3-1.75M15.2 10.6a10 10 0 0 1 2.8 1.65" />
      <path d="M9.4 15.75a5 5 0 0 1 5.2 0" />
      <circle cx="12" cy="19.25" r="1.2" fill="currentColor" stroke="none" />
      <path d="m3.5 3.5 17 17" />
    </Line>
  );
}
export function IconBattery(props: IconProps) {
  return (
    <Line {...props}>
      <rect x="2.75" y="7" width="16" height="10" rx="2.5" />
      <path d="M21 10.5v3" />
      <rect x="5.25" y="9.5" width="4.5" height="5" rx="1" fill="currentColor" stroke="none" />
    </Line>
  );
}
export function IconCloudUp(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M7 18.5a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6-1.23A3.8 3.8 0 0 1 18 18.5h-1" />
      <path d="M12 20.5v-7.5" />
      <path d="m9 15.5 3-3 3 3" />
    </Line>
  );
}
export function IconChat(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5 18.5 3.5 21l.7-4A8 8 0 1 1 7.5 19.3" />
      <path d="M8.5 11h7M8.5 14h4" />
    </Line>
  );
}
export function IconCheckCircle(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <path d="m8 12.4 2.8 2.8 5.2-5.7" />
    </Line>
  );
}
export function IconTarget(props: IconProps) {
  return (
    <Line {...props}>
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="12" cy="12" r="4.75" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </Line>
  );
}

/* ---------------------------- Team & Feed ----------------------------- */

export function IconTrophy(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 6H4.75v1.25A3.25 3.25 0 0 0 7.7 10.5" />
      <path d="M16.5 6h2.75v1.25a3.25 3.25 0 0 1-2.95 3.25" />
      <path d="M12 13.5V17M8.5 20.5h7M9.75 17h4.5" />
    </Line>
  );
}
export function IconHeart({ className, filled = false }: IconProps & { filled?: boolean }) {
  const d =
    "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z";
  return filled ? (
    <Solid className={className}>
      <path d={d} />
    </Solid>
  ) : (
    <Line className={className}>
      <path d={d} />
    </Line>
  );
}
export function IconComment(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 1 3.4 6.3L4 19.5l1.2-3.6A7.4 7.4 0 0 1 4.5 12Z" />
    </Line>
  );
}
export function IconSend(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 19.5V5" />
      <path d="m6 11 6-6 6 6" />
    </Line>
  );
}
export function IconFlame(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-11-2.5 2-4.5 4.5-4.5 7.5-1-.5-1.8-1.6-2-2.8C6.3 9.8 5.5 12 5.5 14.5A6.5 6.5 0 0 0 12 21Z" />
    </Line>
  );
}
export function IconTrendUp(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 19V5.5" />
      <path d="m6.5 11 5.5-5.5 5.5 5.5" />
    </Line>
  );
}
export function IconTrendDown(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M12 5v13.5" />
      <path d="m6.5 13 5.5 5.5 5.5-5.5" />
    </Line>
  );
}
export function IconSparkles(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M10 3.5 11.6 8a2 2 0 0 0 1.2 1.2l4.45 1.55-4.45 1.6a2 2 0 0 0-1.2 1.2L10 18l-1.6-4.45a2 2 0 0 0-1.2-1.2L2.75 10.75 7.2 9.2a2 2 0 0 0 1.2-1.2L10 3.5Z" />
      <path d="M18 14.5v5M15.5 17h5" />
    </Line>
  );
}
