"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Cell, InlineError, ListLabel, Switch, plural } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { TIERS, nextTier, rankLabel, tierIndex } from "@/lib/tiers";
import type { Tier } from "@/lib/types";
import { useRanks } from "./RanksContext";

/**
 * Rang einer Person aendern - nur die Geschaeftsfuehrung. Hoeher: auf Wunsch
 * mit Beitrag im Feed und ein paar Worten dazu; die Person sieht beim
 * naechsten Oeffnen ihre Feier. Niedriger auf einen Rang ohne Team: die Leute
 * der Person wechseln zu ihrer Fuehrungskraft.
 */
export function PromoteSheet({
  person,
  reports = 0,
  managerName = null,
  ready = false,
  onClose,
}: {
  person: { id: number; name: string; tier: Tier };
  /** Leute direkt unter der Person. */
  reports?: number;
  managerName?: string | null;
  /** Alle Ziele fuer den naechsten Rang erreicht - der wird vorgeschlagen. */
  ready?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ranks = useRanks();
  const suggested = ready ? nextTier(person.tier) : null;
  const [tier, setTier] = useState<Tier>(suggested ?? person.tier);
  const [share, setShare] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = person.name.split(/\s+/)[0] || person.name;
  const up = tierIndex(tier) > tierIndex(person.tier);
  const down = tierIndex(tier) < tierIndex(person.tier);
  const losesTeam = down && reports > 0 && !ranks[tier].team;
  const label = rankLabel(tier, ranks);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/team/${person.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier, share: up && share, message: up && share ? message.trim() : "" }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Nicht gespeichert.");
        return;
      }
      toast(`${first} ist jetzt ${label}`);
      router.refresh();
      onClose();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Rang von ${first}`}
      subtitle={`Jetzt ${rankLabel(person.tier, ranks)}`}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || (!up && !down)} onClick={() => void save()}>
            {busy ? "Speichern …" : up ? `Zu ${label} befördern` : down ? `Auf ${label} zurückstufen` : "Rang wählen"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <ListLabel>Rang</ListLabel>
          <ul className="list" role="radiogroup" aria-label="Rang">
            {[...TIERS].reverse().map((option) => (
              <li key={option}>
                <Cell
                  onClick={() => setTier(option)}
                  title={rankLabel(option, ranks)}
                  subtitle={
                    option === person.tier
                      ? "Aktueller Rang"
                      : option === suggested
                        ? "Alle Ziele erreicht"
                        : ranks[option].team
                          ? "Mit Team"
                          : undefined
                  }
                  trailing={option === tier ? <IconCheck className="h-5 w-5 shrink-0 text-accent-ink" /> : undefined}
                  ariaLabel={`${rankLabel(option, ranks)}${option === tier ? ", gewählt" : ""}`}
                />
              </li>
            ))}
          </ul>
        </section>

        {up && (
          <section className="space-y-3">
            <ul className="list">
              <li>
                <Cell
                  title="Im Feed teilen"
                  subtitle="Alle im Team sehen die Beförderung und können gratulieren"
                  wrap
                  trailing={<Switch checked={share} onChange={setShare} label="Im Feed teilen" />}
                />
              </li>
            </ul>
            {share && (
              <div>
                <label className="label" htmlFor="promote-message">
                  Ein paar Worte dazu (optional)
                </label>
                <textarea
                  id="promote-message"
                  className="field min-h-24"
                  maxLength={300}
                  placeholder={`z. B. Stark, ${first} – weiter so!`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            )}
            <p className="list-footer">{first} sieht beim nächsten Öffnen der App den neuen Rang. Die neue Provision gilt sofort.</p>
          </section>
        )}

        {losesTeam && (
          <p className="list-footer">
            {label} hat kein Team. {reports === 1 ? "Die Person" : `Die ${plural(reports, "Person", "Personen")}`} unter {first}{" "}
            {reports === 1 ? "wechselt" : "wechseln"} zu {managerName ?? "der Führungskraft darüber"}.
          </p>
        )}
      </div>
    </Sheet>
  );
}
