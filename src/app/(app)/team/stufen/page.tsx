import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { hasPermission, structureIds } from "@/lib/permissions";
import { listMembers } from "@/lib/queries";
import { careerFor, loadGoals, loadRanks, rankSince, readyIds } from "@/lib/ranks";
import { firstName } from "@/lib/ranking";
import { goalSummary } from "@/lib/ranks-model";
import { TIERS, rankLabel } from "@/lib/tiers";
import { PageHeader, SegmentedLinks, plural } from "@/components/ui";
import { TEAM_VIEWS } from "../views";
import { CareerLadder, type LadderRung } from "./CareerLadder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Karriere" };

/**
 * Die Karriereleiter: unten Berater, oben Teamleiter. Auf jeder Sprosse die
 * Leute in diesem Rang; die eigene Sprosse ist markiert, die naechste zeigt
 * die Ziele mit Balken. Hoehere Sprossen nennen "mehr Provision" ohne Betrag.
 *
 * Wer bereit fuer den Aufstieg ist, sehen nur die Fuehrungskraefte darueber
 * und die Geschaeftsfuehrung - befoerdern kann nur die Geschaeftsfuehrung.
 */
export default async function CareerPage() {
  const user = await requireUser();
  const ranks = loadRanks(user.team_id);
  const goals = loadGoals(user.team_id);
  const members = listMembers(user.team_id).filter((member) => member.active && member.role === "MEMBER");
  const canPromote = user.role === "LEADER" && hasPermission(user, "team.roles");
  // "Bereit" nur fuer die, deren Fortschritt man sehen darf.
  const visible = user.role === "LEADER" ? null : new Set(structureIds(user));
  const ready = readyIds(user.team_id, goals);
  const career = user.role === "MEMBER" ? careerFor(user, user, ranks) : null;
  const since = user.role === "MEMBER" ? rankSince(user.id) : null;
  const reports = new Map<number, number>();
  for (const member of members) if (member.manager_id !== null) reports.set(member.manager_id, (reports.get(member.manager_id) ?? 0) + 1);
  const byId = new Map(listMembers(user.team_id).map((member) => [member.id, member]));

  const rungs: LadderRung[] = [...TIERS].reverse().map((tier) => ({
    tier,
    label: rankLabel(tier, ranks),
    team: ranks[tier].team,
    goals: goals.filter((goal) => goal.tier === tier).map(goalSummary),
    people: members
      .filter((member) => member.tier === tier)
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map((member) => {
        const seesProgress = visible === null || visible.has(member.id);
        return {
          id: member.id,
          name: member.name,
          first: firstName(member.name),
          avatar: member.avatar,
          me: member.id === user.id,
          ready: seesProgress && ready.has(member.id),
          reports: reports.get(member.id) ?? 0,
          managerName: member.manager_id !== null ? byId.get(member.manager_id)?.name ?? null : null,
        };
      }),
  }));
  const readyPeople = rungs.flatMap((rung) => rung.people.filter((person) => person.ready).map((person) => ({ ...person, tier: rung.tier })));
  const total = members.length;

  return (
    <div className="page">
      <PageHeader
        title="Karriere"
        subtitle={[career ? `du bist ${career.label}` : null, plural(total, "Person", "Personen")].filter(Boolean).join(" · ")}
      >
        <SegmentedLinks ariaLabel="Team" current="stufen" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </PageHeader>

      <CareerLadder rungs={rungs} career={career} since={since} ready={readyPeople} canPromote={canPromote} />
    </div>
  );
}
