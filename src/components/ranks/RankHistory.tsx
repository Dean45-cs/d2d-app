import { ListLabel } from "@/components/ui";
import { rankLabel, tierIndex, type RankSetup } from "@/lib/tiers";
import type { RankHistoryEntry } from "@/lib/ranks";
import { monthYear } from "@/lib/format";

/** Der Rang-Verlauf, neuester Rang oben: "Senior Berater · seit September 2026". */
export function RankHistory({ entries, ranks }: { entries: RankHistoryEntry[]; ranks: RankSetup }) {
  if (entries.length === 0) return null;
  const newest = [...entries].reverse();
  return (
    <section>
      <ListLabel>Verlauf</ListLabel>
      <ol className="rank-history surface">
        {newest.map((entry, index) => {
          const down = entry.from !== null && tierIndex(entry.tier) < tierIndex(entry.from);
          return (
            <li key={`${entry.at}-${index}`} className="rank-history-item" data-current={index === 0 ? "true" : undefined}>
              <span className="rank-history-dot" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body">{rankLabel(entry.tier, ranks)}</span>
                <span className="block text-footnote text-muted">
                  {entry.from === null ? "Einstieg" : down ? "Zurückgestuft" : "Aufgestiegen"} · {index === 0 ? "seit" : "ab"} {monthYear(entry.at)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
