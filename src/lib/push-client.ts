/*
 * Push-Nachrichten im Browser ein- und ausschalten.
 *
 * Gegenstueck zu src/lib/push.ts auf dem Server. Der Service Worker
 * (public/sw.js) nimmt die Nachrichten entgegen und zeigt sie an.
 */

export type PushState =
  /** Browser kann kein Web Push. */
  | "unsupported"
  /** iPhone/iPad im Safari-Tab: Push gibt es erst nach "Zum Home-Bildschirm". */
  | "ios-install"
  /** In der Entwicklung laeuft kein Service Worker. */
  | "dev"
  /** Mitteilungen wurden in den Einstellungen des Geraets verboten. */
  | "denied"
  | "off"
  | "on";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // Das iPad meldet sich seit iPadOS 13 als Mac - verraten wird es vom Touchscreen.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // Die App meldet ihn im Produktionsbetrieb selbst an (ServiceWorker.tsx);
  // kommt man schneller hierher, uebernimmt das diese Stelle.
  if (process.env.NODE_ENV !== "production") return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "dev";
  const subscription = await reg.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

/**
 * Push einschalten. Muss direkt aus einem Tipp heraus aufgerufen werden:
 * Safari fragt nur dann nach der Erlaubnis - deshalb steht die Frage ganz vorn.
 */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const reg = await registration();
  if (!reg) return "dev";
  await navigator.serviceWorker.ready;

  const response = await fetch("/api/push");
  if (!response.ok) throw new Error("Push ist gerade nicht erreichbar.");
  const { publicKey } = (await response.json()) as { publicKey: string };
  const key = base64UrlToBytes(publicKey);

  let subscription = await reg.pushManager.getSubscription();
  // Hat der Server neue Schluessel, taugt die alte Anmeldung nicht mehr.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  try {
    subscription ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
  } catch {
    // Die Meldungen der Browser sind englisch und helfen an der Tuer niemandem.
    throw new Error(
      "Der Push-Dienst des Browsers hat die Anmeldung abgelehnt. Bitte später noch einmal versuchen.",
    );
  }

  await sendSubscription(subscription);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/push", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return pushState();
}

/**
 * Die Anmeldung dieses Geraets erneut beim Server hinterlegen - etwa nach
 * einem Wechsel des Kontos auf einem geteilten Handy. Schadet nie.
 */
export async function syncPush(): Promise<void> {
  if (!supported() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) await sendSubscription(subscription).catch(() => undefined);
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const response = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Anmeldung für Push fehlgeschlagen.");
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null, expected: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((b, i) => b === expected[i]);
}

/** Erklaerung zum Zustand - kurz, in der Sprache des Aussendiensts. */
export const PUSH_HINT: Record<PushState, string> = {
  unsupported: "Dieser Browser kann keine Push-Nachrichten empfangen.",
  "ios-install":
    "Auf dem iPhone kommen Push-Nachrichten nur in der installierten App an: Teilen → „Zum Home-Bildschirm“, dann hier einschalten.",
  dev: "Push läuft nur im Produktionsbetrieb (npm run build && npm start).",
  denied:
    "Mitteilungen sind für diese App ausgeschaltet. Bitte in den Einstellungen des Geräts erlauben.",
  off: "Bekomme eine Nachricht, sobald jemand aus deinem Abo einen Vertrag macht.",
  on: "Du bekommst eine Nachricht, sobald jemand aus deinem Abo einen Vertrag macht.",
};
