import { requireRole } from "@/lib/auth";
import { handle, optionalNumber, ValidationError } from "@/lib/api";
import { DEFAULT_REFERENCE, setReference } from "@/lib/energy/manual";

export const dynamic = "force-dynamic";

function value(input: unknown, fallback: number, max: number, label: string): number {
  const n = optionalNumber(input);
  if (n === null) return fallback;
  if (n < 0 || n > max) throw new ValidationError(`${label} ist unplausibel.`);
  return n;
}

/** Vergleichswert (Bundesdurchschnitt der Grundversorgung) fuer die Bewertung. */
export async function PUT(request: Request) {
  return handle(async () => {
    const leader = await requireRole("LEADER");
    const body = await request.json();
    if (body.reset) {
      setReference(leader.team_id, DEFAULT_REFERENCE);
      return { ok: true };
    }
    setReference(leader.team_id, {
      stromCt: value(body.stromCt, DEFAULT_REFERENCE.stromCt, 150, "Strom-Arbeitspreis"),
      stromBaseMonth: value(body.stromBaseMonth, DEFAULT_REFERENCE.stromBaseMonth, 200, "Strom-Grundpreis"),
      gasCt: value(body.gasCt, DEFAULT_REFERENCE.gasCt, 150, "Gas-Arbeitspreis"),
      gasBaseMonth: value(body.gasBaseMonth, DEFAULT_REFERENCE.gasBaseMonth, 200, "Gas-Grundpreis"),
    });
    return { ok: true };
  });
}
