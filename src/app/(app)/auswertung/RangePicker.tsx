"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RANGES, type RangeKey } from "./ranges";

/** Zeitraum als Schalterleiste - dieselbe Form wie jede andere Wahl in der App. */
export function RangePicker({ current }: { current: RangeKey }) {
  const pathname = usePathname();
  return (
    <nav className="seg" aria-label="Zeitraum">
      {RANGES.map((range) => (
        <Link
          key={range.key}
          href={`${pathname}?range=${range.key}`}
          aria-current={current === range.key ? "page" : undefined}
          scroll={false}
        >
          {range.label}
        </Link>
      ))}
    </nav>
  );
}
