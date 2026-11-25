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

/** "Teamleiter · 75 %", "Berater · individuell 68 %" - Saetze nur fuer die Verwaltung. */
function settingLabel(person: StructurePerson): string {
  const tier = person.rank;
  if (person.value !== null) return `${tier} · individuell ${percentLabel(person.value)}`;
  return person.percent !== null ? `${tier} · ${percentLabel(person.percent)}` : tier;
}

/**
 * Personen, ihr Rang und was sie bekommen. Ein Rang mit Team sieht seine
 * Struktur; die Verwaltung das ganze Team (eingerueckt nach Ebene) und legt
 * dort individuelle Saetze fest. Den Rang selbst vergibt die
 * Geschaeftsfuehrung unter Mitglieder oder auf der Karriereleiter.
 */
export function StructureList({ structure, viewerId }: { structure: CommissionStructure; viewerId: number }) {
  const [open, setOpen] = useState<StructurePerson | null>(null);
  const { admin, people } = structure;

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
        <EmptyState boxed icon={<IconUsers className="h-6 w-6" />} title={admin ? "Noch niemand im Vertrieb" : "Noch niemand in deinem Team"} />
      ) : (
        <>
          <ListLabel>{admin ? "Team" : "Dein Team"}</ListLabel>
          <ul className="list list-icons">
            {people.map((person) => (
              <li key={person.id} style={{ paddingLeft: Math.min(person.depth, 4) * 20 }}>
                <Cell
                  onClick={() => setOpen(person)}
                  icon={<Avatar name={person.name} src={person.avatar} size={32} />}
                  title={person.name}
                  subtitle={
                    person.managerId === null
                      ? undefined
                      : person.managerId === viewerId
                        ? "Du bekommst die Differenz"
                        : `Differenz an ${person.managerName ?? "Teamleiter"}`
                  }
                  detail={settingLabel(person)}
                  trailing={!person.active ? <Pill>Deaktiviert</Pill> : undefined}
                  chevron
                />
              </li>
            ))}
          </ul>
          <p className="list-footer">
            {admin
              ? "Jede Person bekommt den Satz ihres Rangs. Jede Führungskraft mit Team bekommt an den Verträgen ihrer Leute die Differenz zum höchsten Satz darunter – über alle Ebenen, nie mehr als der Satz der obersten Person."
              : "Deine Leute bekommen den Betrag ihres Rangs. Du bekommst an ihren Verträgen die Differenz zum höchsten Betrag unter dir obendrauf – ihnen wird nichts abgezogen."}
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
  const parsed = parseInput(value);
  const valid = parsed !== null && !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;
  const tierPercent = structure.tiers?.[person.tier] ?? null;
  const tier = person.rank;

  async function save(next: number | null) {
    setBusy(true);
    setError(null);
    const result = await send(`/api/commissions/people/${person.id}`, "PUT", { value: next });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(next === null ? `${person.name}: nach Rang` : `${person.name}: ${percentLabel(next)}`);
    onClose();
    router.refresh();
  }

  const example =
    valid && parsed !== null
      ? `Von 100 € Admin-Provision bekommt ${person.name} ${money(parsed)}${
          tierPercent !== null && parsed !== tierPercent
            ? ` – ${percentLabel(Math.abs(parsed - tierPercent))} ${parsed > tierPercent ? "über" : "unter"} dem Rang ${tier}, auch bei Ausnahmen`
            : ""
        }.`
      : null;

  return (
    <Sheet
      title={person.name}
      subtitle={tierPercent !== null ? `${tier} · ${percentLabel(tierPercent)}` : tier}
      onClose={onClose}
      footer={
        person.editable ? (
          <div className="space-y-3">
            {error && <InlineError>{error}</InlineError>}
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || !valid} onClick={() => void save(parsed)}>
              {busy ? "Speichern …" : "Speichern"}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {person.managerId !== null && (
          <Notice icon={<IconUsers className="h-5 w-5" />}>
            {person.managerId === viewerId
              ? `Von jedem Vertrag von ${person.name} bekommst du die Differenz zu deinem Betrag.`
              : `${person.managerName ?? "Der Teamleiter"} bekommt von jedem Vertrag die Differenz zum eigenen Betrag.`}
          </Notice>
        )}
        {person.editable ? (
          <>
            <div>
              <label className="label" htmlFor="person-rate">
                Individueller Satz in Prozent
              </label>
              <div className="relative">
                <input
                  id="person-rate"
                  className="field pr-12 tabular-nums"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={tierPercent !== null ? `nach Rang · ${String(tierPercent).replace(".", ",")}` : "nach Rang"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">%</span>
              </div>
              {example && <p className="list-footer">{example}</p>}
              <p className="list-footer">
                Nur für Abweichungen vom Rang. Den Rang selbst änderst du unter Mitglieder oder auf der Karriereleiter.
              </p>
            </div>
            <ul className="list">
              <li>
                <Cell
                  title="Nach Rang rechnen"
                  subtitle={
                    tierPercent !== null ? `${tier} · ${percentLabel(tierPercent)}` : "Noch kein Standardsatz festgelegt"
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
            {person.name} ist {tier}. Rang und Provision legt die Geschäftsführung fest.
          </Notice>
        )}
        <ul className="list">
          <li>
            <Cell href={`/provisionen?person=${person.id}`} title={`Liste von ${person.name} ansehen`} />
          </li>
          {person.editable && (
            <li>
              <Cell href="/einstellungen/mitglieder" title="Rang ändern unter Mitglieder" />
            </li>
          )}
        </ul>
      </div>
    </Sheet>
  );
}
