import { requireUser } from "@/lib/auth";
import { handle, optionalText } from "@/lib/api";
import {
  isPushEndpoint,
  removePushSubscription,
  savePushSubscription,
  vapidPublicKey,
} from "@/lib/push";

export const dynamic = "force-dynamic";

/** Oeffentlicher Schluessel, mit dem sich das Geraet beim Push-Dienst anmeldet. */
export async function GET() {
  return handle(async () => {
    await requireUser();
    return { publicKey: vapidPublicKey() };
  });
}

/** Dieses Geraet fuer Push-Nachrichten anmelden (erwartet PushSubscription.toJSON()). */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json();
    const endpoint = optionalText(body.endpoint, 1000);
    const p256dh = optionalText(body.keys?.p256dh, 200);
    const auth = optionalText(body.keys?.auth, 100);
    if (!isPushEndpoint(endpoint) || !p256dh || !auth) {
      throw new Error("Diese Push-Anmeldung kennt die App nicht.");
    }
    savePushSubscription(user.id, {
      endpoint,
      p256dh,
      auth,
      userAgent: optionalText(request.headers.get("user-agent"), 300),
    });
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const endpoint = optionalText(body.endpoint, 1000);
    if (endpoint) removePushSubscription(user.id, endpoint);
    return { ok: true };
  });
}
