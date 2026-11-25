"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell, InlineError, ListLabel, PageHeader, Pill, Switch, plural } from "@/components/ui";
import { IconPlus } from "@/components/icons";
import { percentLabel } from "@/lib/commissions/model";
import {
  GOAL_KINDS,
  GOAL_KIND_HINT,
  GOAL_KIND_LABEL,
  GOAL_PERIODS,
  GOAL_PERIOD_LABEL,
  goalSummary,
  goalTargetValid,
  goalUsesPeriod,
  isTeamGoal,
  teamGoalsPossible,
  type GoalKind,
  type GoalPeriod,
  type RankGoal,
} from "@/lib/ranks-model";
import { previousTier, type RankSetup } from "@/lib/tiers";
import type { Tier } from "@/lib/types";
import { parseInput, send } from "../../provisionen/client";

export interface RankRow {
  tier: Tier;
  label: string;
  team: boolean;
  /** Eigener Satz; null: wie der Rang darunter (beim Berater: noch kein Standardsatz). */
  stored: number | null;
  /** Der Satz, der gilt; null ohne Standardsatz. */
  percent: number | null;
  people: number;
  goals: RankGoal[];
}

/**
 * Die vier Raenge von oben nach unten - wie die Leiter. Je Rang ein Blatt
 * mit Name, Satz, Team-Schalter und den Zielen fuer den Aufstieg dorthin.
 */
