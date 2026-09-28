import crypto from "node:crypto";
import { getDb, getSetting, setSetting } from "./db";
import { followerIds, getPost, postForVisit } from "./community";
import { isMilestone } from "./ranking";

/*
 * Push-Nachrichten aufs Handy (Web Push, RFC 8030/8291/8292).
 *
 * Ohne zusaetzliche Bibliothek: Verschluesselung und Unterschrift macht
 * node:crypto. Die Schluessel (VAPID) legt die App beim ersten Bedarf selbst
 * an und merkt sie sich in der Datenbank - einrichten muss man nichts. Wer
 * eigene Schluessel hat, traegt sie als VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * ein.
 *
 * Auf dem iPhone kommen Push-Nachrichten nur an, wenn die App ueber
 * "Zum Home-Bildschirm" installiert ist (ab iOS 16.4).
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Wohin ein Tipp auf die Nachricht fuehrt. */
  url: string;
  /** Gleiche Kennung ersetzt eine aeltere Nachricht, statt eine zweite zu zeigen. */
  tag?: string;
}

interface Subscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/*
 * Nur an die bekannten Push-Dienste der Browser senden. Die Adresse kommt
 * vom Geraet - ohne diese Liste koennte jemand den Server Anfragen an
 * beliebige Adressen schicken lassen.
 */
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
  "notify.windows.com",
];

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/* ================================ Schluessel ============================== */

const b64 = (buffer: Buffer) => buffer.toString("base64url");
const unb64 = (text: string) => Buffer.from(text, "base64url");

let vapid: { publicKey: string; key: crypto.KeyObject; subject: string } | null = null;

function loadVapid() {
  if (vapid) return vapid;

  let publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  let privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  if (!publicKey || !privateKey) {
    publicKey = getSetting("vapid_public_key");
    privateKey = getSetting("vapid_private_key");
  }
  if (!publicKey || !privateKey) {
    const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = pair.privateKey.export({ format: "jwk" });
    publicKey = b64(Buffer.concat([Buffer.from([4]), unb64(jwk.x!), unb64(jwk.y!)]));
    privateKey = jwk.d!;
    setSetting("vapid_public_key", publicKey);
    setSetting("vapid_private_key", privateKey);
  }

  const raw = unb64(publicKey);
  const key = crypto.createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: b64(raw.subarray(1, 33)),
      y: b64(raw.subarray(33, 65)),
      d: privateKey,
    },
  });

  // Die Push-Dienste wollen wissen, wen sie bei Problemen erreichen. Apple
  // lehnt Platzhalter ab - deshalb die echte Adresse der Teamleitung.
  const leader = getDb()
    .prepare("SELECT email FROM users WHERE role = 'LEADER' ORDER BY id LIMIT 1")
    .get() as { email: string } | undefined;
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    `mailto:${leader?.email || process.env.SEED_LEADER_EMAIL || "push@example.com"}`;

  vapid = { publicKey, key, subject };
  return vapid;
}

/** Oeffentlicher Schluessel - den braucht das Geraet zum Anmelden. */
export function vapidPublicKey(): string {
  return loadVapid().publicKey;
}

