"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell, InlineError, ListLabel, Segmented, SkeletonList } from "@/components/ui";
import { IconChat, IconPhone } from "@/components/icons";
import {
  INQUIRY_STATUS,
  INQUIRY_TOPICS,
  type InquiryEvent,
  type InquiryRow,
  type InquiryStatus,
} from "@/lib/inquiry-labels";
import { telHref } from "@/lib/contracts";
import { sqlDateTime } from "@/lib/format";
import { fetchWithTimeout } from "@/lib/offline-queue";

type Loaded = { inquiry: InquiryRow; events: InquiryEvent[] };

/**
 * mailto-Link fuer die Antwort. Die Adresse ist auf dem Server streng
 * geprueft; kodiert wird trotzdem, damit nichts im Link als Befehl gilt.
 */
function replyHref(row: InquiryRow): string {
  const at = row.email.lastIndexOf("@");
  const address = `${encodeURIComponent(row.email.slice(0, at))}@${encodeURIComponent(row.email.slice(at + 1))}`;
  const subject = encodeURIComponent("Ihre Anfrage bei CarlssonSales");
  const quoted = row.message.split("\n").map((line) => `> ${line}`).join("\n");
  const body = encodeURIComponent(`Guten Tag ${row.name},\n\nvielen Dank für Ihre Nachricht.\n\n\n\n${quoted}`);
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

function eventText(event: InquiryEvent): string {
  if (event.kind === "STATUS") return `Status: ${INQUIRY_STATUS[event.body as InquiryStatus] ?? event.body}`;
  if (event.kind === "ASSIGN") return event.body ? `Zugeteilt an ${event.body}` : "Zuteilung entfernt";
  return event.body;
}

export function InquirySheet({
  id,
  manager,
  assignees,
  onClose,
  onChanged,
}: {
  id: number;
  manager: boolean;
  assignees: Array<{ id: number; name: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetchWithTimeout(`/api/inquiries/${id}`);
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) setError(body.error ?? "Anfrage nicht gefunden.");
        else setData(body as Loaded);
      } catch {
        if (active) setError("Keine Verbindung.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function patch(change: { status?: InquiryStatus; assignedUserId?: number | null; note?: string }, message: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(`/api/inquiries/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "Nicht gespeichert.");
        return false;
      }
      setData(body as Loaded);
      toast(message);
      onChanged();
      return true;
    } catch {
      setError("Keine Verbindung.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (!note.trim() || busy) return;
    if (await patch({ note }, "Notiz gespeichert")) setNote("");
  }

  async function remove() {
    const ok = await confirm({
      title: "Anfrage löschen?",
      text: "Die Anfrage mit Kontaktdaten, Nachricht und Verlauf wird endgültig gelöscht – etwa wenn die Person das wünscht.",
      confirmLabel: "Löschen",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetchWithTimeout(`/api/inquiries/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Nicht gelöscht.");
        return;
      }
      toast("Anfrage gelöscht");
      onChanged();
      onClose();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  const row = data?.inquiry;
  const statusOptions: Array<{ value: InquiryStatus; label: string }> = [
    { value: "NEW", label: "Neu" },
    { value: "IN_PROGRESS", label: "In Arbeit" },
    { value: "DONE", label: "Erledigt" },
  ];

  return (
    <Sheet
      title={row?.name ?? "Anfrage"}
      subtitle={row ? `${INQUIRY_TOPICS[row.topic]} · ${sqlDateTime(row.created_at)}` : undefined}
      onClose={onClose}
      width="lg"
    >
      {!row ? (
        error ? <InlineError>{error}</InlineError> : <SkeletonList rows={3} />
      ) : (
        <>
          <ul className="list list-icons mb-6">
            <li>
              <Cell
                href={replyHref(row)}
                external
                icon={<span className="glyph glyph-round"><IconChat className="h-4 w-4" /></span>}
                title="Per E-Mail antworten"
                subtitle={row.email}
              />
            </li>
            {row.phone && (
              <li>
                <Cell
                  href={telHref(row.phone)}
                  external
                  icon={<span className="glyph glyph-round"><IconPhone className="h-4 w-4" /></span>}
                  title="Anrufen"
                  subtitle={row.phone}
                />
              </li>
            )}
          </ul>

          <ListLabel>Nachricht</ListLabel>
          {/* Reiner Text: React maskiert alles, Umbrueche bleiben sichtbar. */}
          <p className="surface mb-6 whitespace-pre-wrap break-words p-4 text-body">{row.message}</p>

          <ul className="list mb-6">
            <li><Cell title="Anliegen" detail={INQUIRY_TOPICS[row.topic]} /></li>
            {row.postal_code && <li><Cell title="Postleitzahl" detail={row.postal_code} /></li>}
            <li><Cell title="Eingang" detail={sqlDateTime(row.created_at)} /></li>
          </ul>

          <ListLabel>Status</ListLabel>
          {row.status === "SPAM" ? (
            <div className="mb-6 flex items-center justify-between gap-3">
              <span className="text-body text-muted">Als Spam markiert</span>
              <button type="button" className="btn btn-plain btn-sm" disabled={busy} onClick={() => void patch({ status: "NEW" }, "Kein Spam – zurück im Posteingang")}>
                Kein Spam
              </button>
            </div>
          ) : (
            <Segmented
              className="mb-6"
              ariaLabel="Status der Anfrage"
              options={statusOptions}
              value={row.status}
              onChange={(status) => {
                if (!busy && status !== row.status) void patch({ status }, `Status: ${INQUIRY_STATUS[status]}`);
              }}
            />
          )}

          {manager && (
            <div className="mb-6">
              <label className="label" htmlFor="inquiry-assignee">
                Zuständig
              </label>
              <select
                id="inquiry-assignee"
                className="field"
                disabled={busy}
                value={row.assigned_user_id ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : null;
                  void patch({ assignedUserId: value }, value ? "Zugeteilt" : "Zuteilung entfernt");
                }}
              >
                <option value="">Niemand</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <form onSubmit={saveNote} className="mb-6 space-y-2">
            <label className="label" htmlFor="inquiry-note">
              Interne Notiz
            </label>
            <textarea
              id="inquiry-note"
              className="field"
              placeholder="Angerufen, Rückruf morgen 18 Uhr …"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !note.trim()}>
              Notiz speichern
            </button>
          </form>

          {error && <div className="mb-4"><InlineError>{error}</InlineError></div>}

          {data.events.length > 0 && (
            <>
              <ListLabel>Verlauf</ListLabel>
              <ul className="list mb-6">
                {data.events.map((event) => (
                  <li key={event.id}>
                    <Cell
                      wrap
                      title={<span className="whitespace-pre-wrap break-words">{eventText(event)}</span>}
                      subtitle={[event.user_name, sqlDateTime(event.created_at)].filter(Boolean).join(" · ")}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}

          {manager && (
            <div className="space-y-2">
              {row.status !== "SPAM" && (
                <button type="button" className="btn btn-plain btn-block" disabled={busy} onClick={() => void patch({ status: "SPAM" }, "Als Spam markiert")}>
                  Als Spam markieren
                </button>
              )}
              <button type="button" className="btn btn-plain btn-block text-danger" disabled={busy} onClick={() => void remove()}>
                Anfrage löschen
              </button>
            </div>
          )}
        </>
      )}
      {dialog}
    </Sheet>
  );
}
