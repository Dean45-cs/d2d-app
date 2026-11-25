import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getLevelDashboard } from "@/lib/level-queries";
import { careerFor } from "@/lib/ranks";
import { Achievements } from "@/components/levels/Achievements";
import { DailyGoals } from "@/components/levels/DailyGoals";
import { RankCard } from "@/components/ranks/RankCard";
import { PageHeader, SegmentedLinks } from "@/components/ui";
import { TEAM_VIEWS } from "../views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Erfolge" };

/**
 * Erfolge: heute (Ringe), der eigene Rang und die Abzeichen. XP und Level
 * gibt es nicht mehr - wer vorne liegt, steht in der Rangliste, wohin es
 * geht, auf der Karriereleiter.
 */
export default async function AchievementsPage() {
  const user = await requireUser();
  const { goals, achievements } = getLevelDashboard(user.team_id, user.id);
  const career = user.role === "MEMBER" ? careerFor(user, user) : null;
  const earned = achievements.filter((achievement) => achievement.unlocked).length;

  return (
    <div className="page">
      <PageHeader title="Erfolge" subtitle={`${earned} von ${achievements.length} Abzeichen`}>
        <SegmentedLinks ariaLabel="Team" current="erfolge" options={TEAM_VIEWS} className="max-w-md seg-tight" />
      </PageHeader>

      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
          <section aria-labelledby="today-heading" className="surface p-4">
            <h2 id="today-heading" className="mb-4 text-headline">
              Heute
            </h2>
            {/* Ziele aus Einstellungen -> Ziele & Erfolge. */}
            <DailyGoals goals={goals} />
          </section>
          {career && <RankCard career={career} />}
        </div>

        <Achievements achievements={achievements} />
      </div>
    </div>
  );
}
