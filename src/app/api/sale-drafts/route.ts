import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { changeSaleDraft, listSaleDrafts } from "@/lib/sale-drafts";
import { notifySale } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ drafts: listSaleDrafts(await requireUser()) }));
}

export async function POST(request: Request) {
  return handle(async () => {
    const result = changeSaleDraft(await requireUser(), await request.json());
    if (result.status === "CONFIRMED" && !result.replayed && "id" in result && result.id != null) {
      const id = result.id;
      after(() => notifySale(id).catch((error) => console.warn("[push] Abschluss:", error)));
    }
    return result;
  });
}
