import Link from "next/link";
import { IconArrowRight, IconTrophy } from "@/components/icons";
import type { LevelProgress } from "@/lib/levels";

const number = (value: number) => value.toLocaleString("de-DE");

/** Pure presentation: safe to reuse on server pages and in the live tour. */
export function LevelBadge({ progress }: { progress: LevelProgress }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ color: "var(--tint)", background: "color-mix(in srgb, var(--tint) 10%, transparent)" }}
      title={progress.title}
    >
      <IconTrophy className="h-3.5 w-3.5" />
      Level {number(progress.level)}
    </span>
  );
}

export function LevelCard({
  progress,
  compact = false,
  href,
  title = "Dein Level",
}: {
  progress: LevelProgress;
  compact?: boolean;
  href?: string;
  title?: string;
}) {
  const content = compact ? (
    <>
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] text-[21px] font-bold tabular-nums"
          style={{ color: "var(--tint)", background: "color-mix(in srgb, var(--tint) 10%, transparent)" }}
          aria-label={`Level ${progress.level}`}
        >
          {number(progress.level)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="muted text-[11.5px] font-medium">{title} · {number(progress.totalXp)} XP</p>
          <p className="truncate text-[15px] font-semibold">{progress.title}</p>
        </div>
        {href && <IconArrowRight className="h-4 w-4 shrink-0 text-tint" />}
      </div>
      <div className="mt-3">
        <LevelMeter progress={progress} />
        <p className="muted mt-1.5 text-[12px]">
          Noch <span className="font-medium tabular-nums">{number(progress.xpToNextLevel)} XP</span> bis Level {number(progress.level + 1)}
        </p>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-medium text-white/70">{title}</p>
          <p className="mt-2 text-[46px] font-bold leading-none tracking-tight tabular-nums sm:text-[56px]">
            <span className="mr-2 text-[20px] font-medium text-white/70">Level</span>
            {number(progress.level)}
          </p>
          <p className="mt-2 text-[20px] font-semibold">{progress.title}</p>
        </div>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--r-lg)] bg-white/10" aria-hidden>
          <IconTrophy className="h-7 w-7" />
        </span>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex flex-wrap justify-between gap-1 text-[12.5px]">
          <span className="font-semibold tabular-nums">{number(progress.totalXp)} XP insgesamt</span>
          <span className="text-white/70">Level {number(progress.level + 1)} ab {number(progress.nextLevelXp)} XP</span>
        </div>
        <LevelMeter progress={progress} light />
        <p className="mt-2 text-[13px] text-white/80">
          Noch <span className="font-semibold text-white">{number(progress.xpToNextLevel)} XP</span> zum nächsten Level.
        </p>
      </div>
    </>
  );

  const className = `card block ${compact ? "p-4" : "p-5 text-white sm:p-6"} ${href ? "transition-shadow hover:shadow-md" : ""}`;
  const style = compact ? undefined : { background: "var(--brand-900)", borderColor: "transparent" };
  return href ? (
    <Link href={href} className={className} style={style}>{content}</Link>
  ) : (
    <section aria-label={title} className={className} style={style}>{content}</section>
  );
}

function LevelMeter({ progress, light = false }: { progress: LevelProgress; light?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label={`Fortschritt zu Level ${progress.level + 1}`}
      aria-valuemin={0}
      aria-valuemax={progress.xpForNextLevel}
      aria-valuenow={progress.xpInLevel}
      aria-valuetext={`${number(progress.xpInLevel)} von ${number(progress.xpForNextLevel)} XP`}
      className="h-2 overflow-hidden rounded-full"
      style={{ background: light ? "rgb(255 255 255 / 0.18)" : "color-mix(in srgb, var(--ink) 10%, transparent)" }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%`, background: light ? "var(--energy-400)" : "var(--brand-500)" }}
      />
    </div>
  );
}