export function RankSettings({ rows, ranks, canEditPercent }: { rows: RankRow[]; ranks: RankSetup; canEditPercent: boolean }) {
  const [open, setOpen] = useState<Tier | null>(null);
  const top = [...rows].reverse();
  const current = rows.find((row) => row.tier === open) ?? null;

  return (
    <div className="page-narrow">
      <PageHeader title="Ränge" subtitle="Satz, Team und Ziele je Rang" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />

      <ListLabel>Von oben nach unten</ListLabel>
      <ul className="list">
        {top.map((row) => {
          const below = previousTier(row.tier);
          const subtitle = [
            row.percent === null ? (row.tier === "BERATER" ? "Noch kein Satz" : null) : percentLabel(row.percent),
            row.team ? "Team" : null,
            row.tier === "BERATER" ? "Einstieg" : row.goals.length > 0 ? plural(row.goals.length, "Ziel", "Ziele") : "Noch keine Ziele",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={row.tier}>
              <Cell
                onClick={() => setOpen(row.tier)}
                title={row.label}
                subtitle={subtitle}
                detail={row.people > 0 ? plural(row.people, "Person", "Personen") : undefined}
                trailing={row.tier !== "BERATER" && row.goals.length === 0 ? <Pill tone="warn">Ziele fehlen</Pill> : undefined}
                chevron
                ariaLabel={`${row.label}${below ? "" : ", Einstieg"}`}
              />
            </li>
          );
        })}
      </ul>
      <p className="list-footer">
        Für den Aufstieg müssen alle Ziele eines Rangs erfüllt sein. Befördert wird trotzdem von dir – die Person sieht dann
        „Bereit“, ihr Chef bekommt eine Mitteilung. Ein Rang mit Team bekommt an jedem Vertrag seiner Leute die Differenz
        zum höchsten Satz darunter, über alle Ebenen.
      </p>

      {current && (
        <RankSheet
          key={current.tier}
          row={current}
          below={rows.find((row) => row.tier === previousTier(current.tier)) ?? null}
          ranks={ranks}
          canEditPercent={canEditPercent}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function RankSheet({
  row,
  below,
  ranks,
  canEditPercent,
  onClose,
}: {
  row: RankRow;
  below: RankRow | null;
  ranks: RankSetup;
  canEditPercent: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [label, setLabel] = useState(row.label);
  const [percent, setPercent] = useState(row.stored === null ? "" : String(row.stored).replace(".", ","));
  const [team, setTeam] = useState(row.team);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RankGoal | "new" | null>(null);

  const parsed = parseInput(percent);
  const percentValid = parsed === null ? row.tier !== "BERATER" : !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;
  const patch: Record<string, unknown> = {};
  if (label.trim() !== row.label) patch.label = label.trim();
  if (team !== row.team) patch.team = team;
  if (canEditPercent && parsed !== row.stored && percentValid) patch.percent = parsed;
  const changed = Object.keys(patch).length > 0;
  const valid = label.trim().length > 0 && percentValid;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await send(`/api/ranks/${row.tier}`, "PATCH", patch);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(`${label.trim()} gespeichert`);
    router.refresh();
    onClose();
  }

  if (editing) {
    return (
      <GoalSheet
        tier={row.tier}
        rankName={row.label}
        goal={editing === "new" ? null : editing}
        teamPossible={teamGoalsPossible(row.tier, ranks)}
        onBack={() => setEditing(null)}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet
      title={row.label}
      subtitle={row.people > 0 ? plural(row.people, "Person", "Personen") : "Noch niemand"}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || !changed || !valid} onClick={() => void save()}>
            {busy ? "Speichern …" : "Speichern"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="rank-label">
              Name
            </label>
            <input id="rank-label" className="field" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {canEditPercent && (
            <div>
              <label className="label" htmlFor="rank-percent">
                Satz in Prozent der Admin-Provision
              </label>
              <div className="relative">
                <input
                  id="rank-percent"
                  className="field pr-12 tabular-nums"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={below ? `wie ${below.label}${below.percent !== null ? ` · ${String(below.percent).replace(".", ",")}` : ""}` : "z. B. 60"}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">%</span>
              </div>
              <p className="list-footer">
                {row.tier === "BERATER"
                  ? "Der Standardsatz – mit ihm starten alle. Der Vertrieb sieht nur Euro-Beträge."
                  : `Mindestens so viel wie ${below?.label ?? "der Rang darunter"}. Leer: gleich viel.`}
              </p>
            </div>
          )}
          <ul className="list">
            <li>
              <Cell
                title="Darf ein Team haben"
                subtitle={team ? "Bekommt an den Verträgen seiner Leute die Differenz" : "Verkauft selbst, ohne eigene Leute"}
                wrap
                trailing={<Switch checked={team} onChange={setTeam} label="Darf ein Team haben" />}
              />
            </li>
          </ul>
          <p className="list-footer">
            {team ? "Alle Ränge darüber dürfen dann auch ein Team haben." : "Alle Ränge darunter haben dann auch kein Team."}
          </p>
        </div>

        {row.tier === "BERATER" ? (
          <p className="list-footer">Berater ist der Einstieg – Ziele gibt es ab {ranks.SENIOR.label}.</p>
        ) : (
          <section>
            <ListLabel>Ziele für den Aufstieg</ListLabel>
            <ul className="list">
              {row.goals.map((goal) => (
                <li key={goal.id}>
                  <Cell onClick={() => setEditing(goal)} title={goalSummary(goal)} chevron />
                </li>
              ))}
              {row.goals.length < 8 && (
                <li>
                  <Cell
                    onClick={() => setEditing("new")}
                    icon={<IconPlus className="h-5 w-5 text-accent-ink" />}
                    title="Ziel hinzufügen"
                    tone="accent"
                  />
                </li>
              )}
            </ul>
            <p className="list-footer">
              Um {row.label} zu werden, müssen alle Ziele erfüllt sein. Die Leute sehen hier „mehr Provision“, aber keine Beträge.
            </p>
          </section>
        )}
      </div>
    </Sheet>
  );
}

function GoalSheet({
  tier,
  rankName,
  goal,
  teamPossible,
  onBack,
  onClose,
}: {
  tier: Tier;
  rankName: string;
  goal: RankGoal | null;
  teamPossible: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "SALES");
  const [target, setTarget] = useState(goal ? String(goal.target).replace(".", ",") : "");
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? "SINCE_RANK");
  const [months, setMonths] = useState(String(goal?.months ?? 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseInput(target);
  const monthCount = Number(months);
  const valid =
    parsed !== null &&
    goalTargetValid(kind, parsed) &&
    (!goalUsesPeriod(kind) || period !== "LAST_MONTHS" || (Number.isInteger(monthCount) && monthCount >= 1 && monthCount <= 36));

  async function save() {
    setBusy(true);
    setError(null);
    const body = { kind, target: parsed, period, months: period === "LAST_MONTHS" ? monthCount : null };
    const result = goal ? await send(`/api/ranks/goals/${goal.id}`, "PATCH", body) : await send(`/api/ranks/${tier}/goals`, "POST", body);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(goal ? "Ziel gespeichert" : "Ziel hinzugefügt");
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!goal) return;
    const ok = await confirm({ title: "Ziel löschen?", text: goalSummary(goal), confirmLabel: "Löschen", danger: true });
    if (!ok) return;
    setBusy(true);
    const result = await send(`/api/ranks/goals/${goal.id}`, "DELETE");
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast("Ziel gelöscht");
    router.refresh();
    onClose();
  }

  return (
    <>
    <Sheet
      title={goal ? "Ziel ändern" : "Neues Ziel"}
      subtitle={`Für ${rankName}`}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || !valid} onClick={() => void save()}>
            {busy ? "Speichern …" : goal ? "Speichern" : "Hinzufügen"}
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-plain flex-1" onClick={onBack} disabled={busy}>
              Zurück
            </button>
            {goal && (
              <button type="button" className="btn btn-plain flex-1 text-danger" onClick={() => void remove()} disabled={busy}>
                Löschen
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="goal-kind">
            Woran gemessen
          </label>
          <select id="goal-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
            {GOAL_KINDS.map((option) => (
              <option key={option} value={option} disabled={isTeamGoal(option) && !teamPossible}>
                {GOAL_KIND_LABEL[option]}
                {isTeamGoal(option) && !teamPossible ? " (Rang darunter ohne Team)" : ""}
              </option>
            ))}
          </select>
          <p className="list-footer">{GOAL_KIND_HINT[kind]}</p>
        </div>
        <div>
          <label className="label" htmlFor="goal-target">
            {kind === "MONTHS" ? "Monate" : kind === "TEAM_SIZE" ? "Personen" : kind === "TEAM_AVG" ? "Durchschnitt" : "Anzahl"}
          </label>
          <input
            id="goal-target"
            className="field tabular-nums"
            inputMode={kind === "TEAM_AVG" ? "decimal" : "numeric"}
            autoComplete="off"
            placeholder={kind === "MONTHS" ? "z. B. 3" : kind === "TEAM_SIZE" ? "z. B. 3" : "z. B. 50"}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        {goalUsesPeriod(kind) && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="goal-period">
                Zeitraum
              </label>
              <select id="goal-period" className="field" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)}>
                {GOAL_PERIODS.map((option) => (
                  <option key={option} value={option}>
                    {option === "LAST_MONTHS" ? "Letzte … Monate" : GOAL_PERIOD_LABEL[option].replace(/^./, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            {period === "LAST_MONTHS" && (
              <div>
                <label className="label" htmlFor="goal-months">
                  Wie viele Monate zurück
                </label>
                <input
                  id="goal-months"
                  className="field tabular-nums"
                  inputMode="numeric"
                  autoComplete="off"
                  value={months}
                  onChange={(e) => setMonths(e.target.value.replace(/\D/g, "").slice(0, 2))}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
    {dialog}
    </>
  );
}
