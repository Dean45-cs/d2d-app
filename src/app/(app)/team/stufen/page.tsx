import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { listMembers } from "@/lib/queries";
import { firstName } from "@/lib/ranking";
import { TIER_LABEL, buildPyramid, type PyramidLevel } from "@/lib/tiers";
import { Avatar, Cell, PageHeader, SegmentedLinks, plural } from "@/components/ui";
import { TEAM_VIEWS } from "../views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stufen" };

/**
 * Wer steht auf welcher Stufe? Eine Pyramide mit Profilbildern: oben die
 * Geschaeftsfuehrung, darunter Teamleiter, Senior Berater und als Basis die
 * Berater. Jedes Bild fuehrt ins Profil; man selbst traegt einen Ring.
 * Saetze stehen hier bewusst nicht - der Vertrieb sieht nur Euro-Betraege.
 */
export default async function TiersPage() {
  const user = await requireUser();
  const levels = buildPyramid(listMembers(user.team_id));
  const total = levels.reduce((sum, level) => sum + level.people.length, 0);
  const canAssign = user.role === "LEADER" && hasPermission(user, "team.roles");

  return (
    <div className="page">
      <PageHeader
        title="Stufen"
        subtitle={[plural(total, "Person", "Personen"), user.role === "MEMBER" ? `du bist ${TIER_LABEL[user.tier]}` : null]
          .filter(Boolean)
          .join(" · ")}
      >
        <SegmentedLinks ariaLabel="Team" current="stufen" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </PageHeader>

      <ol className="pyramid" aria-label="Stufen im Team, von der Spitze zur Basis">
        {levels.map((level, index) => (
          <Step key={level.key} level={level} index={index} viewerId={user.id} />
        ))}
      </ol>
      <p className="list-footer mx-auto max-w-[720px] text-center">
        Wer mehr verkauft, steigt auf. Ab Teamleiter baust du dein eigenes Team auf.
      </p>

      {canAssign && (
        <ul className="list mx-auto mt-6 max-w-[720px]">
          <li>
            <Cell href="/einstellungen/mitglieder" title="Stufen vergeben" subtitle="Unter Mitglieder im Blatt der Person" />
          </li>
        </ul>
      )}
    </div>
  );
}

/** Eine Stufe der Pyramide: Name, Anzahl und die Leute mit Bild. */
function Step({ level, index, viewerId }: { level: PyramidLevel; index: number; viewerId: number }) {
  return (
    <li className="pyramid-step surface" style={{ "--step": index } as CSSProperties}>
      <h2 className="text-headline">
        {level.label}
        {level.people.length > 0 && (
          <>
            {" "}
            <span className="font-normal text-muted" aria-hidden="true">
              {level.people.length}
            </span>
            <span className="sr-only">, {plural(level.people.length, "Person", "Personen")}</span>
          </>
        )}
      </h2>
      {level.people.length === 0 ? (
        <p className="py-2 text-footnote text-muted">Noch frei</p>
      ) : (
        <ul className="pyramid-people">
          {level.people.map((person) => {
            const me = person.id === viewerId;
            return (
              <li key={person.id}>
                <Link
                  href={`/profil/${person.id}`}
                  className="pyramid-person"
                  title={person.name}
                  aria-label={[me ? `${person.name} (du)` : person.name, level.label, person.team > 0 ? `${person.team} im Team` : null]
                    .filter(Boolean)
                    .join(", ")}
                  aria-current={me ? "true" : undefined}
                >
                  <Avatar name={person.name} src={person.avatar} size={48} className={me ? "pyramid-me" : ""} />
                  <span className={`block w-full truncate text-footnote ${me ? "font-semibold text-accent-ink" : ""}`}>
                    {me ? "Du" : firstName(person.name)}
                  </span>
                  {person.team > 0 && <span className="-mt-1 block w-full truncate text-caption text-muted">{person.team} im Team</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