/** Unterschrift fuer den Push-Dienst (VAPID, RFC 8292). */
function authorization(endpoint: string): string {
  const { publicKey, key, subject } = loadVapid();
  const header = b64(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${unsigned}.${b64(signature)}, k=${publicKey}`;
}

/* ============================= Verschluesselung =========================== */

/** Nachricht fuer genau dieses Geraet verschluesseln (aes128gcm, RFC 8291). */
function encrypt(payload: Buffer, p256dh: string, authSecret: string): Buffer {
  const receiverKey = unb64(p256dh);
  const ecdh = crypto.createECDH("prime256v1");
  const senderKey = ecdh.generateKeys();
  const shared = ecdh.computeSecret(receiverKey);

  const ikm = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      shared,
      unb64(authSecret),
      Buffer.concat([Buffer.from("WebPush: info\0"), receiverKey, senderKey]),
      32,
    ),
  );
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 markiert den letzten (hier einzigen) Datensatz.
  const body = Buffer.concat([
    cipher.update(Buffer.concat([payload, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // Kopf: Salz, Datensatzgroesse, Laenge und Inhalt des Absenderschluessels.
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head.writeUInt8(senderKey.length, 20);
  return Buffer.concat([head, senderKey, body]);
}

/* ================================= Senden ================================= */

async function sendTo(subscription: Subscription, message: PushMessage): Promise<"ok" | "gone" | "failed"> {
  const payload = Buffer.from(
    JSON.stringify({
      title: message.title.slice(0, 120),
      body: message.body.slice(0, 300),
      url: message.url,
      tag: message.tag,
    }),
  );
  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization(subscription.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(24 * 3600),
        Urgency: "high",
      },
      body: new Uint8Array(encrypt(payload, subscription.p256dh, subscription.auth)),
      signal: AbortSignal.timeout(10_000),
    });
    // Abgemeldet oder App geloescht: dieses Geraet gibt es nicht mehr.
    if (response.status === 404 || response.status === 410) return "gone";
    if (!response.ok) {
      console.warn(`[push] ${new URL(subscription.endpoint).host}: ${response.status} ${await response.text()}`);
      return "failed";
    }
    return "ok";
  } catch (error) {
    console.warn("[push]", error instanceof Error ? error.message : error);
    return "failed";
  }
}

/** An alle Geraete dieser Personen senden. Fehler bleiben im Protokoll, nie beim Absender. */
export async function pushToUsers(userIds: number[], message: PushMessage): Promise<number> {
  if (userIds.length === 0) return 0;
  const db = getDb();
  const subscriptions = db
    .prepare(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
        WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    )
    .all(...userIds) as Subscription[];

  const results = await Promise.all(subscriptions.map((s) => sendTo(s, message)));
  let delivered = 0;
  results.forEach((result, index) => {
    const { id } = subscriptions[index];
    if (result === "gone") db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(id);
    if (result === "ok") {
      delivered += 1;
      db.prepare("UPDATE push_subscriptions SET last_success = datetime('now') WHERE id = ?").run(id);
    }
  });
  return delivered;
}

export function savePushSubscription(
  userId: number,
  input: { endpoint: string; p256dh: string; auth: string; userAgent: string },
): void {
  // Ein Geraet gehoert immer dem, der zuletzt darauf angemeldet war -
  // sonst bekaeme nach einem Wechsel am geteilten Handy der Falsche Nachrichten.
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id, p256dh = excluded.p256dh,
         auth = excluded.auth, user_agent = excluded.user_agent`,
    )
    .run(userId, input.endpoint, input.p256dh, input.auth, input.userAgent);
}

export function removePushSubscription(userId: number, endpoint: string): void {
  getDb()
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .run(userId, endpoint);
}

/* ============================== Anlaesse ================================== */

const PRODUCT: Record<string, string> = { STROM: "Strom", GAS: "Gas", BEIDES: "Strom + Gas" };

/** Neuer Abschluss: alle, die diese Person abonniert haben, bekommen Bescheid. */
export async function notifySale(visitId: number): Promise<void> {
  const postId = postForVisit(visitId);
  if (!postId) return;
  const row = getDb()
    .prepare("SELECT team_id, user_id FROM posts WHERE id = ?")
    .get(postId) as { team_id: number; user_id: number } | undefined;
  if (!row) return;
  const recipients = followerIds(row.user_id);
  if (recipients.length === 0) return;

  const post = getPost(postId, row.team_id, row.user_id);
  if (!post?.sale) return;
  const where = [PRODUCT[post.sale.energy_type], post.sale.territory_name].filter(Boolean).join(" · ");
  const milestone = isMilestone(post.sale.number) ? ` · Abschluss Nr. ${post.sale.number} 🏅` : "";
  await pushToUsers(recipients, {
    title: `${post.user.name} hat einen Vertrag gemacht 🎉`,
    body: `${where || "Neuer Abschluss"}${milestone} – jetzt gratulieren!`,
    url: `/feed/${postId}`,
    tag: `post-${postId}`,
  });
}

/** Neuer Kommentar: wer den Beitrag geschrieben hat, erfaehrt es. */
export async function notifyComment(
  postId: number,
  author: { id: number; name: string },
  text: string,
): Promise<void> {
  const row = getDb().prepare("SELECT user_id, kind FROM posts WHERE id = ?").get(postId) as
    | { user_id: number; kind: string }
    | undefined;
  if (!row || row.user_id === author.id) return;
  await pushToUsers([row.user_id], {
    title:
      row.kind === "SALE"
        ? `${author.name} hat deinen Abschluss kommentiert`
        : `${author.name} hat deinen Beitrag kommentiert`,
    body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
    url: `/feed/${postId}`,
    tag: `comment-${postId}`,
  });
}

/** Neues Abo: die abonnierte Person erfaehrt, wer ihr jetzt folgt. */
export async function notifyFollow(followeeId: number, follower: { id: number; name: string }): Promise<void> {
  await pushToUsers([followeeId], {
    title: `${follower.name} hat dich abonniert`,
    body: "Bei deinem nächsten Vertrag bekommt das ganze Abo Bescheid.",
    url: `/profil/${follower.id}`,
    tag: `follow-${follower.id}`,
  });
}
