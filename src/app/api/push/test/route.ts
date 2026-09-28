import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { pushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Probe-Nachricht an die eigenen Geraete - zeigt, ob Push ankommt. */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const delivered = await pushToUsers([user.id], {
      title: "Push ist eingerichtet ✅",
      body: "So sieht es aus, wenn jemand aus deinem Abo einen Vertrag macht.",
      url: "/feed",
      tag: "test",
    });
    if (delivered === 0) {
      throw new Error("Die Nachricht kam bei keinem Gerät an. Bitte Push hier neu einschalten.");
    }
    return { ok: true, delivered };
  });
}
