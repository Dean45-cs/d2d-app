import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getDb } from "../../src/lib/db";
import {
  confirmationText,
  greeting,
  internationalPhone,
  slotPhrase,
  smsHref,
  whatsappHref,
} from "../../src/lib/confirmation";
import {
  CARD_TOKEN_LENGTH,
  cardPath,
  cardVcard,
  checkedAt,
  foldLine,
  isCardToken,
  memberSince,
  vcardFilename,
  type PublicCard,
} from "../../src/lib/business-card";
import { cardSettings, publicCard, updateCard } from "../../src/lib/card-queries";
import { activeHref, navigation } from "../../src/lib/nav";
import { permissionsFor } from "../../src/lib/permissions";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-card-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

let sequence = 0;
function person(fields: { phone?: string; avatar?: string; active?: number } = {}) {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Stadtwerke Vertrieb')").run().lastInsertRowid);
  const name = `Anna Müller ${++sequence}`;
  return Number(
    db.prepare(`INSERT INTO users(team_id, name, email, password_hash, role, phone, avatar, active, created_at)
      VALUES (?, ?, ?, '', 'MEMBER', ?, ?, ?, '2026-03-14 09:00:00')`)
      .run(team, name, `card-${sequence}@example.test`, fields.phone ?? null, fields.avatar ?? "", fields.active ?? 1)
      .lastInsertRowid,
  );
}

/* ---------------------------- Bestaetigung ------------------------------ */

test("phone numbers become international digits for WhatsApp", () => {
  assert.equal(internationalPhone("0171 123 45 67"), "491711234567");
  assert.equal(internationalPhone("+49 171 1234567"), "491711234567");
  assert.equal(internationalPhone("+49 (0)171 / 123 45-67"), "491711234567");
  assert.equal(internationalPhone("0049 171 1234567"), "491711234567");
  assert.equal(internationalPhone("+43 664 1234567"), "436641234567");
  assert.equal(internationalPhone("0664 1234567", "43"), "436641234567");
  assert.equal(internationalPhone(""), "");
  assert.equal(internationalPhone("12345"), "", "too short to be reachable");
  assert.equal(internationalPhone("0171 1234567 89012345"), "", "longer than E.164");
  assert.equal(internationalPhone("abends anrufen"), "");
  assert.equal(internationalPhone("+49 171 +1234567"), "");
});

test("WhatsApp and SMS links carry the number and the encoded text", () => {
  assert.equal(whatsappHref("0171 1234567", "Hallo & bis bald"), "https://wa.me/491711234567?text=Hallo%20%26%20bis%20bald");
  assert.equal(smsHref("0171 1234567", "Zeile 1\nZeile 2"), "sms:+491711234567?&body=Zeile%201%0AZeile%202");
  assert.equal(whatsappHref("", "Hallo"), "");
  assert.equal(smsHref("kein Telefon", "Hallo"), "");
});

test("the greeting only uses names with more than one word", () => {
  assert.equal(greeting("Frau Müller"), "Guten Tag Frau Müller,");
  assert.equal(greeting("  Familie   Schmidt "), "Guten Tag Familie Schmidt,");
  assert.equal(greeting("Müller"), "Guten Tag,", "a bare surname from the doorbell would sound curt");
  assert.equal(greeting(""), "Guten Tag,");
});

test("the appointment time reads as today or with weekday and date", () => {
  const now = new Date(2026, 9, 27, 15, 0); // Dienstag, 27.10.2026
  assert.equal(slotPhrase("2026-10-27 18:00", now), "heute um 18:00 Uhr");
  assert.equal(slotPhrase("2026-10-28 09:30", now), "am Mittwoch, 28.10., um 09:30 Uhr");
  assert.equal(slotPhrase("2026-11-07 11:00", now), "am Samstag, 07.11., um 11:00 Uhr");
  assert.equal(slotPhrase("kaputt", now), "");
});

