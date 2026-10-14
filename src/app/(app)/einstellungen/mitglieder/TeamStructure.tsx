"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { IconChevronDown, IconChevronRight } from "@/components/icons";
import { Avatar, ListLabel, plural } from "@/components/ui";
import { buildTeamStructure, type StructureMember, type StructureNode } from "@/lib/team-structure";

/** Einrueckung je Ebene; tiefer als fuenf Ebenen rueckt nichts mehr ein. */
const STEP = 16;
const MAX_DEPTH = 5;

const CONTEXT: Record<NonNullable<StructureNode["rootReason"]>, string> = {
  top: "Strukturspitze",
  unassigned: "Ohne Führungskraft",
  outside: "Führungskraft nicht sichtbar",
  cycle: "Zuordnung prüfen",
};

/**
 * Die Vertriebsstruktur als eingerueckte Liste: jede Zeile eine Person,
 * darunter ihre direkten Mitglieder. Tippen oeffnet das Blatt der Person,
 * der Pfeil rechts klappt den Zweig ein.
 */
export function TeamStructure({
  members,
  currentUserId,
  onOpen,
}: {
  members: StructureMember[];
  currentUserId: number;
  onOpen: (id: number) => void;
}) {
  const roots = useMemo(() => buildTeamStructure(members), [members]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const branchIds = useMemo(() => {
    const ids: number[] = [];
    const pending = [...roots];
    while (pending.length) {
      const node = pending.pop()!;
      if (node.children.length) ids.push(node.member.id);
      pending.push(...node.children);
    }
    return ids;
  }, [roots]);
  const hasCollapsed = branchIds.some((id) => collapsed.has(id));

  // Sichtbare Zeilen in Lesereihenfolge - iterativ, auch bei tiefen Strukturen.
  const rows = useMemo(() => {
    const out: Array<{ node: StructureNode; depth: number }> = [];
    const stack = [...roots].reverse().map((node) => ({ node, depth: 0 }));
    while (stack.length) {
      const entry = stack.pop()!;
      out.push(entry);
      if (!collapsed.has(entry.node.member.id)) {
        for (let i = entry.node.children.length - 1; i >= 0; i--) {
          stack.push({ node: entry.node.children[i], depth: entry.depth + 1 });
        }
      }
    }
    return out;
  }, [roots, collapsed]);

  function toggle(id: number) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-label="Struktur">
      <div className="flex items-end justify-between gap-4">
        <ListLabel>{plural(members.length, "Person", "Personen")}</ListLabel>
        {branchIds.length > 0 && (
          <button
            type="button"
            className="btn btn-plain btn-sm mb-1"
            onClick={() => setCollapsed(hasCollapsed ? new Set() : new Set(branchIds))}
          >
            {hasCollapsed ? "Alle aufklappen" : "Alle einklappen"}
          </button>
        )}
      </div>
      <ul className="list">
        {rows.map(({ node, depth }) => {
          const { member, children, descendantCount, rootReason } = node;
          const indent = 16 + Math.min(depth, MAX_DEPTH) * STEP;
          const expanded = !collapsed.has(member.id);
          const role = member.role === "LEADER" ? "Teamleitung" : children.length ? "Führungskraft" : "Vertrieb";
          const facts = [
            member.id === currentUserId ? "Du" : null,
            member.active ? role : `${role}, deaktiviert`,
            rootReason ? CONTEXT[rootReason] : null,
            children.length ? `${children.length} direkt · ${descendantCount} gesamt` : null,
          ].filter(Boolean);
          return (
            <li
              key={member.id}
              className="flex items-center"
              // Die Haarlinie beginnt dort, wo der Name beginnt.
              style={{ "--sep-inset": `${indent + 44}px` } as CSSProperties}
            >
              <button
                type="button"
                className="cell cell-tap min-w-0 flex-1"
                style={{ paddingLeft: indent }}
                onClick={() => onOpen(member.id)}
              >
                <span className="sr-only">Ebene {depth + 1}: </span>
                <Avatar name={member.name} src={member.avatar} size={32} className={member.active ? "" : "opacity-50"} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-body ${member.active ? "" : "text-muted"}`}>{member.name}</span>
                  <span className={`block truncate text-footnote ${rootReason === "cycle" ? "text-warn" : "text-muted"}`}>
                    {facts.join(" · ")}
                  </span>
                </span>
              </button>
              {children.length > 0 ? (
                <button
                  type="button"
                  className="icon-btn mr-1"
                  aria-expanded={expanded}
                  aria-label={`Zweig von ${member.name} ${expanded ? "einklappen" : "aufklappen"}`}
                  onClick={() => toggle(member.id)}
                >
                  {expanded ? <IconChevronDown className="h-4 w-4" /> : <IconChevronRight className="h-4 w-4" />}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
