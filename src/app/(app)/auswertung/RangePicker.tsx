"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RANGES, type RangeKey } from "./ranges";

export function RangePicker({ current }: { current: RangeKey }) {
  const pathname = usePathname();
  return (
    <div className="flex overflow-hidden rounded-xl border hairline">
      {RANGES.map((range) => (
        <Link
          key={range.key}
          href={`${pathname}?range=${range.key}`}
          className={`px-3 py-2 text-sm font-semibold ${
            current === range.key ? "bg-brand-600 text-white" : ""
          }`}
        >
          {range.label}
        </Link>
      ))}
    </div>
  );
}
