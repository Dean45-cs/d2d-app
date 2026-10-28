"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, InlineError, ListLabel, plural } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export interface GroupPart {
  id: number;
  name: string;
  assignee: string | null;
  avatar: string;
  /** "12 von 30 Häusern" */
  progress: string;
  share: number | null;
  status: string;
}

const STATUS_LABEL: Record<string, string> = { OPEN: "Offen", ACTIVE: "In Arbeit", PAUSED: "Pausiert", DONE: "Fertig" };

/**
 * Die anderen Teile eines aufgeteilten Gebiets: wer wo dran ist, wie weit
 * das Ganze ist - und fuer die Teamleitung der Weg zurueck zu einem Gebiet.
 */
export function GroupParts({
  territoryId,
  groupName,
  parts,
  combined,
  canMerge,
}: {
  territoryId: number;
  groupName: string;
  parts: GroupPart[];
  combined: { label: string; share: number | null };
  canMerge: boolean;
}) {
  const [merging, setMerging] = useState(false);
  const others = parts.filter((part) => part.id !== territoryId);

  return (
    <section>
      <ListLabel>Teilgebiete von „{groupName}“</ListLabel>
      <ul className="list list-icons">
        {parts.map((part) => (
          <li key={part.id}>
            <Cell
              href={part.id === territoryId ? undefined : `/gebiete/${part.id}`}
              current={part.id === territoryId}
              icon={<Avatar name={part.assignee} src={part.avatar} size={36} />}
              title={part.id === territoryId ? `${part.name} · hier` : part.name}
              subtitle={[part.assignee ?? "Nicht zugeteilt", STATUS_LABEL[part.status] ?? part.status, part.progress].join(" · ")}
              detail={part.share !== null ? `${part.share} %` : undefined}
            />
          </li>
        ))}
      </ul>
      <p className="list-footer">
        Zusammen {combined.label}
        {combined.share !== null ? ` · ${combined.share} %` : ""}
      </p>
      {canMerge && others.length > 0 && (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setMerging(true)}>
          Teilgebiete zusammenlegen
        </button>
      )}
      {merging && <MergeSheet territoryId={territoryId} others={others} onClose={() => setMerging(false)} />}
    </section>
  );
}

/** Andere Teile in dieses Gebiet holen - alles zieht mit um, nichts geht verloren. */
function MergeSheet({ territoryId, others, onClose }: { territoryId: number; others: GroupPart[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [chosen, setChosen] = useState<Set<number>>(new Set(others.map((part) => part.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function merge() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/territories/${territoryId}/merge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...chosen] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Teilgebiete nicht zusammengelegt.");
        return;
      }
      toast(`${plural(data.merged ?? chosen.size, "Teilgebiet", "Teilgebiete")} zusammengelegt`);
      onClose();
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Teilgebiete zusammenlegen"
      subtitle="Straßen, Häuser, Klingeln, Sperren und Besuche ziehen in dieses Gebiet um. Die gewählten Teilgebiete gibt es danach nicht mehr."
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => void merge()}
            disabled={busy || chosen.size === 0}
          >
            {busy ? "Zusammenlegen …" : `${plural(chosen.size, "Teilgebiet", "Teilgebiete")} hierher holen`}
          </button>
        </div>
      }
    >
      <ul className="list list-icons">
        {others.map((part) => {
          const on = chosen.has(part.id);
          return (
            <li key={part.id}>
              <Cell
                onClick={() =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(part.id)) next.delete(part.id);
                    else next.add(part.id);
                    return next;
                  })
                }
                ariaLabel={`${part.name} ${on ? "nicht " : ""}zusammenlegen`}
                icon={<Avatar name={part.assignee} src={part.avatar} size={36} />}
                title={part.name}
                subtitle={[part.assignee ?? "Nicht zugeteilt", part.progress].join(" · ")}
                trailing={
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                      on ? "text-accent-ink ring-2 ring-accent" : "ring-2 ring-fill-strong"
                    }`}
                    aria-hidden="true"
                  >
                    {on && <IconCheck className="h-3.5 w-3.5" />}
                  </span>
                }
              />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
