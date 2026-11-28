import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { ACADEMY_MODULES } from "@/lib/academy/content";
import { teamAcademy } from "@/lib/academy/store";
import { ModuleGlyph } from "@/components/academy/parts";
import { Avatar, Cell, ListLabel, PageHeader, ToneTile } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stand des Teams" };

/**
 * Wer im Team welches Modul bestanden hat - fuer alle mit dem Recht
 * "Teamauswertung sehen", wie die Uebersicht. Alle aktiven Personen,
 * alphabetisch; je Modul, wie viele es geschafft haben.
 */
export default async function AcademyTeamPage() {
  const user = await requireUser();
  if (!permissionsFor(user)["reports.team"]) redirect("/akademie");
  const { members, modules } = teamAcademy(user.team_id);
  const total = ACADEMY_MODULES.length;
  const complete = members.filter((member) => member.passed === total).length;

  return (
    <div className="page-narrow">
      <PageHeader
        title="Stand des Teams"
        subtitle={`${complete} von ${members.length} ${members.length === 1 ? "Person hat" : "Personen haben"} alles bestanden`}
        back={{ href: "/akademie", label: "Akademie" }}
      />

      <ListLabel>Module</ListLabel>
      <ul className="list list-icons">
        {modules.map((entry, index) => {
          const mod = ACADEMY_MODULES[index];
          return (
            <li key={entry.id}>
              <Cell
                href={`/akademie/${entry.id}`}
                icon={
                  <ToneTile tone={mod.tone}>
                    <ModuleGlyph icon={mod.icon} />
                  </ToneTile>
                }
                title={entry.title}
                detail={`${entry.passed} von ${members.length}`}
              />
            </li>
          );
        })}
      </ul>

      <ListLabel>Personen</ListLabel>
      <ul className="list list-icons">
        {members.map((member) => (
          <li key={member.id}>
            <Cell
              icon={<Avatar name={member.name} src={member.avatar} size={32} />}
              title={member.name}
              subtitle={
                member.passed === total
                  ? "Alles bestanden"
                  : member.lastActivity === null
                    ? "Noch nicht angefangen"
                    : `Offen: ${member.open.join(", ")}`
              }
              wrap
              detail={`${member.passed}/${total}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
