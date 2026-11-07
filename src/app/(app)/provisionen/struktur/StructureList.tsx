"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, Cell, EmptyState, InlineError, ListLabel, Notice, PageHeader, Pill, SegmentedLinks, plural } from "@/components/ui";
import { IconShield, IconUsers } from "@/components/icons";
import { money, percentLabel } from "@/lib/commissions/model";
import type { CommissionStructure, StructurePerson } from "@/lib/commissions/store";
import { parseInput, send } from "../client";

/** "80 % von dir", "80 % von Lisa", "70 %", "Standard" - ohne den Standardsatz zu verraten. */
function settingLabel(person: StructurePerson, viewerId: number, standard: number | null): string {
  if (person.value === null) return standard !== null && person.kind === "RATE" ? `Standard · ${percentLabel(standard)}` : "Standard";
  if (person.kind === "RATE") return percentLabel(person.value);
  return `${percentLabel(person.value)} von ${person.managerId === viewerId ? "dir" : person.managerName ?? "Führungskraft"}`;
}

/**
 * Personen und was sie bekommen. Fuehrungskraefte sehen nur ihre Struktur
 * (eingerueckt nach Ebene) und stellen ihre direkten Leute ein; die
 * Verwaltung sieht das ganze Team.
 */
export function StructureList({ structure, viewerId }: { structure: CommissionStructure; viewerId: number }) {
  const [open, setOpen] = useState<StructurePerson | null>(null);
  const { admin, people } = structure;
  const direct = people.filter((person) => person.editable).length;

  return (
    <div className="page-narrow">
      <PageHeader
        title="Provisionen"
        subtitle={plural(people.length, "Person", "Personen")}
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
      >
        <SegmentedLinks
          ariaLabel="Provisionen"
          current="struktur"
          options={[
            { key: "liste", label: "Liste", href: "/provisionen" },
            { key: "struktur", label: admin ? "Personen" : "Meine Leute", href: "/provisionen/struktur" },
          ]}
        />
      </PageHeader>

      {!structure.configured && admin && (
        <div className="mb-4">
          <Notice>Noch kein Standardsatz – lege ihn unter Provisionsregeln fest.</Notice>
        </div>
      )}

      {people.length === 0 ? (
        <EmptyState boxed icon={<IconUsers className="h-6 w-6" />} title="Noch niemand in deiner Struktur" />
      ) : (
        <>
          <ListLabel>{admin ? "Team" : "Deine Struktur"}</ListLabel>
          <ul className="list list-icons">
            {people.map((person) => (
              <li key={person.id} style={{ paddingLeft: Math.min(person.depth, 4) * 20 }}>
                <Cell
                  onClick={() => setOpen(person)}
                  icon={<Avatar name={person.name} src={person.avatar} size={32} />}
                  title={person.name}
                  subtitle={
                    person.kind === "SHARE"
                      ? `unter ${person.managerId === viewerId ? "dir" : person.managerName ?? "–"}`
                      : "direkt unter der Teamleitung"
                  }
                  detail={settingLabel(person, viewerId, structure.standardPercent)}
                  trailing={!person.active ? <Pill>Deaktiviert</Pill> : undefined}
                  chevron
                />
              </li>
            ))}
          </ul>
          <p className="list-footer">
            {admin
              ? "Persönliche Sätze gelten für Leute direkt unter der Teamleitung. Darunter gibt jede Führungskraft einen Anteil ihrer Provision weiter."
              : `Du legst fest, was ${direct === 1 ? "deine direkte Person" : "deine direkten Leute"} von deiner Provision bekommen. Niemand sieht, was die Ebenen darüber bekommen.`}
          </p>
        </>
      )}

      {open && (
        <PersonSheet
          // Neu gemountet je Person: das Formular startet mit deren Wert.
          key={open.id}
          person={open}
          viewerId={viewerId}
          structure={structure}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function PersonSheet({
  person,
  viewerId,
  structure,
  onClose,
}: {
  person: StructurePerson;
  viewerId: number;
  structure: CommissionStructure;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(person.value === null ? "" : String(person.value).replace(".", ","));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = person.kind === "SHARE";
  const mine = share && person.managerId === viewerId;
  const parsed = parseInput(value);
  const valid = parsed !== null && !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;
  const floor = !structure.admin && share ? structure.minShare : null;
  const quick = share ? [70, 80, 90, 100] : [50, 60, 70, 80];

  async function save(next: number | null) {
    setBusy(true);
    setError(null);
    const result = await send(`/api/commissions/people/${person.id}`, "PUT", { value: next });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(next === null ? `${person.name}: Standard` : `${person.name}: ${percentLabel(next)}`);
    onClose();
    router.refresh();
  }

  const example =
    valid && parsed !== null
      ? share
        ? `Von 100 € ${mine ? "deiner" : `der Provision von ${person.managerName}`} bekommt ${person.name} ${money(parsed)} – ${mine ? "du behältst" : `${person.managerName} behält`} ${money(100 - parsed)}.`
        : `Von 100 € Admin-Provision bekommt ${person.name} ${money(parsed)}${
            structure.standardPercent !== null && parsed !== structure.standardPercent
              ? ` – ${percentLabel(Math.abs(parsed - structure.standardPercent))} ${parsed > structure.standardPercent ? "über" : "unter"} dem Standard, auch bei Ausnahmen`
              : ""
          }.`
      : null;

  return (
    <Sheet
      title={person.name}
      subtitle={share ? (mine ? "Anteil an deiner Provision" : `Anteil an der Provision von ${person.managerName}`) : "Satz der Admin-Provision"}
      onClose={onClose}
      footer={
        person.editable ? (
          <div className="space-y-3">
            {error && <InlineError>{error}</InlineError>}
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || !valid || (floor !== null && parsed !== null && parsed < floor)}
              onClick={() => void save(parsed)}
            >
              {busy ? "Speichern …" : "Speichern"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {person.editable ? (
          <>
            <div>
              <label className="label" htmlFor="person-share">
                {share ? "Anteil in Prozent" : "Satz in Prozent"}
              </label>
              <div className="relative">
                <input
                  id="person-share"
                  className="field pr-12 tabular-nums"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={person.value === null ? "Standard" : ""}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">%</span>
              </div>
              <div className="chips mt-3" role="group" aria-label="Schnell wählen">
                {quick.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="chip"
                    aria-pressed={parsed === option}
                    onClick={() => setValue(String(option))}
                  >
                    {option} %
                  </button>
                ))}
              </div>
              {example && <p className="list-footer">{example}</p>}
              {floor !== null && <p className="list-footer">Mindestens {percentLabel(floor)} – so hat es die Teamleitung festgelegt.</p>}
            </div>
            <ul className="list">
              <li>
                <Cell
                  title="Auf Standard setzen"
                  subtitle={
                    share
                      ? "Wie alle direkt unter der Teamleitung – höchstens so viel, wie " + (mine ? "du bekommst" : `${person.managerName} bekommt`)
                      : structure.standardPercent !== null
                        ? `Standardsatz ${percentLabel(structure.standardPercent)}`
                        : "Noch kein Standardsatz festgelegt"
                  }
                  wrap
                  disabled={busy || person.value === null}
                  onClick={() => void save(null)}
                />
              </li>
            </ul>
          </>
        ) : (
          <Notice icon={<IconShield className="h-5 w-5" />}>
            {person.value === null ? "Standard" : percentLabel(person.value)} – das legt {person.managerName ?? "die Führungskraft"} fest.
          </Notice>
        )}
        <ul className="list">
          <li>
            <Cell href={`/provisionen?person=${person.id}`} title={`Liste von ${person.name} ansehen`} />
          </li>
        </ul>
      </div>
    </Sheet>
  );
}
