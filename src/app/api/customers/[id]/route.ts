import { requirePermission } from "@/lib/permissions";
import { handle, ValidationError } from "@/lib/api";
import { clearCustomer, saveCustomer } from "@/lib/customers";

export const dynamic = "force-dynamic";

/**
 * Kunde eines Abschlusses eintragen, aendern oder als umberaten abhaken.
 * Die ID ist die des Abschlusses (Besuch mit Ergebnis "Abschluss").
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requirePermission("customers.manage");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Ungültige Angaben.");
    return { ok: true, customer: saveCustomer(user, Number(id), body as Record<string, unknown>) };
  });
}

/** Kundendaten entfernen - der Abschluss bleibt in Zahlen, Feed und XP erhalten. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requirePermission("customers.manage");
    const { id } = await params;
    clearCustomer(user, Number(id));
    return { ok: true };
  });
}
