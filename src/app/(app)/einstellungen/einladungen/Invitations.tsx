"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { InvitationRow } from "@/lib/invitations";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Avatar, Cell, EmptyState, ListLabel, Notice, PageHeader, plural } from "@/components/ui";
import {
  IconCheck,
  IconInfo,
  IconLink,
  IconShare,
  IconShield,
  IconTrash,
  IconUserPlus,
  IconX,
} from "@/components/icons";

/** Ablauf eines Links - SQLite speichert UTC ohne Zone. */
function expiry(row: InvitationRow): Date {
  return new Date(row.expires_at.replace(" ", "T") + "Z");
}

function day(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "numeric", month: "short", timeZone: "Europe/Berlin" });
}

function linkFor(token: string): string {
  return `${window.location.origin}/einladung/${token}`;
}

// Teilen gibt es nur, wo das Geraet es anbietet (Handy, Safari).
const noop = () => () => {};
function useCanShare(): boolean {
  return useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
}

/**
 * Einladungen: Link erstellen und teilen, Beitritte freigeben, eigene Links
 * im Blick behalten. Freigeben darf nur die direkte Fuehrungskraft des
 * Einladenden - das prueft der Server.
 */
export function Invitations({
  own,
  approvals,
  approver,
  problem,
  reports,
  canCreate,
  selfApproves,
}: {
  own: InvitationRow[];
  approvals: InvitationRow[];
  approver: string | null;
  problem: string | null;
  reports: { id: number; name: string }[];
  canCreate: boolean;
  selfApproves: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const canShare = useCanShare();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; subtitle: string } | null>(null);

  const approvedBy = selfApproves ? "du" : approver;
  const now = Date.now();
  const open = own.filter((r) => !r.status && !r.revoked_at && expiry(r).getTime() > now);
  // Wer sich selbst freigibt, sieht die Anfrage schon oben - nicht doppelt.
  const pending = own.filter((r) => r.status === "PENDING" && !approvals.some((a) => a.request_id === r.request_id));
  const approved = own.filter((r) => r.status === "APPROVED");
  const ended = own.filter((r) => r.status === "REJECTED" || (!r.status && !open.includes(r)));

  /** Ruft die API, meldet Fehler als Toast und gibt bei Erfolg die Antwort zurueck. */
  async function call(url: string, method: string, body?: object): Promise<Record<string, unknown> | null> {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(typeof data.error === "string" ? data.error : "Aktion fehlgeschlagen");
        return null;
      }
      router.refresh();
      return data;
    } catch {
      toast("Keine Verbindung – bitte erneut versuchen");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const data = await call("/api/invitations", "POST");
    if (typeof data?.token !== "string") return;
    setLink({
      url: linkFor(data.token),
      subtitle: ["7 Tage gültig", approvedBy && `Freigabe: ${approvedBy}`].filter(Boolean).join(" · "),
    });
  }

  async function copy(url: string, subtitle: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link kopiert");
    } catch {
      // Ohne Zwischenablage: Link im Feld zeigen, dort laesst er sich markieren.
      setLink({ url, subtitle });
      toast("Link markieren und kopieren");
    }
  }

  async function share(url: string) {
    try {
      await navigator.share({ title: "Einladung ins Team", url });
    } catch {
      // Abgebrochen oder nicht erlaubt - nichts zu melden.
    }
  }

  async function revoke(row: InvitationRow) {
    const ok = await confirm({
      title: "Link widerrufen?",
      text: "Wer ihn schon hat, kann sich damit nicht mehr registrieren.",
      confirmLabel: "Widerrufen",
      danger: true,
    });
    if (!ok) return;
    if (await call(`/api/invitations/${row.id}`, "DELETE")) toast("Link widerrufen");
  }

  async function decide(row: InvitationRow, decision: "APPROVED" | "REJECTED") {
    if (decision === "REJECTED") {
      const ok = await confirm({
        title: `${row.name} ablehnen?`,
        text: "Die Anfrage wird geschlossen, es entsteht kein Konto.",
        confirmLabel: "Ablehnen",
        danger: true,
      });
      if (!ok) return;
    }
    const done = await call(`/api/invitations/${row.request_id}`, "PATCH", { decision });
    if (done) toast(decision === "APPROVED" ? `${row.name} freigegeben` : `${row.name} abgelehnt`);
  }

  const empty = approvals.length === 0 && own.length === 0;

  return (
    <>
      <PageHeader
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        title="Einladungen"
        subtitle={
          [
            approvals.length > 0 && `${approvals.length} zur Freigabe`,
            open.length > 0 && plural(open.length, "offener Link", "offene Links"),
            pending.length > 0 && `${pending.length} ${pending.length === 1 ? "wartet" : "warten"}`,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          canCreate ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || Boolean(problem)}
              onClick={() => void create()}
            >
              <IconUserPlus className="h-4 w-4" />
              Einladen
            </button>
          ) : undefined
        }
      />

      {canCreate && problem && (
        <div className="mb-6">
          <Notice icon={<IconInfo className="h-4 w-4" />}>{problem}</Notice>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="min-w-0">
          {empty && (
            <EmptyState
              boxed
              icon={<IconLink className="h-6 w-6" />}
              title="Noch keine Einladungen"
            />
          )}

          {approvals.length > 0 && (
            <>
              <ListLabel>Zur Freigabe</ListLabel>
              {/* Ohne Beschnitt - sonst schneidet die Liste das Menue ab. */}
              <ul className="list list-icons overflow-visible">
                {approvals.map((row) => (
                  <li key={row.request_id} className="cell pr-2">
                    <Avatar name={row.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{row.name}</span>
                      <span className="block truncate text-footnote text-muted">
                        {[row.email, `von ${row.inviter_name}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm shrink-0 px-3 sm:px-4"
                      aria-label={`${row.name} freigeben`}
                      disabled={busy}
                      onClick={() => void decide(row, "APPROVED")}
                    >
                      <IconCheck className="h-4 w-4" />
                      {/* Auf dem Handy reicht der Haken - der Name braucht den Platz. */}
                      <span className="hidden sm:inline">Freigeben</span>
                    </button>
                    <Menu label={`Weitere Aktionen für ${row.name}`}>
                      <MenuItem icon={<IconX className="h-5 w-5" />} tone="danger" onSelect={() => void decide(row, "REJECTED")}>
                        Ablehnen
                      </MenuItem>
                    </Menu>
                  </li>
                ))}
              </ul>
            </>
          )}

          {open.length > 0 && (
            <>
              <ListLabel>Offene Links</ListLabel>
              <ul className="list list-icons overflow-visible">
                {open.map((row) => {
                  const url = () => linkFor(row.token);
                  const until = `Gültig bis ${day(expiry(row))}`;
                  return (
                    <li key={row.id} className="cell pr-2">
                      <span className="glyph">
                        <IconLink className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">Einladung #{row.id}</span>
                        <span className="block truncate text-footnote text-muted">{until}</span>
                      </span>
                      <Menu label={`Aktionen für Einladung ${row.id}`}>
                        <MenuItem icon={<IconLink className="h-5 w-5" />} onSelect={() => void copy(url(), until)}>
                          Link kopieren
                        </MenuItem>
                        {canShare && (
                          <MenuItem icon={<IconShare className="h-5 w-5" />} onSelect={() => void share(url())}>
                            Teilen
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem icon={<IconTrash className="h-5 w-5" />} tone="danger" onSelect={() => void revoke(row)}>
                          Widerrufen
                        </MenuItem>
                      </Menu>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <PeopleGroup label="Wartet auf Freigabe" rows={pending} />
          <PeopleGroup label="Freigegeben" rows={approved} />
          <PeopleGroup
            label="Beendet"
            rows={ended}
            detail={(row) =>
              row.status === "REJECTED" ? "Abgelehnt" : row.revoked_at ? "Widerrufen" : "Abgelaufen"
            }
          />
        </div>

        <aside className="min-w-0">
          {approvedBy && (
            <>
              <ListLabel>Freigabe</ListLabel>
              <ul className="list list-icons">
                <li>
                  <Cell
                    icon={
                      <span className="glyph">
                        <IconShield className="h-4 w-4" />
                      </span>
                    }
                    title={selfApproves ? "Du selbst" : approvedBy}
                    subtitle="Gibt deine Einladungen frei"
                  />
                </li>
              </ul>
            </>
          )}

          <ListLabel>Direkt unter dir</ListLabel>
          {reports.length === 0 ? (
            <p className="list px-4 py-4 text-subhead text-muted">Noch niemand</p>
          ) : (
            <ul className="list list-icons">
              {reports.map((person) => (
                <li key={person.id}>
                  <Cell href={`/profil/${person.id}`} icon={<Avatar name={person.name} size={32} />} title={person.name} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {link && (
        <Sheet
          title="Einladungslink"
          subtitle={link.subtitle}
          onClose={() => setLink(null)}
          footer={
            <div className="grid gap-2">
              {canShare && (
                <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void share(link.url)}>
                  <IconShare className="h-5 w-5" />
                  Teilen
                </button>
              )}
              <button
                type="button"
                className={`btn btn-lg btn-block ${canShare ? "btn-secondary" : "btn-primary"}`}
                onClick={() => void copy(link.url, link.subtitle)}
              >
                <IconLink className="h-5 w-5" />
                Link kopieren
              </button>
            </div>
          }
        >
          <label className="sr-only" htmlFor="invite-link">
            Einladungslink
          </label>
          <input
            id="invite-link"
            className="field"
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
          />
        </Sheet>
      )}

      {dialog}
    </>
  );
}

/** Eigene Einladungen, die schon jemand benutzt hat (oder die vorbei sind). */
function PeopleGroup({
  label,
  rows,
  detail,
}: {
  label: string;
  rows: InvitationRow[];
  detail?: (row: InvitationRow) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <ListLabel>{label}</ListLabel>
      <ul className="list list-icons">
        {rows.map((row) => (
          <li key={row.id}>
            <Cell
              icon={
                row.name ? (
                  <Avatar name={row.name} size={32} />
                ) : (
                  <span className="glyph">
                    <IconLink className="h-4 w-4" />
                  </span>
                )
              }
              title={row.name || `Einladung #${row.id}`}
              subtitle={row.email || undefined}
              detail={detail?.(row)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