test("the confirmation names time, sender and team - and the card only when it is on", () => {
  const now = new Date(2026, 9, 27, 15, 0);
  const base = { contactName: "Frau Müller", slot: "2026-10-28 18:00", senderName: "Max Mustermann", teamName: "Stadtwerke Vertrieb", now };
  const text = confirmationText({ ...base, cardUrl: "https://app.example/k/AbCdEfGhIjKl" });
  assert.equal(
    text,
    [
      "Guten Tag Frau Müller,",
      "",
      "wie besprochen komme ich am Mittwoch, 28.10., um 18:00 Uhr wieder bei Ihnen vorbei – zur Beratung zu Strom und Gas.",
      "Passt es doch nicht? Dann antworten Sie einfach auf diese Nachricht.",
      "",
      "Viele Grüße",
      "Max Mustermann",
      "Stadtwerke Vertrieb",
      "",
      "Meine Visitenkarte: https://app.example/k/AbCdEfGhIjKl",
    ].join("\n"),
  );
  const plain = confirmationText({ ...base, teamName: "" });
  assert.ok(!plain.includes("Visitenkarte"));
  assert.ok(plain.endsWith("Viele Grüße\nMax Mustermann"), "no empty line for a missing team name");
  assert.ok(!/\n\n\n/.test(plain));
});

/* ---------------------------- Visitenkarte ------------------------------ */

test("card tokens are short random words; anything else is not looked up", () => {
  assert.equal(isCardToken("AbCdEfGh_-12"), true);
  assert.equal(isCardToken("AbCdEfGh_-1"), false);
  assert.equal(isCardToken("AbCdEfGh_-123"), false);
  assert.equal(isCardToken("AbCdEfGh/.12"), false);
  assert.equal(isCardToken(42), false);
  assert.equal(cardPath("AbCdEfGh_-12"), "/k/AbCdEfGh_-12");
});

test("a card is off until its owner switches it on; a new link retires the old one", () => {
  const id = person({ phone: " 0171 1234567 " });
  assert.equal(cardSettings(id).token, null);

  const on = updateCard(id, { enabled: true });
  assert.ok(on.token && on.token.length === CARD_TOKEN_LENGTH && isCardToken(on.token));
  assert.equal(on.teamName, "Stadtwerke Vertrieb");
  assert.equal(updateCard(id, { enabled: true }).token, on.token, "switching on again keeps the link");
  assert.ok(publicCard(on.token));

  const renewed = updateCard(id, { renew: true });
  assert.ok(renewed.token && renewed.token !== on.token);
  assert.equal(publicCard(on.token), null, "old QR codes stop working");
  assert.ok(publicCard(renewed.token));

  updateCard(id, { enabled: false });
  assert.equal(cardSettings(id).token, null);
  assert.equal(publicCard(renewed.token), null);
  assert.equal(updateCard(id, { renew: true }).token, null, "renewing a switched-off card does not switch it on");
});

test("the public card shows the phone only on request and nothing for inactive people", () => {
  const id = person({ phone: "0171 1234567", avatar: "data:image/jpeg;base64,AAAA" });
  db.prepare("UPDATE users SET badge_number = 'SW-0815' WHERE id = ?").run(id);
  const token = updateCard(id, { enabled: true }).token!;

  const card = publicCard(token)!;
  assert.equal(card.phone, "", "the number stays private until shown");
  assert.equal(card.badge_number, "SW-0815");
  assert.equal(card.team_name, "Stadtwerke Vertrieb");
  assert.equal(card.avatar, "data:image/jpeg;base64,AAAA");
  assert.equal(updateCard(id, { showPhone: true }).showPhone, true);
  assert.equal(publicCard(token)!.phone, "0171 1234567");

  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(id);
  assert.equal(publicCard(token), null, "people who left the team have no valid card");
  assert.equal(publicCard("not-a-token"), null);
});

