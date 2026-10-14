"use client";

import { usePathname } from "next/navigation";
import { SegmentedLinks } from "./ui";
import { RANGES, type RangeKey } from "@/lib/ranges";

/** Zeitraum als Segmentleiste - dieselbe Form wie jede andere Wahl der App. */
export function RangePicker({
  current,
  keep = {},
  className = "",
}: {
  current: RangeKey;
  /** Weitere Parameter, die beim Umschalten stehen bleiben (etwa die Kennzahl). */
  keep?: Record<string, string>;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <SegmentedLinks
      ariaLabel="Zeitraum"
      current={current}
      className={className}
      options={RANGES.map((range) => ({
        key: range.key,
        label: range.label,
        href: `${pathname}?${new URLSearchParams({ ...keep, range: range.key })}`,
      }))}
    />
  );
}
