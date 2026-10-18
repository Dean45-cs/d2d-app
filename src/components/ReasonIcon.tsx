import { useId, type CSSProperties, type ReactNode } from "react";
import { reasonIcon, type ReasonIconKey } from "@/lib/reason-icons";

/*
 * Die Zeichen der Ablehnungsgruende - dieselbe Familie wie icons.tsx
 * (24er-Raster, Strich 1.75, runde Enden), dazu eine zweite Ebene: die
 * Flaeche hinter dem Umriss ist leicht getoent ("duo"), wie die
 * hierarchische Darstellung von SF Symbols. Auf der Kachel (ReasonTile) ist
 * sie heller, im neutralen Zeichenkreis gedaempft.
 */

const BASE = "h-5 w-5 shrink-0";

/** Getoente Flaeche; die Deckkraft setzt der Behaelter ueber --duo. */
const DUO = { fill: "currentColor", stroke: "none", style: { fillOpacity: "var(--duo, 0.2)" } as CSSProperties };
/** Volle Punkte (Augen, Zifferblatt-Mitte). */
const DOT = { fill: "currentColor", stroke: "none" };

function Svg({ className = BASE, children }: { className?: string; children: ReactNode }) {
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

/** Tuer mit Schraegstrich; der Strich spart den Umriss darunter aus. */
function DoorSlash({ className }: { className?: string }) {
  const mask = `${useId().replace(/:/g, "")}-cut`;
  const door = "M5.5 21V4.75A1.75 1.75 0 0 1 7.25 3h9.5a1.75 1.75 0 0 1 1.75 1.75V21";
  return (
    <Svg className={className}>
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path d="M3.75 3.75 20.25 20.25" stroke="#000" strokeWidth={4.75} />
      </mask>
      <g mask={`url(#${mask})`}>
        <path d={`${door}Z`} {...DUO} />
        <path d={door} />
        <path d="M3.5 21h17" />
        <circle cx="15" cy="12.5" r="1.1" {...DOT} />
      </g>
      <path d="M3.75 3.75 20.25 20.25" />
    </Svg>
  );
}

const GLYPHS: Record<ReasonIconKey, (className?: string) => ReactNode> = {
  smile: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.75" {...DUO} />
      <circle cx="12" cy="12" r="8.75" />
      <circle cx="9" cy="10" r="1.15" {...DOT} />
      <circle cx="15" cy="10" r="1.15" {...DOT} />
      <path d="M8.5 14.1c.85 1.3 2.1 2 3.5 2s2.65-.7 3.5-2" />
    </Svg>
  ),
  frown: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.75" {...DUO} />
      <circle cx="12" cy="12" r="8.75" />
      <path d="m7.9 8.3 2.4.95M16.1 8.3l-2.4.95" />
      <circle cx="9.25" cy="11.25" r="1.1" {...DOT} />
      <circle cx="14.75" cy="11.25" r="1.1" {...DOT} />
      <path d="M8.75 16.5c.8-1.05 1.9-1.6 3.25-1.6s2.45.55 3.25 1.6" />
    </Svg>
  ),
  hand: (className) => {
    const palm =
      "M8 14.5V6a1.25 1.25 0 0 1 2.5 0V4.75a1.25 1.25 0 0 1 2.5 0v1a1.25 1.25 0 0 1 2.5 0V8a1.25 1.25 0 0 1 2.5 0v6.25c0 3.6-2.5 6.25-6 6.25-2.2 0-3.6-.9-4.8-2.5l-2.8-3.9a1.3 1.3 0 0 1 2-1.6L8 14.5Z";
    return (
      <Svg className={className}>
        <path d={palm} {...DUO} />
        <path d={palm} />
        <path d="M10.5 6v5.5M13 5.75v5.75M15.5 8v3.75" />
      </Svg>
    );
  },
  stopwatch: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="13.5" r="7.25" {...DUO} />
      <circle cx="12" cy="13.5" r="7.25" />
      <path d="M9.75 2.75h4.5M12 2.75v3.5M18.1 7.4l1.4-1.4M12 13.5V9.75" />
      <circle cx="12" cy="13.5" r="1.15" {...DOT} />
    </Svg>
  ),
  couple: (className) => (
    <Svg className={className}>
      <circle cx="9" cy="8" r="3.25" {...DUO} />
      <path d="M3 19.5c.55-3 2.95-5 6-5s5.45 2 6 5Z" {...DUO} />
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 19.5c.55-3 2.95-5 6-5s5.45 2 6 5H3Z" />
      <path d="M15.75 4.9a3.25 3.25 0 0 1 0 6.2M17.75 14.6c1.75.75 2.9 2.4 3.25 4.9" />
    </Svg>
  ),
  contract: (className) => (
    <Svg className={className}>
      <path d="M12.25 20.5h-5A1.75 1.75 0 0 1 5.5 18.75V5.25A1.75 1.75 0 0 1 7.25 3.5h6.25l5 5v2.25" />
      <path d="M13.5 3.5V7a1.5 1.5 0 0 0 1.5 1.5h3.5M8.5 12h4.5M8.5 15h2.5" />
      <circle cx="17.25" cy="17.25" r="3.75" {...DUO} />
      <circle cx="17.25" cy="17.25" r="3.75" />
      <path d="M17.25 15.6v1.75l1.15.85" />
    </Svg>
  ),
  switch: (className) => (
    <Svg className={className}>
      <path d="M4.5 8.5h14M15 5l3.5 3.5L15 12M19.5 15.5h-14M9 12l-3.5 3.5L9 19" />
    </Svg>
  ),
  euro: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.75" {...DUO} />
      <circle cx="12" cy="12" r="8.75" />
      <path d="M15.4 8.95a3.9 3.9 0 1 0 0 6.1M7.75 10.75h5.25M7.75 13.25h5.25" />
    </Svg>
  ),
  "door-slash": (className) => <DoorSlash className={className} />,
  document: (className) => {
    const page =
      "M6.75 3.5h6.75l5 5v10.25a1.75 1.75 0 0 1-1.75 1.75H6.75A1.75 1.75 0 0 1 5 18.75V5.25A1.75 1.75 0 0 1 6.75 3.5Z";
    return (
      <Svg className={className}>
        <path d={page} {...DUO} />
        <path d={page} />
        <path d="M13.5 3.5V7a1.5 1.5 0 0 0 1.5 1.5h3.5" />
        <path d="M9.75 12.25a2 2 0 1 1 2.85 1.8c-.5.24-.85.7-.85 1.25v.35" />
        <circle cx="11.75" cy="17.6" r="1" {...DOT} />
      </Svg>
    );
  },
  key: (className) => (
    <Svg className={className}>
      <circle cx="8" cy="15" r="4.25" {...DUO} />
      <circle cx="8" cy="15" r="4.25" />
      <path d="m11 12 8.5-8.5M16.25 6.75l2.5 2.5M13.75 9.25l2 2" />
    </Svg>
  ),
  speech: (className) => {
    const front =
      "M3 11.25A2.75 2.75 0 0 1 5.75 8.5h6.5A2.75 2.75 0 0 1 15 11.25v3.5a2.75 2.75 0 0 1-2.75 2.75H8.5l-3.25 2.75v-2.8A2.75 2.75 0 0 1 3 14.75v-3.5Z";
    return (
      <Svg className={className}>
        <path d={front} {...DUO} />
        <path d={front} />
        <path d="M9 8.5V6.25A2.75 2.75 0 0 1 11.75 3.5h6.5A2.75 2.75 0 0 1 21 6.25v3.5a2.75 2.75 0 0 1-2.75 2.75h-.5v2.5L15.1 12.9" />
      </Svg>
    );
  },
  pencil: (className) => {
    const body = "M16.1 3.9a2.12 2.12 0 0 1 3 3L8.4 17.6l-4.15 1.15 1.15-4.15L16.1 3.9Z";
    return (
      <Svg className={className}>
        <path d={body} {...DUO} />
        <path d={body} />
        <path d="m14.25 5.75 3 3" />
      </Svg>
    );
  },
  chat: (className) => {
    const bubble =
      "M12 4.25c4.7 0 8.5 3.05 8.5 6.85s-3.8 6.85-8.5 6.85c-.95 0-1.85-.12-2.7-.35L5 19.5l1.3-3.6c-1.75-1.25-2.8-2.95-2.8-4.8 0-3.8 3.8-6.85 8.5-6.85Z";
    return (
      <Svg className={className}>
        <path d={bubble} {...DUO} />
        <path d={bubble} />
        <circle cx="8.5" cy="11.1" r="1.1" {...DOT} />
        <circle cx="12" cy="11.1" r="1.1" {...DOT} />
        <circle cx="15.5" cy="11.1" r="1.1" {...DOT} />
      </Svg>
    );
  },
  phone: (className) => {
    const handset =
      "M7.6 3.5 9.9 8l-2 1.7a12.6 12.6 0 0 0 6.4 6.4l1.7-2 4.5 2.3-.95 3.15a2 2 0 0 1-2.2 1.35C10.95 20.05 3.95 13.05 3.1 6.75A2 2 0 0 1 4.45 4.55L7.6 3.5Z";
    return (
      <Svg className={className}>
        <path d={handset} {...DUO} />
        <path d={handset} />
      </Svg>
    );
  },
  calendar: (className) => (
    <Svg className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" {...DUO} />
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <circle cx="8" cy="13.75" r="1" {...DOT} />
      <circle cx="12" cy="13.75" r="1" {...DOT} />
      <circle cx="16" cy="13.75" r="1" {...DOT} />
      <circle cx="8" cy="17" r="1" {...DOT} />
      <circle cx="12" cy="17" r="1" {...DOT} />
    </Svg>
  ),
  hourglass: (className) => (
    <Svg className={className}>
      <path d="M10.15 7.25h3.7c-.45.95-1.05 1.55-1.85 2.15-.8-.6-1.4-1.2-1.85-2.15Z" {...DUO} />
      <path d="M9.4 19.75c.5-1.75 1.6-2.75 2.6-3.3 1 .55 2.1 1.55 2.6 3.3Z" {...DUO} />
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M8 3.5V6c0 2.2 1.6 3.7 3.25 5.1.45.4.45 1.4 0 1.8C9.6 14.3 8 15.8 8 18v2.5" />
      <path d="M16 3.5V6c0 2.2-1.6 3.7-3.25 5.1-.45.4-.45 1.4 0 1.8C14.4 14.3 16 15.8 16 18v2.5" />
    </Svg>
  ),
  house: (className) => (
    <Svg className={className}>
      <path d="M5.75 9.25 12 4.25l6.25 5V20H5.75Z" {...DUO} />
      <path d="M3.5 10.5 12 3.75l8.5 6.75" />
      <path d="M5.75 9v10.25c0 .41.34.75.75.75H10v-5.25h4V20h3.5c.41 0 .75-.34.75-.75V9" />
    </Svg>
  ),
  lock: (className) => (
    <Svg className={className}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" {...DUO} />
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V7.75a4 4 0 0 1 8 0v2.75M12 15.25v2" />
      <circle cx="12" cy="15" r="1.25" {...DOT} />
    </Svg>
  ),
  box: (className) => (
    <Svg className={className}>
      <path d="M12 3.5 20.25 7.75 12 12 3.75 7.75Z" {...DUO} />
      <path d="M12 3.5 20.25 7.75v8.5L12 20.5l-8.25-4.25v-8.5L12 3.5Z" />
      <path d="M3.75 7.75 12 12l8.25-4.25M12 12v8.5M7.9 5.65l8.2 4.25" />
    </Svg>
  ),
  shield: (className) => {
    const shape = "M12 3.25 5 6v5.5c0 4.3 2.95 7.85 7 9.25 4.05-1.4 7-4.95 7-9.25V6l-7-2.75Z";
    return (
      <Svg className={className}>
        <path d={shape} {...DUO} />
        <path d={shape} />
        <path d="M12 8v4.5" />
        <circle cx="12" cy="15.6" r="1.05" {...DOT} />
      </Svg>
    );
  },
  bolt: (className) => {
    const shape = "M13.25 2.75 5 13.25h6.25l-.75 8 8.25-10.5H12.5l.75-8Z";
    return (
      <Svg className={className}>
        <path d={shape} {...DUO} />
        <path d={shape} />
      </Svg>
    );
  },
  flame: (className) => {
    const shape =
      "M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.5-4-6.5-4.5-11-2.5 2-4.5 4.5-4.5 7.5-1-.5-1.8-1.6-2-2.8C6.3 9.8 5.5 12 5.5 14.5A6.5 6.5 0 0 0 12 21Z";
    return (
      <Svg className={className}>
        <path d={shape} {...DUO} />
        <path d={shape} />
        <path d="M12 21a2.75 2.75 0 0 1-2.75-2.75c0-1.9 1.6-2.9 2.75-4.75 1.15 1.85 2.75 2.85 2.75 4.75A2.75 2.75 0 0 1 12 21Z" />
      </Svg>
    );
  },
  sun: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" {...DUO} />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.45 5.45l1.4 1.4M17.15 17.15l1.4 1.4M5.45 18.55l1.4-1.4M17.15 6.85l1.4-1.4" />
    </Svg>
  ),
  ban: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.75" {...DUO} />
      <circle cx="12" cy="12" r="8.75" />
      <path d="m5.8 5.8 12.4 12.4" />
    </Svg>
  ),
  alert: (className) => {
    const shape = "M10.3 4.2a2 2 0 0 1 3.4 0l7.1 12.3a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3L10.3 4.2Z";
    return (
      <Svg className={className}>
        <path d={shape} {...DUO} />
        <path d={shape} />
        <path d="M12 9.25v4" />
        <circle cx="12" cy="16.4" r="1.05" {...DOT} />
      </Svg>
    );
  },
  question: (className) => (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.75" {...DUO} />
      <circle cx="12" cy="12" r="8.75" />
      <path d="M9.75 9.6a2.3 2.3 0 1 1 3.3 2.1c-.6.3-1.05.8-1.05 1.5v.4" />
      <circle cx="12" cy="16.5" r="1.05" {...DOT} />
    </Svg>
  ),
};

/** Nur das Zeichen, in der Schriftfarbe - etwa im neutralen Zeichenkreis. */
export function ReasonIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return <>{GLYPHS[reasonIcon(name).key](className)}</>;
}

/**
 * Das Zeichen auf seiner Kachel: getoenter Verlauf im Symbolton, helles
 * Zeichen - wie die Symbole in den iOS-Einstellungen. Fuer Auswahl, Pflege
 * und Auswertung der Gruende; in Verlaeufen bleibt es neutral (OutcomeGlyph).
 */
export function ReasonTile({
  name,
  size = "md",
  round = false,
  className = "",
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  round?: boolean;
  className?: string;
}) {
  const icon = reasonIcon(name);
  const glyph = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={`reason-tile ${size === "md" ? "" : `reason-tile-${size}`} ${round ? "reason-tile-round" : ""} ${className}`}
      data-tone={icon.tone}
      aria-hidden="true"
    >
      <ReasonIcon name={icon.key} className={glyph} />
    </span>
  );
}
