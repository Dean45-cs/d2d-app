"use client";

import { useState } from "react";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_TIERS,
  achievementTier,
  sortAchievements,
  type Achievement,
  type AchievementTier,
} from "@/lib/levels";
import {
  IconBolt,
  IconCalendar,
  IconChat,
  IconCheck,
  IconCheckCircle,
  IconDoor,
  IconFlame,
  IconLayers,
  IconTarget,
  IconTrendUp,
  IconTrophy,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Cell, ListLabel, ProgressBar, ProgressRing } from "@/components/ui";
import { Medal } from "./Medal";

const number = (value: number) => value.toLocaleString("de-DE");

const ICONS = {
  doors: IconDoor,
  met: IconChat,
  appointments: IconCalendar,
  sales: IconTrophy,
  stromSales: IconBolt,
  gasSales: IconFlame,
  dualSales: IconLayers,
  completedAppointments: IconCheckCircle,
  activeDays: IconCalendar,
  saleDays: IconTrendUp,
  bestDaySales: IconTarget,
};

/**
 * Abzeichen als Raster runder Medaillen, nach Stufe gruppiert. Erreicht:
 * gepraegt im Metall der Stufe. Offen: leerer Rohling, mit Ring fuer den
 * Fortschritt. Ein Tipp zeigt, was fehlt.
 */
export function Achievements({ achievements }: { achievements: Achievement[] }) {
  const [tier, setTier] = useState<AchievementTier | "all">("all");
  const [open, setOpen] = useState<Achievement | null>(null);
  const ordered = sortAchievements(achievements);
  const unlocked = ordered.filter((entry) => entry.unlocked).length;
  const next = ordered
    .filter((entry) => !entry.unlocked)
    .sort((a, b) => b.current / b.target - a.current / a.target)[0];

  return (
    <section aria-labelledby="achievement-heading">
      <div className="mb-2 flex items-end justify-between gap-4 px-1">
        <h2 id="achievement-heading" className="section-title">
          Abzeichen
        </h2>
        <span className="kpi text-subhead text-muted">
          {unlocked}/{achievements.length}
        </span>
      </div>

      {next && (
        <ul className="list list-icons mb-4">
          <li>
            <Cell
              onClick={() => setOpen(next)}
              icon={<Badge achievement={next} size={40} />}
              title={next.title}
              subtitle={`Nächstes · ${number(Math.min(next.current, next.target))} von ${number(next.target)}`}
              chevron
            />
          </li>
        </ul>
      )}

      <div className="chips mb-4" role="group" aria-label="Stufe">
        <button type="button" className="chip" aria-pressed={tier === "all"} onClick={() => setTier("all")}>
          Alle
        </button>
        {ACHIEVEMENT_TIERS.map((entry) => {
          const badges = achievements.filter((badge) => badge.tier === entry.id);
          return (
            <button
              key={entry.id}
              type="button"
              className="chip"
              aria-pressed={tier === entry.id}
              onClick={() => setTier(entry.id)}
            >
              <Medal tier={entry.id} size={16} />
              {entry.label}
              <span className="font-normal text-muted">
                {badges.filter((badge) => badge.unlocked).length}/{badges.length}
              </span>
            </button>
          );
        })}
      </div>

      {ACHIEVEMENT_TIERS.filter((entry) => tier === "all" || entry.id === tier).map((entry) => {
        const badges = ordered.filter((badge) => badge.tier === entry.id);
        if (!badges.length) return null;
        return (
          <div key={entry.id}>
            <ListLabel>{`${entry.label} · ${entry.difficulty}`}</ListLabel>
            <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-separator sm:grid-cols-4 lg:grid-cols-6">
              {badges.map((achievement) => (
                <li key={achievement.id} className="bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpen(achievement)}
                    className="cell-tap flex h-full w-full flex-col items-center gap-2 px-2 py-4 text-center"
                    aria-label={`${achievement.title}: ${achievement.unlocked ? "erreicht" : `${number(achievement.current)} von ${number(achievement.target)}`}`}
                  >
                    <Badge achievement={achievement} size={56} />
                    <span className="line-clamp-2 text-footnote font-semibold">{achievement.title}</span>
                    <span className="text-caption text-muted">
                      {achievement.unlocked
                        ? "Erreicht"
                        : `${number(Math.min(achievement.current, achievement.target))}/${number(achievement.target)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {open && <AchievementSheet achievement={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Badge({ achievement, size }: { achievement: Achievement; size: number }) {
  const Icon = ICONS[achievement.kind];
  const icon = size >= 96 ? "h-10 w-10" : size >= 56 ? "h-6 w-6" : "h-5 w-5";
  if (achievement.unlocked) {
    return (
      <Medal tier={achievement.tier} size={size}>
        <Icon className={icon} />
      </Medal>
    );
  }
  const stroke = Math.max(3, Math.round(size / 14));
  const blank = size - 2 * stroke - Math.max(4, Math.round(size / 12));
  return (
    <ProgressRing value={achievement.current} max={achievement.target} size={size} stroke={stroke}>
      <span className="medal-blank" style={{ width: blank, height: blank }}>
        <Icon className={`${icon} text-muted`} />
      </span>
    </ProgressRing>
  );
}

function AchievementSheet({ achievement, onClose }: { achievement: Achievement; onClose: () => void }) {
  const current = Math.min(achievement.current, achievement.target);
  const tier = achievementTier(achievement.tier);
  return (
    <Sheet title={achievement.title} subtitle={achievement.description} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-4">
        <Badge achievement={achievement} size={96} />
        {achievement.unlocked ? (
          <p className="flex items-center gap-2 text-headline text-accent-ink">
            <IconCheck className="h-5 w-5" />
            Erreicht
          </p>
        ) : (
          <div className="w-full max-w-xs">
            <p className="kpi mb-2 text-center text-title-2">
              {number(current)}
              <span className="text-subhead font-semibold text-muted"> / {number(achievement.target)} {achievement.unit}</span>
            </p>
            <ProgressBar value={current} max={achievement.target} label={achievement.title} />
          </div>
        )}
      </div>
      <ul className="list">
        <li>
          <Cell title="Stufe" detail={`${tier.label} · ${tier.difficulty}`} />
        </li>
        <li>
          <Cell title="Bereich" detail={ACHIEVEMENT_CATEGORIES.find((entry) => entry.id === achievement.category)?.label} />
        </li>
      </ul>
    </Sheet>
  );
}
