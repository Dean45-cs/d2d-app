import { handle } from "@/lib/api";
import { registerInvitation } from "@/lib/invitations";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle(async () => {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Ungültige Registrierung.");
    return registerInvitation((await params).token, body);
  });
}
