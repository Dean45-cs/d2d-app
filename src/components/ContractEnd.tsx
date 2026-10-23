import { contractStatus, normalizeDay } from "@/lib/contracts";
import { IconContacts } from "./icons";

/**
 * Vertragsende als Block links in der Zeile - wie die Uhrzeit unter Termine.
 * Abgelaufen rot, bald faellig in voller Schrift, laufend leise.
 */
export function ContractEndBlock({ end, today }: { end: string | null; today: string }) {
  const day = normalizeDay(end);
  if (!day) {
    return (
      <span className="glyph glyph-lg text-muted" aria-hidden="true">
        <IconContacts className="h-5 w-5" />
      </span>
    );
  }
  const { tone } = contractStatus(day, today);
  const [year, month, date] = day.split("-");
  return (
    <span
      className={`glyph glyph-lg flex-col gap-0 leading-none ${tone === "ended" ? "bg-danger-tint text-danger" : ""}`}
      aria-hidden="true"
    >
      <span className={`text-caption font-bold ${tone === "running" ? "text-muted" : tone === "ended" ? "" : "text-ink"}`}>
        {date}.{month}.
      </span>
      <span className={`text-caption-2 ${tone === "ended" ? "" : "text-muted"}`}>{year}</span>
    </span>
  );
}
