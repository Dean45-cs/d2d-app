"use client";

import { useState } from "react";
import { slotLabel } from "@/lib/appointments";
import type { HandoverSummary } from "@/lib/territory-handover";
import { Sheet } from "./Sheet";
import { Cell, ListLabel, Notice } from "./ui";
import { IconBan, IconBell, IconCalendar, IconDoor, IconHistory, IconInfo, IconRefresh } from "./icons";

type Detail = "retry" | "blocked" | "appointments" | "latest" | null;

/**
 * Arbeitsstand eines Gebiets - was jemand wissen muss, der es uebernimmt:
 * offene und gesperrte Tueren, offene Termine, die letzte Uebergabe.
 * Einzelheiten stehen jeweils in einem Blatt.
 */
export function TerritoryHandover({ summary }: { summary: HandoverSummary }) {
  const [open, setOpen] = useState<Detail>(null);
  const retry = summary.details.filter((d) => d.state === "RETRY");
  const blocked = summary.details.filter((d) => d.state === "BLOCKED");

  return (
    <section>
      <ListLabel>Arbeitsstand</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell icon={<Glyph icon={<IconDoor className="h-4 w-4" />} />} title="Offene Türen" detail={summary.openDoors} />
        </li>
        {summary.retryDoors > 0 && (
          <li>
            <Cell
              onClick={() => setOpen("retry")}
              icon={<Glyph icon={<IconRefresh className="h-4 w-4" />} />}
              title="Nochmal klingeln"
              detail={summary.retryDoors}
              chevron
            />
          </li>
        )}
        {summary.blockedDoors > 0 && (
          <li>
            <Cell
              onClick={() => setOpen("blocked")}
              icon={<Glyph icon={<IconBan className="h-4 w-4" />} />}
              title="Gesperrt"
              detail={summary.blockedDoors}
              chevron
            />
          </li>
        )}
        {summary.unknownBuildings > 0 && (
          <li>
            <Cell
              icon={<Glyph icon={<IconBell className="h-4 w-4" />} />}
              title="Klingelschilder fehlen"
              detail={summary.unknownBuildings}
            />
          </li>
        )}
        <li>
          <Cell
            onClick={summary.appointments.length > 0 ? () => setOpen("appointments") : undefined}
            icon={<Glyph icon={<IconCalendar className="h-4 w-4" />} />}
            title="Offene Termine"
            detail={summary.appointments.length}
            chevron={summary.appointments.length > 0}
          />
        </li>
        {summary.latest && (
          <li>
            <Cell
              onClick={() => setOpen("latest")}
              icon={<Glyph icon={<IconHistory className="h-4 w-4" />} />}
              title="Letzte Übergabe"
              subtitle={`${summary.latest.from_name ?? "Niemand"} → ${summary.latest.to_name ?? "Niemand"}`}
              chevron
            />
          </li>
        )}
      </ul>
      {summary.notes && (
        <div className="mt-2">
          <Notice icon={<IconInfo className="h-4 w-4" />}>
            <span className="whitespace-pre-wrap">{summary.notes}</span>
          </Notice>
        </div>
      )}

      {(open === "retry" || open === "blocked") && (
        <Sheet title={open === "retry" ? "Nochmal klingeln" : "Gesperrt"} onClose={() => setOpen(null)}>
          <ul className="list">
            {(open === "retry" ? retry : blocked).map((door, index) => (
              <li key={index}>
                <Cell
                  title={door.label}
                  subtitle={
                    [open === "retry" ? `${door.attempts}× nicht angetroffen` : "Nicht klingeln", door.note || null]
                      .filter(Boolean)
                      .join(" · ")
                  }
                />
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {open === "appointments" && (
        <Sheet title="Offene Termine" onClose={() => setOpen(null)}>
          <ul className="list">
            {summary.appointments.map((item) => (
              <li key={item.id}>
                <Cell
                  href={`/termine?termin=${item.id}`}
                  title={item.address}
                  subtitle={`${slotLabel(item.slot)} · ${item.owner_name}`}
                />
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {open === "latest" && summary.latest && (
        <Sheet
          title="Letzte Übergabe"
          subtitle={`${summary.latest.from_name ?? "Niemand"} → ${summary.latest.to_name ?? "Niemand"}`}
          onClose={() => setOpen(null)}
        >
          <ul className="list">
            <li>
              <Cell title="Termine übergeben" detail={summary.latest.appointments_transferred} />
            </li>
            <li>
              <Cell title="Datum" detail={new Date(`${summary.latest.created_at.replace(" ", "T")}Z`).toLocaleDateString("de-DE")} />
            </li>
          </ul>
          {summary.latest.note && (
            <p className="mt-4 whitespace-pre-wrap px-1 text-body">{summary.latest.note}</p>
          )}
        </Sheet>
      )}
    </section>
  );
}

function Glyph({ icon }: { icon: React.ReactNode }) {
  return <span className="glyph">{icon}</span>;
}