test("member since and check time are written in German", () => {
  assert.equal(memberSince("2026-03-14 09:00:00"), "März 2026");
  assert.equal(memberSince(""), "");
  assert.equal(checkedAt(new Date("2026-10-24T12:32:00Z")), "24.10.2026, 14:32 Uhr");
});

test("the contact file is a valid vCard with escaped values, photo and folded lines", () => {
  const card: PublicCard = {
    name: "Anna Maria Müller",
    team_name: "Stadtwerke, Vertrieb; Nord",
    avatar: `data:image/jpeg;base64,${"A".repeat(300)}`,
    phone: "0171 1234567",
    badge_number: "SW-0815",
    created_at: "2026-03-14 09:00:00",
  };
  const vcard = cardVcard(card, "https://app.example/k/AbCdEfGhIjKl");
  const lines = vcard.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCARD");
  assert.equal(lines[1], "VERSION:3.0");
  assert.ok(lines.includes("N:Müller;Anna Maria;;;"));
  assert.ok(lines.includes("FN:Anna Maria Müller"));
  assert.ok(lines.includes("ORG:Stadtwerke\\, Vertrieb\\; Nord"));
  assert.ok(lines.includes("TEL;TYPE=CELL:0171 1234567"));
  assert.ok(lines.includes("URL:https://app.example/k/AbCdEfGhIjKl"));
  assert.ok(lines.includes("NOTE:Ausweis-Nr. SW-0815"));
  assert.ok(vcard.includes("PHOTO;ENCODING=b;TYPE=JPEG:AAAA"));
  assert.ok(vcard.endsWith("END:VCARD\r\n"));
  for (const line of lines) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line.slice(0, 20)}`);
  // Entfaltet ergibt sich wieder das ganze Bild.
  assert.ok(vcard.replace(/\r\n /g, "").includes(`TYPE=JPEG:${"A".repeat(300)}`));

  const bare = cardVcard({ ...card, phone: "", badge_number: "", avatar: "" }, "https://app.example/k/x");
  assert.ok(!bare.includes("TEL") && !bare.includes("NOTE") && !bare.includes("PHOTO"));
});

test("folding never splits an umlaut and the file name is plain ASCII", () => {
  const line = `NOTE:${"ä".repeat(60)}`;
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.equal(vcardFilename("Anna Müller-Groß"), "Anna-Mueller-Gross.vcf");
  assert.equal(vcardFilename("Zoë Ångström"), "Zoe-Angstroem.vcf");
  assert.equal(vcardFilename("???"), "Kontakt.vcf");
});

test("the card settings belong to the profile tab, other people's profiles to the team", () => {
  const id = person();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
  const { tabs } = navigation(user.role, permissionsFor(user), user.id);
  assert.equal(activeHref(tabs, "/profil/visitenkarte"), "/profil");
  assert.equal(activeHref(tabs, `/profil/${user.id}`), "/profil");
  assert.equal(activeHref(tabs, `/profil/${user.id + 1000}`), "/team");
});

test("the QR path draws exactly the dark modules, inside a quiet zone", async () => {
  const { encode } = await import("uqr");
  const { qrPath, QR_QUIET_ZONE } = await import("../../src/lib/qr");
  const text = "https://app.example/k/AbCdEfGhIjKl";
  const { size, data } = encode(text, { ecc: "M", border: 0 });
  const qr = qrPath(text);
  assert.equal(qr.size, size + 2 * QR_QUIET_ZONE);
  const dark = data.flat().filter(Boolean).length;
  const drawn = [...qr.path.matchAll(/h(\d+)v1/g)].reduce((sum, match) => sum + Number(match[1]), 0);
  assert.equal(drawn, dark);
  const starts = [...qr.path.matchAll(/M(\d+) (\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
  assert.ok(starts.every(([x, y]) => x >= QR_QUIET_ZONE && y >= QR_QUIET_ZONE && y < size + QR_QUIET_ZONE));
});
