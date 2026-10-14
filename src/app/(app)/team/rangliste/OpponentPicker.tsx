"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Wen man im Direktvergleich neben sich stellt. */
export function OpponentPicker({
  options,
  current,
}: {
  options: Array<{ id: number; name: string }>;
  current: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <>
      <label htmlFor="opponent" className="sr-only">
        Vergleichen mit
      </label>
      <select
        id="opponent"
        className="field min-h-11 w-auto max-w-44 py-2 text-subhead"
        value={current}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          next.set("mit", event.target.value);
          router.push(`${pathname}?${next}`, { scroll: false });
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </>
  );
}
