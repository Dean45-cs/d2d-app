import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import { FailureThrottle } from "../../src/lib/login-throttle";
import {
  InquiryFieldError,
  PayloadError,
  RATE,
  RateLimitError,
  checkRate,
  countInquiries,
  deleteInquiry,
  getInquiry,
  hasInquiryAccess,
  inquiryEvents,
  isAllowedOrigin,
  listInquiries,
  looksAutomated,
  parseBody,
  parseInquiry,
  purgeInquiries,
  readLimitedBody,
  receiveInquiry,
  updateInquiry,
} from "../../src/lib/inquiries";
import { navigation } from "../../src/lib/nav";
import { permissionsFor } from "../../src/lib/permissions";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-inquiries-"));
const previous = { db: process.env.DATABASE_PATH, origins: process.env.INQUIRY_ALLOWED_ORIGINS };
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.INQUIRY_ALLOWED_ORIGINS = "https://carlssonsales.de, https://www.carlssonsales.de/";
const db = getDb();
after(() => {
  db.close();
  global.__d2dDb = undefined;
  for (const [key, value] of [["DATABASE_PATH", previous.db], ["INQUIRY_ALLOWED_ORIGINS", previous.origins]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Carlsson')").run().lastInsertRowid);
const otherTeam = Number(db.prepare("INSERT INTO teams(name) VALUES ('Fremd')").run().lastInsertRowid);
let sequence = 0;
function person(role: "LEADER" | "MEMBER", teamId = team, active = 1): User {
  const name = `inquiry-${++sequence}`;
  const id = Number(
    db.prepare("INSERT INTO users(team_id, name, email, password_hash, role, active) VALUES (?, ?, ?, '', ?, ?)")
      .run(teamId, name, `${name}@example.test`, role, active).lastInsertRowid,
  );
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}
const leader = person("LEADER");
const member = person("MEMBER");
const colleague = person("MEMBER");
const stranger = person("LEADER", otherTeam);
const inactive = person("MEMBER", team, 0);

const fresh = () => ({ short: new FailureThrottle(15 * 60 * 1000), day: new FailureThrottle(24 * 60 * 60 * 1000) });
let client = 0;
const meta = () => ({ client: `10.0.0.${++client}`, source: "https://carlssonsales.de" });
const valid = (extra: Record<string, unknown> = {}) => ({
  topic: "BERATUNG",
  name: "Erika Mustermann",
  email: `erika${++client}@Example.DE`,
  phone: "+49 171 1234567",
  postalCode: "24103",
  message: "Ich möchte meinen Stromtarif vergleichen lassen.",
  consent: true,
  elapsed: 8000,
  ...extra,
});
function store(extra: Record<string, unknown> = {}): number {
  const result = receiveInquiry(valid(extra), meta(), fresh());
  assert.equal(result.kind, "stored");
  return (result as { id: number }).id;
}

/* ------------------------------ Eingaben ------------------------------- */

test("a complete inquiry is cleaned and accepted", () => {
  const input = parseInquiry(valid({ name: "  Erika \n  Mustermann ", email: " erika@Example.DE ", topic: "bewerbung" }));
  assert.equal(input.name, "Erika Mustermann");
  assert.equal(input.email, "erika@example.de");
  assert.equal(input.topic, "BEWERBUNG");
  assert.equal(input.postalCode, "24103");
});

test("required fields, formats and lengths are enforced field by field", () => {
  const fails = (extra: Record<string, unknown>, field: string) =>
    assert.throws(() => parseInquiry(valid(extra)), (error: unknown) => error instanceof InquiryFieldError && error.field === field);
  fails({ name: "" }, "name");
  fails({ name: "x".repeat(101) }, "name");
  fails({ name: "<script>" }, "name");
  fails({ name: "https://spam.example" }, "name");
  fails({ email: "" }, "email");
  fails({ email: "keine-adresse" }, "email");
  fails({ email: "a b@example.de" }, "email");
  // Weitere Empfaenger im mailto-Link einschmuggeln geht nicht.
  fails({ email: "x?bcc=boese@example.de" }, "email");
  fails({ email: "x&cc=boese@example.de" }, "email");
  fails({ email: "x%40y@example.de" }, "email");
  fails({ email: `${"a".repeat(65)}@example.de` }, "email");
  fails({ phone: "0171 abc" }, "phone");
  fails({ phone: "123" }, "phone");
  fails({ postalCode: "2410" + "3x" }, "postalCode");
  fails({ message: "zu kurz" }, "message");
  fails({ message: "x".repeat(4001) }, "message");
  fails({ consent: false }, "consent");
  fails({ consent: undefined }, "consent");
  fails({ topic: "ADMIN" }, "topic");
});

test("only strings count - arrays, objects and numbers are treated as empty", () => {
  assert.throws(() => parseInquiry(valid({ name: ["Erika", "Mustermann"] })), InquiryFieldError);
  assert.throws(() => parseInquiry(valid({ email: { $ne: "" } })), InquiryFieldError);
  assert.throws(() => parseInquiry(valid({ message: 1234567890123 })), InquiryFieldError);
});

test("control, zero-width and bidi characters are removed", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  const input = parseInquiry(valid({ name: `Eri${zwsp}ka${rlo} Muster`, message: `Hallo${String.fromCharCode(0)} Welt,\r\n\r\n\r\n\r\nbitte melden.` }));
  assert.equal(input.name, "Erika Muster");
  assert.equal(input.message, "Hallo Welt,\n\nbitte melden.");
});

test("umlaut domains are stored in their ASCII form", () => {
  assert.equal(parseInquiry(valid({ email: "kontakt@Müller.de" })).email, "kontakt@xn--mller-kva.de");
});

test("honeypot and too-fast submissions look automated", () => {
  assert.equal(looksAutomated({ website: "http://spam" }), true);
  assert.equal(looksAutomated({ elapsed: 300 }), true);
  assert.equal(looksAutomated({ elapsed: "abc" }), true);
  assert.equal(looksAutomated({ elapsed: 8000 }), false);
  // Ohne JavaScript fehlt die Zeit - dann zaehlt nur der Honigtopf.
  assert.equal(looksAutomated({}), false);
});

/* ------------------------------ Annehmen ------------------------------- */

test("robots get a success answer but nothing is stored", () => {
  const before = countInquiries(leader).open;
  assert.deepEqual(receiveInquiry(valid({ website: "spam" }), meta(), fresh()), { kind: "ignored" });
  assert.deepEqual(receiveInquiry(valid({ elapsed: 100 }), meta(), fresh()), { kind: "ignored" });
  assert.equal(countInquiries(leader).open, before);
});

test("stored inquiries keep no IP address, only a keyed hash", () => {
  const id = store();
  const row = db.prepare("SELECT * FROM inquiries WHERE id = ?").get(id) as Record<string, string>;
  assert.equal(row.team_id, team as unknown as string);
  assert.equal(row.status, "NEW");
  assert.match(row.client_hash, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(row).includes("10.0.0."));
  assert.ok(row.consent_at);
});

test("the same message twice lands only once", () => {
  const body = valid();
  const first = receiveInquiry(body, meta(), fresh());
  const second = receiveInquiry(body, meta(), fresh());
  assert.equal(first.kind, "stored");
  assert.deepEqual(second, { kind: "duplicate", id: (first as { id: number }).id });
});

test("messages full of links go to spam instead of the inbox", () => {
  const id = store({ message: "Super Angebot https://a.example https://b.example www.c.example jetzt kaufen" });
  assert.equal(getInquiry(leader, id).status, "SPAM");
});

test("rate limits apply per client, per e-mail and in total", () => {
  const throttles = fresh();
  for (let i = 0; i < RATE.perClient; i += 1) receiveInquiry(valid(), { client: "1.1.1.1", source: "x" }, throttles);
  assert.throws(() => receiveInquiry(valid(), { client: "1.1.1.1", source: "x" }, throttles), RateLimitError);
  // Auch abgelehnte Versuche zaehlen - die Pruefung laesst sich nicht beliebig abtasten.
  const probing = fresh();
  for (let i = 0; i < RATE.perClient; i += 1) assert.throws(() => receiveInquiry({}, { client: "2.2.2.2", source: "x" }, probing));
  assert.throws(() => receiveInquiry(valid(), { client: "2.2.2.2", source: "x" }, probing), RateLimitError);

  const mail = fresh();
  for (let i = 0; i < RATE.perEmail; i += 1) {
    receiveInquiry(valid({ email: "viel@example.de", message: `Nachricht Nummer ${i} mit Text` }), meta(), mail);
  }
  assert.throws(() => receiveInquiry(valid({ email: "viel@example.de", message: "Noch eine Nachricht hier" }), meta(), mail), RateLimitError);

  const global = fresh();
  for (let i = 0; i < RATE.global; i += 1) checkRate(`3.3.${i}.1`, global);
  assert.throws(() => checkRate("4.4.4.4", global), RateLimitError);
});

/* ------------------------- Herkunft und Koerper ------------------------- */

test("only allowed origins may submit", () => {
  const headers = new Headers({ host: "d2d-app.fly.dev" });
  const prod = { ...process.env, NODE_ENV: "production" as const };
  assert.equal(isAllowedOrigin("https://carlssonsales.de", headers, prod), true);
  assert.equal(isAllowedOrigin("https://www.carlssonsales.de", headers, prod), true);
  assert.equal(isAllowedOrigin("https://d2d-app.fly.dev", headers, prod), true);
  assert.equal(isAllowedOrigin("https://evil.example", headers, prod), false);
  assert.equal(isAllowedOrigin("https://carlssonsales.de.evil.example", headers, prod), false);
  assert.equal(isAllowedOrigin("http://carlssonsales.de", headers, prod), false);
  assert.equal(isAllowedOrigin(null, headers, prod), false);
  assert.equal(isAllowedOrigin("null", headers, prod), false);
  assert.equal(isAllowedOrigin("http://localhost:8080", headers, prod), false);
  assert.equal(isAllowedOrigin("http://localhost:8080", headers, { ...prod, NODE_ENV: "development" as const }), true);
});

test("bodies are size-limited, must be UTF-8 and only known fields pass", async () => {
  const big = new Request("http://x/", { method: "POST", body: "x".repeat(40_000) });
  await assert.rejects(readLimitedBody(big), (error: unknown) => error instanceof PayloadError && error.status === 413);
  const broken = new Request("http://x/", { method: "POST", body: new Uint8Array([0xff, 0xfe, 0xfd]) });
  await assert.rejects(readLimitedBody(broken), (error: unknown) => error instanceof PayloadError && error.status === 400);

  assert.deepEqual(parseBody('{"name":"A","role":"LEADER","__proto__":{"x":1}}', "application/json; charset=utf-8"), { name: "A" });
  assert.deepEqual(parseBody("name=A&name=B&admin=1", "application/x-www-form-urlencoded"), { name: "A" });
  assert.throws(() => parseBody("[1,2]", "application/json"), PayloadError);
  assert.throws(() => parseBody("{", "application/json"), PayloadError);
  assert.throws(() => parseBody("<x/>", "text/xml"), (error: unknown) => error instanceof PayloadError && error.status === 415);
});

/* ---------------------------- Posteingang ------------------------------ */

test("only managers see all inquiries; assignees see exactly theirs", () => {
  const id = store();
  assert.equal(permissionsFor(leader)["inquiries.manage"], true);
  assert.equal(permissionsFor(member)["inquiries.manage"], false);
  assert.ok(listInquiries(leader, { view: "offen" }).some((row) => row.id === id));
  assert.equal(listInquiries(member, { view: "offen" }).length, 0);
  assert.equal(hasInquiryAccess(member), false);
  assert.throws(() => getInquiry(member, id), /nicht gefunden/);
  // Ein anderes Team sieht nichts - und erfaehrt nicht einmal, dass es die Anfrage gibt.
  assert.throws(() => getInquiry(stranger, id), /nicht gefunden/);

  updateInquiry(leader, id, { assignedUserId: member.id });
  assert.equal(hasInquiryAccess(member), true);
  assert.deepEqual(listInquiries(member, { view: "offen" }).map((row) => row.id), [id]);
  assert.equal(getInquiry(member, id).assigned_name, member.name);
  assert.throws(() => getInquiry(colleague, id), /nicht gefunden/);
});

test("assignees work on their inquiry but cannot reassign, mark spam or delete", () => {
  const id = store();
  updateInquiry(leader, id, { assignedUserId: member.id });
  assert.equal(updateInquiry(member, id, { status: "IN_PROGRESS", note: "Angerufen, Rückruf morgen" }).status, "IN_PROGRESS");
  assert.throws(() => updateInquiry(member, id, { assignedUserId: colleague.id }), /zuteilen/);
  assert.throws(() => updateInquiry(member, id, { status: "SPAM" }), /Spam/);
  assert.throws(() => deleteInquiry(member, id), /Löschen/);
  const kinds = inquiryEvents(leader, id).map((event) => event.kind);
  assert.deepEqual(kinds, ["ASSIGN", "STATUS", "NOTE"]);
});

test("assignments only go to active people of the same team; bad input changes nothing", () => {
  const id = store();
  assert.throws(() => updateInquiry(leader, id, { assignedUserId: stranger.id }), /aktiven Team/);
  assert.throws(() => updateInquiry(leader, id, { assignedUserId: inactive.id }), /aktiven Team/);
  assert.throws(() => updateInquiry(leader, id, { assignedUserId: "1 OR 1=1" }), /Ungültige/);
  assert.throws(() => updateInquiry(leader, id, { status: "DELETED" }), /Status/);
  assert.throws(() => updateInquiry(leader, id, { note: "x".repeat(2001) }), /Notiz/);
  assert.equal(getInquiry(leader, id).assigned_user_id, null);
  assert.equal(inquiryEvents(leader, id).length, 0);
  assert.throws(() => updateInquiry(stranger, id, { status: "DONE" }), /nicht gefunden/);
});

test("closing sets closed_at, reopening clears it; deleting removes the history", () => {
  const id = store();
  updateInquiry(leader, id, { status: "DONE" });
  assert.ok(getInquiry(leader, id).closed_at);
  assert.ok(listInquiries(leader, { view: "erledigt" }).some((row) => row.id === id));
  updateInquiry(leader, id, { status: "IN_PROGRESS" });
  assert.equal(getInquiry(leader, id).closed_at, null);
  deleteInquiry(leader, id);
  assert.throws(() => getInquiry(leader, id), /nicht gefunden/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM inquiry_events WHERE inquiry_id = ?").get(id) as { n: number }).n, 0);
});

test("search treats % and _ literally", () => {
  const id = store({ message: "Rabatt 100% auf alles bitte prüfen" });
  assert.ok(listInquiries(leader, { view: "offen", query: "100%" }).some((row) => row.id === id));
  // "_" ist in LIKE ein Platzhalter fuer ein Zeichen - hier gilt es woertlich und findet nichts.
  assert.equal(listInquiries(leader, { view: "offen", query: "_" }).length, 0);
});

test("old spam and closed inquiries are purged, open ones stay", () => {
  const spam = store({ message: "Kauf jetzt https://a.example https://b.example https://c.example" });
  const done = store();
  const open = store();
  updateInquiry(leader, done, { status: "DONE" });
  db.prepare("UPDATE inquiries SET updated_at = datetime('now', '-31 days') WHERE id = ?").run(spam);
  db.prepare("UPDATE inquiries SET closed_at = datetime('now', '-181 days'), updated_at = datetime('now', '-181 days') WHERE id = ?").run(done);
  db.prepare("UPDATE inquiries SET created_at = datetime('now', '-400 days'), updated_at = datetime('now', '-400 days') WHERE id = ?").run(open);
  assert.ok(purgeInquiries() >= 2);
  assert.throws(() => getInquiry(leader, spam), /nicht gefunden/);
  assert.throws(() => getInquiry(leader, done), /nicht gefunden/);
  assert.equal(getInquiry(leader, open).status, "NEW");
});

test("the inbox shows up in the navigation only with the right", () => {
  assert.ok(navigation(leader.role, permissionsFor(leader), leader.id).items.some((item) => item.href === "/anfragen"));
  assert.ok(!navigation(member.role, permissionsFor(member), member.id).items.some((item) => item.href === "/anfragen"));
});

/* ------------------------------- Route --------------------------------- */

test("the public route checks origin, answers preflights and redirects form posts back", async () => {
  const { POST, OPTIONS } = await import("../../src/app/api/public/inquiries/route");
  const request = (origin: string | null, body: string, type = "application/json", ip = `9.9.9.${++client}`) =>
    new Request("https://d2d-app.fly.dev/api/public/inquiries", {
      method: "POST",
      headers: { "content-type": type, host: "d2d-app.fly.dev", "x-forwarded-for": ip, ...(origin ? { origin } : {}) },
      body,
    });

  const blocked = await POST(request("https://evil.example", JSON.stringify(valid())));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  assert.equal((await POST(request(null, JSON.stringify(valid())))).status, 403);

  const preflight = await OPTIONS(new Request("https://d2d-app.fly.dev/api/public/inquiries", { method: "OPTIONS", headers: { origin: "https://carlssonsales.de" } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://carlssonsales.de");
  assert.equal(preflight.headers.get("access-control-allow-credentials"), null);

  const ok = await POST(request("https://carlssonsales.de", JSON.stringify(valid())));
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://carlssonsales.de");

  const invalid = await POST(request("https://carlssonsales.de", JSON.stringify(valid({ email: "nope" }))));
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).field, "email");

  const form = new URLSearchParams({ ...valid(), consent: "on", elapsed: "" } as unknown as Record<string, string>).toString();
  const redirected = await POST(request("https://www.carlssonsales.de", form, "application/x-www-form-urlencoded"));
  assert.equal(redirected.status, 303);
  assert.equal(redirected.headers.get("location"), "https://www.carlssonsales.de/danke.html");
  const failed = await POST(request("https://www.carlssonsales.de", "name=A", "application/x-www-form-urlencoded"));
  assert.equal(failed.headers.get("location"), "https://www.carlssonsales.de/fehler.html");

  const huge = await POST(request("https://carlssonsales.de", JSON.stringify(valid({ message: "x".repeat(40_000) }))));
  assert.equal(huge.status, 413);
});
