"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconChevronUp, IconUsers } from "@/components/icons";
import { Avatar, plural } from "@/components/ui";
import { buildTeamStructure, type StructureMember, type StructureNode } from "@/lib/team-structure";
import styles from "./TeamStructure.module.css";

export function TeamStructure({ members, currentUserId }: { members: StructureMember[]; currentUserId: number }) {
  const roots = useMemo(() => buildTeamStructure(members), [members]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const viewportRef = useRef<HTMLDivElement>(null);
  const forestRef = useRef<HTMLUListElement>(null);
  const [overflows, setOverflows] = useState(false);
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

  useEffect(() => {
    const viewport = viewportRef.current;
    const forest = forestRef.current;
    if (!viewport || !forest) return;
    const observer = new ResizeObserver(() => setOverflows(viewport.scrollWidth > viewport.clientWidth + 1));
    observer.observe(viewport);
    observer.observe(forest);
    // Die Spitze beim ersten Öffnen mittig zeigen; danach die Scrollposition behalten.
    viewport.scrollLeft = window.matchMedia("(max-width: 639px)").matches
      ? 0 : Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    return () => observer.disconnect();
  }, []);

  function toggle(id: number) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className={styles.structure} aria-labelledby="team-structure-heading">
      <div className={styles.toolbar}>
        <div>
          <h2 id="team-structure-heading" className="text-[16px] font-semibold">Vertriebsstruktur</h2>
          <p className="muted mt-1 text-[13px]">Jede Verbindung zeigt die direkte Führungskraft.</p>
        </div>
        {branchIds.length > 0 && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setCollapsed(hasCollapsed ? new Set() : new Set(branchIds))}
          >
            {hasCollapsed ? <IconChevronDown className="h-4 w-4" /> : <IconChevronUp className="h-4 w-4" />}
            {hasCollapsed ? "Alle aufklappen" : "Alle einklappen"}
          </button>
        )}
      </div>

      <div className={styles.legend} aria-label="Kennzeichnung der Personen">
        <span><i className={styles.leaderDot} aria-hidden />Teamleitung</span>
        <span><i className={styles.managerDot} aria-hidden />Führungskraft</span>
        <span><i className={styles.memberDot} aria-hidden />Vertrieb</span>
      </div>

      <div
        ref={viewportRef}
        className={styles.viewport}
        role="region"
        aria-label="Organigramm der sichtbaren Teammitglieder"
        tabIndex={0}
      >
        <ul ref={forestRef} className={styles.forest} aria-label="Strukturspitzen und weitere Teilstrukturen">
          {roots.map((node) => (
            <StructureBranch key={node.member.id} node={node} currentUserId={currentUserId} collapsed={collapsed} onToggle={toggle} />
          ))}
        </ul>
      </div>

      <div className={styles.caption}>
        <span><IconUsers className="h-4 w-4" />{plural(members.length, "Person", "Personen")} in dieser Ansicht</span>
        <span>{overflows ? "Seitlich scrollen, um weitere Zweige zu sehen." : "Über die Mitgliederzahl lassen sich Zweige ein- und ausklappen."}</span>
      </div>
    </section>
  );
}

function StructureBranch({ node, currentUserId, collapsed, onToggle }: {
  node: StructureNode;
  currentUserId: number;
  collapsed: Set<number>;
  onToggle: (id: number) => void;
}) {
  const { member, children, descendantCount, rootReason } = node;
  const hasChildren = children.length > 0;
  const expanded = !collapsed.has(member.id);
  const category = member.role === "LEADER" ? "leader" : hasChildren ? "manager" : "member";
  const label = member.role === "LEADER" ? "Teamleitung" : hasChildren ? "Führungskraft" : "Vertrieb";
  const context = rootReason === "unassigned" ? "Noch ohne Führungskraft"
    : rootReason === "outside" ? "Führungskraft außerhalb der Ansicht"
      : rootReason === "cycle" ? "Zuordnung prüfen: Kreis in der Struktur"
        : rootReason === "top" ? "Strukturspitze"
          : null;

  return (
    <li className={styles.branch}>
      <article className={styles.person} data-category={category} data-inactive={!member.active || undefined}>
        <div className={styles.role}>
          <span>{label}</span>
          {member.id === currentUserId && <span className={styles.self}>Du</span>}
        </div>
        <Link href={`/profil/${member.id}`} className={styles.identity} aria-label={`Profil von ${member.name}`}>
          <Avatar name={member.name} src={member.avatar} size={42} tone={member.active ? "brand" : "muted"} />
          <span className={styles.name} title={member.name}>{member.name}</span>
        </Link>
        <p className={styles.context}>
          {!member.active ? <span><span className={styles.inactive}>Deaktiviert</span>{context && ` · ${context}`}</span> : context ?? (hasChildren ? `${descendantCount} in der Struktur` : "Teammitglied")}
        </p>
        {hasChildren ? (
          <button
            type="button"
            className={styles.branchButton}
            aria-expanded={expanded}
            aria-controls={`structure-children-${member.id}`}
            aria-label={`Struktur von ${member.name} ${expanded ? "einklappen" : "aufklappen"}: ${children.length} direkte Mitglieder, ${descendantCount} insgesamt`}
            onClick={() => onToggle(member.id)}
          >
            <span><IconUsers className="h-3.5 w-3.5" />{children.length} direkt<span className={styles.total}> · {descendantCount} gesamt</span></span>
            {expanded ? <IconChevronUp className="h-4 w-4" /> : <IconChevronDown className="h-4 w-4" />}
          </button>
        ) : <div className={styles.leafFooter}>Keine direkten Mitglieder</div>}
      </article>
      {hasChildren && (
        <ul id={`structure-children-${member.id}`} className={styles.children} hidden={!expanded} aria-label={`Direkte Mitglieder von ${member.name}`}>
          {children.map((child) => (
            <StructureBranch key={child.member.id} node={child} currentUserId={currentUserId} collapsed={collapsed} onToggle={onToggle} />
          ))}
        </ul>
      )}
    </li>
  );
}
