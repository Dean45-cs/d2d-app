import { requireUser } from "@/lib/auth";
import { handle, ValidationError } from "@/lib/api";
import { deleteInquiry, getInquiry, inquiryEvents, updateInquiry } from "@/lib/inquiries";

export const dynamic = "force-dynamic";

/** Eine Website-Anfrage mit Verlauf - fuer wen sie sichtbar ist, entscheidet inquiries.ts. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = Number((await params).id);
    return { inquiry: getInquiry(user, id), events: inquiryEvents(user, id) };
  });
}

/** Status, Zuteilung oder Notiz: { status?, assignedUserId?, note? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ValidationError("Ungültige Angaben.");
    const inquiry = updateInquiry(user, id, body as Record<string, unknown>);
    return { inquiry, events: inquiryEvents(user, id) };
  });
}

/** Endgueltig loeschen - nur mit dem Recht "Website-Anfragen bearbeiten". */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    deleteInquiry(user, Number((await params).id));
    return { ok: true };
  });
}
