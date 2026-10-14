"use client";

import Link from "next/link";
import { IconCalendar, IconChevronDown, IconCloudUp, IconOffline } from "@/components/icons";
import { ProgressRing } from "@/components/ui";
import { PriceBadge } from "@/components/ProviderRating";
import type { StreetWithStats } from "@/lib/queries";
import type { TerritoryLite } from "./model";

/** Tagesziel fuer den Ring oben links - dasselbe wie unter "Erfolge". */
const DAILY_DOORS = 20;

/**
 * Kopf der Tuer-Erfassung: wo bin ich (Strasse, Gebiet), wie weit bin ich
 * heute, was wartet noch. Strasse und Gebiet wechselt ein Tipp auf den
 * Namen - die Auswahl liegt in einem Blatt mit Suche.
 */
export function TourHeader({
  street,
  territory,
  todayDoors,
  dueCount,
  pendingCount,
  online,
  onStreet,
  onDay,
}: {
  street: StreetWithStats | null;
  territory: TerritoryLite | null;
  todayDoors: number;
  dueCount: number;
  pendingCount: number;
  online: boolean;
  onStreet: () => void;
  onDay: () => void;
}) {
  const lead = territory?.provider?.strom ?? territory?.provider?.gas ?? null;
  const place = territory
    ? [territory.name, [territory.postal_code, territory.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")
    : "Gebiet wählen";

  return (
    <header className="pb-4">
      <div className="flex h-11 items-center gap-2">
        <button
          type="button"
          onClick={onDay}
          className="-ml-2 flex min-h-11 items-center gap-2 rounded-full pl-2 pr-3 transition-colors hover:bg-hover"
          aria-label={`Heute ${todayDoors} Türen – Tagesübersicht öffnen`}
        >
          <ProgressRing value={todayDoors} max={DAILY_DOORS} size={28} stroke={4} />
          <span className="text-subhead font-semibold">
            {todayDoors} <span className="font-normal text-ink-2">{todayDoors === 1 ? "Tür" : "Türen"} heute</span>
          </span>
        </button>
        <span className="flex-1" />
        {(!online || pendingCount > 0) && (
          <button type="button" onClick={onDay} className="badge min-h-8 px-3" aria-label="Warteschlange öffnen">
            {online ? <IconCloudUp className="h-4 w-4" /> : <IconOffline className="h-4 w-4" />}
            {online ? `${pendingCount} warten` : pendingCount > 0 ? `Offline · ${pendingCount}` : "Offline"}
          </button>
        )}
        <Link
          href="/termine"
          className="icon-btn -mr-2"
          aria-label={dueCount > 0 ? `Termine – ${dueCount} heute fällig` : "Termine"}
        >
          <IconCalendar className="h-6 w-6" />
          {dueCount > 0 && (
            <span className="badge badge-ink absolute right-0 top-0 min-h-5 min-w-5 justify-center px-1 text-caption-2">
              {dueCount}
            </span>
          )}
        </Link>
      </div>

      <button
        type="button"
        onClick={onStreet}
        className="mt-1 flex max-w-full items-center gap-2 rounded-lg text-left"
        aria-label={`${street ? street.name : "Straße wählen"} – Straße oder Gebiet wechseln`}
      >
        <h1 className="min-w-0 truncate text-large-title">{street ? street.name : "Straße wählen"}</h1>
        <IconChevronDown className="h-5 w-5 shrink-0 text-accent-ink" />
      </button>
      <p className="mt-1 flex min-w-0 items-center gap-2 text-subhead text-ink-2">
        <span className="truncate">{place}</span>
        {lead && <PriceBadge step={lead.step} size="sm" />}
      </p>
    </header>
  );
}
