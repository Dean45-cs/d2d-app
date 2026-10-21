"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { ReasonTile } from "@/components/ReasonIcon";
import { IconChat, IconChevronDown, IconChevronUp, IconPlus } from "@/components/icons";
import { Cell, EmptyState, InlineError, ListLabel, PageHeader, Switch } from "@/components/ui";
import { DEFAULT_REASON_ICON, REASON_ICONS, reasonIcon } from "@/lib/reason-icons";
import type { RejectionReason } from "@/lib/types";

type Patch = { label?: string; icon?: string; active?: number; sortOrder?: number };

async function patchReason(id: number, body: Patch): Promise<string | null> {
  try {
    const response = await fetch(`/api/reasons/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data.error ?? "Nicht gespeichert.";
  } catch {
    return "Keine Verbindung.";
  }
}

/**
 * Die Gruende, die das Team an der Tuer antippt - in der Reihenfolge der
 * Ergebnisleiste. Antippen bearbeitet, "Sortieren" verschiebt, "+" legt an.
 */
export function ReasonSettings({ reasons }: { reasons: RejectionReason[] }) {
  const router = useRouter();
  const toast = useToast();
  // Verschieben zeigt sofort die neue Reihenfolge; neue Serverdaten ersetzen sie.
  const [items, setItems] = useState(reasons);
  const [source, setSource] = useState(reasons);
  if (source !== reasons) {
    setSource(reasons);
    setItems(reasons);
  }
  const [sorting, setSorting] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [sheet, setSheet] = useState<RejectionReason | "new" | null>(null);

  const active = items.filter((reason) => reason.active);
  const hidden = items.filter((reason) => !reason.active);

  /** Zwischen die Nachbarn der Gruppe schieben - ein einziger Aufruf. */
  async function move(group: RejectionReason[], index: number, step: -1 | 1) {
    const target = index + step;
    if (target < 0 || target >= group.length || pending !== null) return;
    const near = group[target].sort_order;
    const far = group[target + step]?.sort_order;
    const sortOrder = far === undefined ? near + step : (near + far) / 2;
    const reason = group[index];
    const previous = items;
    setItems(
      items
        .map((item) => (item.id === reason.id ? { ...item, sort_order: sortOrder } : item))
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, "de")),
    );
    setPending(reason.id);
    const failure = await patchReason(reason.id, { sortOrder });
    setPending(null);
    if (failure) {
      setItems(previous);
      toast(failure);
      return;
    }
    router.refresh();
  }

  function rows(group: RejectionReason[]) {
    return group.map((reason, index) => (
      <li key={reason.id}>
        {sorting ? (
          <Cell
            icon={<ReasonTile name={reason.icon} />}
            title={reason.label}
            trailing={
              <span className="-mr-2 flex shrink-0">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void move(group, index, -1)}
                  disabled={index === 0 || pending !== null}
                  aria-label={`${reason.label} nach oben`}
                >
                  <IconChevronUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => void move(group, index, 1)}
                  disabled={index === group.length - 1 || pending !== null}
                  aria-label={`${reason.label} nach unten`}
                >
                  <IconChevronDown className="h-5 w-5" />
                </button>
              </span>
            }
          />
        ) : (
          <Cell
            onClick={() => setSheet(reason)}
            icon={<ReasonTile name={reason.icon} />}
            title={reason.label}
            subtitle={reason.hint || undefined}
            chevron
          />
        )}
      </li>
    ));
  }

  return (
    <div className="page-narrow">
      <PageHeader
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        title="Ablehnungsgründe"
        subtitle={[`${active.length} an der Tür`, hidden.length > 0 && `${hidden.length} ausgeblendet`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {items.length > 1 && (
              <button
                type="button"
                className="btn btn-plain btn-sm"
                aria-pressed={sorting}
                onClick={() => setSorting((on) => !on)}
              >
                {sorting ? "Fertig" : "Sortieren"}
              </button>
            )}
            {!sorting && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                aria-label="Grund hinzufügen"
                onClick={() => setSheet("new")}
              >
                <IconPlus className="h-4 w-4" />
                Neu
              </button>
            )}
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState boxed icon={<IconChat className="h-6 w-6" />} title="Noch keine Gründe" />
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <ListLabel>An der Tür</ListLabel>
              <ul className="list list-icons">{rows(active)}</ul>
            </section>
          )}
          {hidden.length > 0 && (
            <section>
              <ListLabel>Ausgeblendet</ListLabel>
              <ul className="list list-icons">{rows(hidden)}</ul>
            </section>
          )}
        </div>
      )}

      {sheet && (
        <ReasonSheet reason={sheet === "new" ? null : sheet} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

/** Anlegen oder bearbeiten: Zeichen, Bezeichnung, an der Tuer sichtbar. */
function ReasonSheet({ reason, onClose }: { reason: RejectionReason | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  // Gespeicherte Werte, die es (nicht mehr) gibt, zeigen das Standardzeichen.
  const [icon, setIcon] = useState(reason ? reasonIcon(reason.icon).key : DEFAULT_REASON_ICON);
  const [label, setLabel] = useState(reason?.label ?? "");
  const [active, setActive] = useState(reason ? Boolean(reason.active) : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nur Geaendertes geht an den Server - und kann so auch zurueck.
  const patch: Patch = {};
  if (reason) {
    if (label.trim() !== reason.label) patch.label = label.trim();
    if (icon !== reasonIcon(reason.icon).key) patch.icon = icon;
    if (active !== Boolean(reason.active)) patch.active = active ? 1 : 0;
  }
  const changed = reason ? Object.keys(patch).length > 0 : true;
  const ready = label.trim().length > 0 && changed;

  async function create() {
    try {
      const response = await fetch("/api/reasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, icon }),
      });
      if (response.ok) return null;
      const data = await response.json().catch(() => ({}));
      return (data.error as string | undefined) ?? "Grund nicht angelegt.";
    } catch {
      return "Keine Verbindung.";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const failure = reason ? await patchReason(reason.id, patch) : await create();
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (reason) {
      const previous: Patch = {};
      if (patch.label !== undefined) previous.label = reason.label;
      if (patch.icon !== undefined) previous.icon = reasonIcon(reason.icon).key;
      if (patch.active !== undefined) previous.active = reason.active ? 1 : 0;
      toast("Grund gespeichert", {
        action: {
          label: "Rückgängig",
          onClick: () => {
            void patchReason(reason.id, previous).then((undoFailure) => {
              toast(undoFailure ?? "Rückgängig gemacht");
              router.refresh();
            });
          },
        },
      });
    } else {
      toast("Grund angelegt");
    }
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title={reason ? "Grund bearbeiten" : "Neuer Grund"}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="submit" form="reason-form" className="btn btn-primary btn-lg btn-block" disabled={busy || !ready}>
            {busy ? "Speichern …" : reason ? "Speichern" : "Anlegen"}
          </button>
        </div>
      }
    >
      <form id="reason-form" onSubmit={submit} className="space-y-6">
        <div className="flex items-end gap-3">
          <ReasonTile name={icon} size="lg" />
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="reason-label">
              Bezeichnung
            </label>
            <input
              id="reason-label"
              className="field"
              placeholder="z. B. Wohnt zur Untermiete"
              maxLength={80}
              autoComplete="off"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
        </div>
        <IconPicker value={icon} onChange={setIcon} />
        {reason && (
          <ul className="list">
            <li>
              <Cell
                title="An der Tür zeigen"
                trailing={<Switch checked={active} onChange={setActive} label="An der Tür zeigen" />}
              />
            </li>
          </ul>
        )}
      </form>
    </Sheet>
  );
}

/**
 * Zeichen waehlen: Raster aller Kacheln als Optionsgruppe. Pfeiltasten
 * wandern wie bei Optionsfeldern; nur die gewaehlte Kachel ist per Tab
 * erreichbar.
 */
function IconPicker({ value, onChange }: { value: string; onChange: (key: (typeof REASON_ICONS)[number]["key"]) => void }) {
  const index = Math.max(0, REASON_ICONS.findIndex((entry) => entry.key === value));

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + REASON_ICONS.length) % REASON_ICONS.length;
    onChange(REASON_ICONS[next].key);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <div>
      <p className="label" id="reason-icon-label">
        Zeichen
      </p>
      <div
        role="radiogroup"
        aria-labelledby="reason-icon-label"
        className="grid grid-cols-6 gap-1 rounded-xl bg-surface p-2 sm:grid-cols-9"
        onKeyDown={onKeyDown}
      >
        {REASON_ICONS.map((entry, i) => (
          <button
            key={entry.key}
            type="button"
            role="radio"
            aria-checked={entry.key === value}
            aria-label={entry.label}
            title={entry.label}
            tabIndex={i === index ? 0 : -1}
            className="icon-pick"
            onClick={() => onChange(entry.key)}
          >
            <ReasonTile name={entry.key} />
          </button>
        ))}
      </div>
    </div>
  );
}
