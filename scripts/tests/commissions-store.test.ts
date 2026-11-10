import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { getDb } from "../../src/lib/db";
import { AuthError } from "../../src/lib/auth";
import { ValidationError } from "../../src/lib/api";
import { hasPermission, permissionsFor } from "../../src/lib/permissions";
import { isPermission } from "../../src/lib/permission-definitions";
import { navigation } from "../../src/lib/nav";
import { readXlsx, XlsxError } from "../../src/lib/commissions/xlsx";
import { datesFromLabel, labelFromFileName, readCommissionTable, type ImportRow } from "../../src/lib/commissions/table";
import {
  checkImportRows,
  commissionCounts,
  commissionStructure,
  commissionView,
  commitCommissionImport,
  createCommissionBonus,
  loadTariffs,
  previewCommissionImport,
  saveCommissionRule,
  saveCommissionSettings,
  setPersonCommission,
  updateCommissionBonus,
  updateCommissionTariff,
} from "../../src/lib/commissions/store";
import type { User } from "../../src/lib/types";

const directory = mkdtempSync(path.join(tmpdir(), "d2d-commissions-"));
const previous = process.env.DATABASE_PATH;
process.env.DATABASE_PATH = path.join(directory, "test.db");
const db = getDb();
after(() => {
  db.close(); global.__d2dDb = undefined;
  if (previous === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = previous;
  rmSync(directory, { recursive: true, force: true });
});

const DAY = "2026-11-07";
let sequence = 0;
const user = (id: number) => db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;

/**
 * Geschaeftsfuehrung -> Lisa (Teamleiterin) -> Tom (Berater), Max (Senior Berater) und Mia (Teamleiterin) -> Ole.
 * Paul direkt unter der Geschaeftsfuehrung, dazu ein fremdes Team.
 */
function fixture() {
  const team = Number(db.prepare("INSERT INTO teams(name) VALUES ('Provisionen')").run().lastInsertRowid);
  const other = Number(db.prepare("INSERT INTO teams(name) VALUES ('Fremd')").run().lastInsertRowid);
  const add = (name: string, manager: number | null, tier = "BERATER", role = "MEMBER", teamId = team) => {
    const handle = `${name}-${++sequence}`;
    return Number(db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role, tier) VALUES (?, ?, ?, ?, '', ?, ?)")
      .run(teamId, manager, name, `${handle}@example.test`, role, tier).lastInsertRowid);
  };
  const leader = add("Geschäftsführung", null, "BERATER", "LEADER");
  const lisa = add("Lisa", leader, "TEAMLEITER");
  const tom = add("Tom", lisa);
  const max = add("Max", lisa, "SENIOR");
  const mia = add("Mia", lisa, "TEAMLEITER");
  const ole = add("Ole", mia);
  const paul = add("Paul", leader);
  const outsider = add("Fremde Leitung", null, "BERATER", "LEADER", other);
  return { team, leader, lisa, tom, max, mia, ole, paul, outsider };
}

const row = (provider: string, name: string, base: number, patch: Partial<ImportRow> = {}): ImportRow => ({
  line: 2, provider, name, kwhFrom: 1, kwhTo: 100000, base, promo: 0, follow: 0, payoutConclusion: 1, payoutConnection: 0, ...patch,
});
const LIST: ImportRow[] = [
  row("Lichtwerk", "Licht Ökostrom 24", 150),
  row("Ostwerk", "Ost Strom 24", 100, { promo: 40 }),
  row("Gaswerk", "Gaswerk Business Gas", 150, { kwhTo: 25000 }),
  row("Gaswerk", "Gaswerk Business Gas", 200, { kwhFrom: 25001, kwhTo: 100000 }),
  row("Paketwerk", "Home Paket 12", 80),
  row("Spotwerk", "Spot Gas RLM Gewerbekunden", 0.001, { kwhFrom: 0, kwhTo: 1000000, payoutConclusion: 0, payoutConnection: 1 }),
  // Ein unverwechselbarer Admin-Betrag: taucht er in einer Partneransicht auf, ist etwas durchgesickert.
  row("Südwerk", "Südstrom Business 24", 777.77, { follow: 333.33 }),
];

function setup() {
  const f = fixture();
  commitCommissionImport(user(f.leader), LIST, { label: "Meine Provisionen - 05.11.2026 bis 08.11.2026", validFrom: "2026-11-05", promoUntil: "2026-11-08" });
  // Berater 60 %, Senior Berater 65 %, Teamleiter 70 % - von 150 € also 90 €, 97,50 € und 105 €.
  saveCommissionSettings(user(f.leader), { standardPercent: 60, seniorPercent: 65, leadPercent: 70 });
  return f;
}
const tariffId = (teamId: number, name: string) => loadTariffs(teamId).find((t) => t.name === name)!.id;
const forbidden = (fn: () => unknown) => assert.throws(fn, (error: unknown) => error instanceof AuthError && error.status === 403);
const invalid = (fn: () => unknown, pattern?: RegExp) =>
  assert.throws(fn, (error: unknown) => error instanceof ValidationError && (!pattern || pattern.test(error.message)));

/* ------------------------------ Excel lesen ------------------------------ */

/** Eine kleine, echte .xlsx bauen - ZIP mit Deflate, wie Excel sie schreibt. */
function xlsx(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const packed = deflateRawSync(data);
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const WORKBOOK = {
  "xl/workbook.xml": `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Worksheet" sheetId="1" r:id="rId7"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0"?><Relationships><Relationship Id="rId7" Type="worksheet" Target="worksheets/liste.xml"/></Relationships>`,
  "xl/sharedStrings.xml": `<sst><si><t>Anbieter</t></si><si><t>Tarif</t></si><si><t>Grundprovision</t></si><si><r><t>Strom </t></r><r><t>&amp; Gas</t></r></si><si><t>Ökostrom 24</t></si></sst>`,
  "xl/worksheets/liste.xml": `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="inlineStr"><is><t>Aktionsprovision</t></is></c></row>
    <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>82.499999999999986</v></c><c r="E3" s="2"/><c r="D3"><v>1E-3</v></c></row>
  </sheetData></worksheet>`,
};

test("Excel-Dateien werden ohne Zusatzbibliothek gelesen", () => {
  const cells = readXlsx(xlsx(WORKBOOK));
  assert.deepEqual(cells[0], ["Anbieter", "Tarif", "Grundprovision", "Aktionsprovision"]);
  assert.deepEqual(cells[1], []);
  assert.deepEqual(cells[2], ["Strom & Gas", "Ökostrom 24", "82.5", "0.001", ""]);
  // Ohne Beziehungen nimmt der Leser das erste Blatt am ueblichen Ort.
  const plain = readXlsx(xlsx({ "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="B1" t="str"><v>x &lt; y</v></c></row></sheetData></worksheet>` }));
  assert.deepEqual(plain, [["", "x < y"]]);
  assert.throws(() => readXlsx(Buffer.from("Anbieter;Tarif\n")), XlsxError);
  assert.throws(() => readXlsx(xlsx({ "xl/other.xml": "<x/>" })), XlsxError);
});

test("die Tabelle wird tolerant gelesen und Fehler zeilengenau gemeldet", () => {
  const result = readCommissionTable([
    ["Export vom 05.11.2026"],
    ["Anbieter", "Tarif", "Verbrauch VON", "Verbrauch BIS", "Grundprovision", "Aktionsprovision", "Folgeprovision", "Abschluss", "Anschluss"],
    ["Gaswerk", "Gaswerk Business Gas", "1", "25.000", "120,00 €", "", "20", "100%", "0%"],
    ["", "", "", "", "", "", "", "", ""],
    ["Gaswerk", "Ohne Betrag", "1", "2", "", "", "", "", ""],
    ["Gaswerk", "Verdreht", "5000", "100", "10", "", "", "", ""],
    ["Spotwerk", "Spot Strom", "0", "1000000", "0.001", "0", "0", "0", "1"],
    ["Gaswerk", "Gaswerk Business Gas", "1", "25000", "125", "", "", "1", "0"],
  ]);
  assert.equal(result.error, undefined);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], {
    line: 8, provider: "Gaswerk", name: "Gaswerk Business Gas", kwhFrom: 1, kwhTo: 25000, base: 125, promo: 0, follow: 0,
    payoutConclusion: 1, payoutConnection: 0,
  });
  assert.equal(result.rows[1].payoutConnection, 1);
  assert.equal(result.rows[1].payoutConclusion, 0);
  assert.deepEqual(result.skipped.map((s) => s.line), [5, 6, 3]);
  assert.match(result.skipped[0].error, /Grundprovision fehlt/);
  assert.match(result.skipped[2].error, /Doppelt/);
  assert.match(readCommissionTable([["Name", "Preis"]]).error ?? "", /Kopfzeile/);
  assert.deepEqual(datesFromLabel("Meine Provisionen - 05.11.2026 bis 08.11.2026"), { validFrom: "2026-11-05", promoUntil: "2026-11-08" });
  assert.deepEqual(datesFromLabel("Liste"), { validFrom: "", promoUntil: "" });
  assert.equal(labelFromFileName("Meine_Provisionen_-_05.11.2026_bis_08.11.2026.xlsx"), "Meine Provisionen - 05.11.2026 bis 08.11.2026");
});

/* --------------------------------- Import -------------------------------- */

test("Import zeigt vorher, was sich aendert, und behaelt Einstellungen bekannter Tarife", () => {
  const f = fixture();
  const leader = user(f.leader);
  const first = previewCommissionImport(f.team, LIST);
  assert.equal(first.tariffs, 6);
  assert.equal(first.bands, 7);
  assert.equal(first.added.length, 6);
  assert.deepEqual(first.review, ["Paketwerk · Home Paket 12"]);
  assert.equal(first.individual, 1);
  commitCommissionImport(leader, LIST, { label: "Liste 1", validFrom: "2026-11-05", promoUntil: "" });

  const eon = tariffId(f.team, "Ost Strom 24");
  const paket = tariffId(f.team, "Home Paket 12");
  updateCommissionTariff(leader, paket, { sparte: "STROM", note: "Nur Neukunden", hidden: true });
  saveCommissionRule(leader, { scope: "TARIFF", scopeValue: String(eon), mode: "FIXED", value: 70 });

  const next = [...LIST.filter((r) => r.provider !== "Lichtwerk").map((r) => (r.name === "Ost Strom 24" ? { ...r, base: 110 } : r)),
    row("Westwerk", "West Gas 24", 90, { promo: 30 })];
  const preview = previewCommissionImport(f.team, next);
  assert.deepEqual(preview.added, ["Westwerk · West Gas 24"]);
  assert.deepEqual(preview.changed, ["Ostwerk · Ost Strom 24"]);
  assert.deepEqual(preview.removed, ["Lichtwerk · Licht Ökostrom 24"]);
  assert.equal(preview.unchanged, 4);
  commitCommissionImport(leader, next, { label: "Liste 2", validFrom: "2026-11-12" });

  const tariffs = loadTariffs(f.team);
  const kept = tariffs.find((t) => t.id === paket)!;
  assert.equal(kept.note, "Nur Neukunden");
  assert.equal(kept.hidden, 1);
  assert.equal(kept.needs_review, 0);
  assert.equal(tariffs.find((t) => t.id === eon)!.bands[0].base_eur, 110);
  assert.equal(tariffs.find((t) => t.name === "Licht Ökostrom 24")!.active, 0);
  assert.equal(tariffs.find((t) => t.name.startsWith("Spot Gas"))!.bands[0].individual, 1);
  assert.equal(tariffs.find((t) => t.name.startsWith("Spot Gas"))!.payout_connection, 1);
  // Die Ausnahme haengt am Tarif und ueberlebt den Import.
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM commission_rules WHERE scope_value = ?").get(String(eon)) as { n: number }).n, 1);
  // Wieder dabei: derselbe Tarif, wieder aktiv.
  commitCommissionImport(leader, LIST, { validFrom: "2026-11-19" });
  assert.equal(loadTariffs(f.team).find((t) => t.name === "Licht Ökostrom 24")!.active, 1);
  // Westwerk stand nur in der zweiten Liste - jetzt wieder entfallen.
  assert.deepEqual(commissionCounts(f.team), { tariffs: 6, review: 0, configured: false });
});

test("Importzeilen aus dem Browser werden erneut geprueft", () => {
  assert.equal(checkImportRows([row("Gaswerk", "Gas", 10)]).length, 1);
  invalid(() => checkImportRows([]));
  invalid(() => checkImportRows([{ ...row("Gaswerk", "Gas", 10), base: -1 }]), /Grundprovision/);
  invalid(() => checkImportRows([{ ...row("Gaswerk", "Gas", 10), kwhFrom: 10, kwhTo: 5 }]), /Verbrauch/);
  invalid(() => checkImportRows([{ ...row("", "Gas", 10) }]), /Anbieter/);
  invalid(() => checkImportRows([{ ...row("Gaswerk", "Gas", 10), payoutConnection: 2 }]), /Anschluss/);
});

test("nur die Geschaeftsfuehrung importiert und stellt Regeln ein", () => {
  const f = setup();
  forbidden(() => commitCommissionImport(user(f.lisa), LIST, {}));
  forbidden(() => saveCommissionSettings(user(f.paul), { standardPercent: 90 }));
  forbidden(() => saveCommissionRule(user(f.lisa), { scope: "SPARTE", scopeValue: "GAS", mode: "PERCENT", value: 90 }));
  forbidden(() => createCommissionBonus(user(f.tom), { kind: "TARIFF", amount: 20 }));
  forbidden(() => updateCommissionTariff(user(f.lisa), tariffId(f.team, "Licht Ökostrom 24"), { hidden: true }));
  forbidden(() => commissionView(user(f.paul), null, DAY));
  // Andere Teams bleiben draussen.
  forbidden(() => commissionView(user(f.outsider), f.paul, DAY));
  assert.throws(() => commissionView(user(f.leader), f.outsider, DAY), AuthError);
});

/* -------------------------------- Rechte --------------------------------- */

test("Rechte: Provisionen verwaltet die Geschaeftsfuehrung - Teamleiter stellen nichts ein", () => {
  const f = fixture();
  assert.equal(hasPermission(user(f.leader), "commissions.manage"), true);
  assert.equal(hasPermission(user(f.lisa), "commissions.manage"), false);
  // Das fruehere Recht "Provision der Struktur festlegen" gibt es nicht mehr - auch ein gespeicherter Eintrag gilt nicht.
  assert.equal(isPermission("commissions.structure"), false);
  db.prepare("INSERT INTO user_permissions(user_id, permission, allowed) VALUES (?, 'commissions.structure', 1)").run(f.lisa);
  assert.ok(!("commissions.structure" in permissionsFor(user(f.lisa))));
  const memberNav = navigation("MEMBER", permissionsFor(user(f.paul)), f.paul);
  assert.ok(memberNav.items.some((item) => item.href === "/provisionen"));
  assert.ok(!memberNav.admin.some((item) => item.href === "/einstellungen/provisionen"));
  assert.ok(navigation("LEADER", permissionsFor(user(f.leader)), f.leader).admin.some((item) => item.href === "/einstellungen/provisionen"));
});

/* ------------------------------- Ansichten ------------------------------- */

/** Alle Zahlen einer Ansicht - darin darf kein Admin-Betrag stecken. */
const numbers = (value: unknown): number[] =>
  typeof value === "number" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(numbers) : [];

test("der Vertrieb sieht nur eigene Euro-Betraege - nie Admin-Provision oder Saetze", () => {
  const f = setup();
  const leader = user(f.leader);
  saveCommissionRule(leader, { scope: "PROVIDER", scopeValue: "ostwerk", mode: "PERCENT", value: 65 });
  updateCommissionTariff(leader, tariffId(f.team, "Home Paket 12"), { hidden: true });
  const view = commissionView(user(f.paul), f.paul, DAY);
  assert.equal(view.admin, false);
  assert.equal(view.manager, false);
  assert.equal(view.configured, true);
  assert.ok(!view.tariffs.some((t) => t.name === "Home Paket 12"), "ausgeblendete Tarife fehlen");
  const json = JSON.stringify(view);
  for (const key of ['"admin":{', '"cost":', '"keep":', '"rule":', "needsReview", "77.77", "333.33"]) {
    assert.ok(!json.includes(key), `${key} steckt in der Partneransicht`);
  }
  // 60 % von 777,77 € sind 466,66 € - die eigenen Betraege stehen da, der Admin-Betrag nicht.
  assert.ok(!numbers(view).includes(777.77) && !numbers(view).includes(333.33));
  const south = view.tariffs.find((t) => t.provider === "Südwerk")!;
  assert.deepEqual(south.bands.map((b) => [b.now, b.follow]), [[466.66, 200]]);
  const east = view.tariffs.find((t) => t.provider === "Ostwerk")!;
  assert.deepEqual(east.bands.map((b) => [b.now, b.promo]), [[91, 26]]);
  // Aktion vorbei: nur noch der Anteil der Grundprovision.
  const later = commissionView(user(f.paul), f.paul, "2026-11-09");
  assert.equal(later.stand?.promoActive, false);
  assert.equal(later.tariffs.find((t) => t.provider === "Ostwerk")!.bands[0].now, 65);
  const spot = view.tariffs.find((t) => t.name.startsWith("Spot Gas"))!;
  assert.deepEqual([spot.bands[0].now, spot.bands[0].individual, spot.timing], [null, true, "bei Lieferbeginn"]);
});

test("niemand sieht, was die Ebenen darueber bekommen - und kein Teamleiter ueber seine direkten Leute hinaus", () => {
  const f = setup();
  // Nach oben und zur Seite: verboten.
  forbidden(() => commissionView(user(f.tom), f.lisa, DAY));
  forbidden(() => commissionView(user(f.max), f.tom, DAY));
  forbidden(() => commissionView(user(f.paul), f.lisa, DAY));
  forbidden(() => commissionView(user(f.lisa), f.paul, DAY));
  forbidden(() => commissionView(user(f.lisa), f.leader, DAY));
  // Keine weiteren Ebenen: Ole gehoert zu Mias Team, und Mia baut als Teamleiterin ihr eigenes auf.
  forbidden(() => commissionView(user(f.lisa), f.ole, DAY));
  forbidden(() => commissionView(user(f.lisa), f.mia, DAY));
  forbidden(() => commissionView(user(f.mia), f.tom, DAY));
  // Toms eigene Liste nennt nur Toms Betraege.
  const tom = commissionView(user(f.tom), f.tom, DAY);
  const plain = tom.tariffs.find((t) => t.name === "Licht Ökostrom 24")!;
  assert.equal(plain.bands[0].now, 90);
  assert.ok(!numbers(tom).includes(105), "Lisas Betrag steckt in Toms Ansicht");
  assert.ok(!JSON.stringify(tom).includes('"keep"'));
  // "Meine Leute" zeigt nur die direkten - ohne Saetze.
  const structure = commissionStructure(user(f.lisa));
  assert.deepEqual(structure.people.map((p) => p.id), [f.max, f.tom]);
  assert.equal(structure.tiers, null);
  assert.ok(structure.people.every((p) => p.percent === null && p.value === null && !p.editable));
  assert.deepEqual(commissionStructure(user(f.mia)).people.map((p) => p.id), [f.ole]);
  assert.equal(commissionStructure(user(f.tom)).people.length, 0);
  // Ein Berater bekommt nie ein Team zu sehen - auch wenn in der Datenbank jemand unter ihm steht.
  db.prepare("UPDATE users SET manager_id = ? WHERE id = ?").run(f.tom, f.ole);
  assert.equal(commissionStructure(user(f.tom)).people.length, 0);
  forbidden(() => commissionView(user(f.tom), f.ole, DAY));
});

test("Teamleiter sehen ihre direkten Leute und die Differenz, die sie daran bekommen", () => {
  const f = setup();
  const leader = user(f.leader);
  const plainBand = (viewer: number, subject: number) =>
    commissionView(user(viewer), subject, DAY).tariffs.find((t) => t.name === "Licht Ökostrom 24")!.bands[0];
  const tomFromLisa = commissionView(user(f.lisa), f.tom, DAY);
  assert.equal(tomFromLisa.manager, true);
  // Tom behaelt seine 90 € - Lisa bekommt 15 € obendrauf, beim Senior Berater 7,50 €.
  assert.deepEqual([plainBand(f.lisa, f.tom).now, plainBand(f.lisa, f.tom).keep], [90, 15]);
  assert.deepEqual([plainBand(f.lisa, f.max).now, plainBand(f.lisa, f.max).keep], [97.5, 7.5]);
  assert.deepEqual([plainBand(f.mia, f.ole).now, plainBand(f.mia, f.ole).keep], [90, 15]);
  assert.ok(!JSON.stringify(tomFromLisa).includes('"admin":{'));
  assert.ok(!JSON.stringify(tomFromLisa).includes('"cost":'));
  assert.deepEqual(
    commissionStructure(user(f.lisa)).people.map((p) => [p.name, p.tier, p.managerId === f.lisa]),
    [["Max", "SENIOR", true], ["Tom", "BERATER", true]],
  );
  // Ein individueller Satz aendert die Differenz - mehr als der Teamleiter selbst ergibt null, nie ein Minus.
  setPersonCommission(leader, f.tom, 68);
  assert.deepEqual([plainBand(f.lisa, f.tom).now, plainBand(f.lisa, f.tom).keep], [102, 3]);
  setPersonCommission(leader, f.tom, 80);
  assert.deepEqual([plainBand(f.lisa, f.tom).now, plainBand(f.lisa, f.tom).keep], [120, 0]);
  // Wird Tom selbst Teamleiter, faellt die Differenz weg - Lisa sieht seine Liste nicht mehr.
  setPersonCommission(leader, f.tom, null);
  db.prepare("UPDATE users SET tier = 'TEAMLEITER' WHERE id = ?").run(f.tom);
  forbidden(() => commissionView(user(f.lisa), f.tom, DAY));
  assert.equal(plainBand(f.tom, f.tom).now, 105);
});

test("die Geschaeftsfuehrung sieht alles: Admin-Betraege, Kosten je Vertrag und Ansicht als", () => {
  const f = setup();
  const leader = user(f.leader);
  const standard = commissionView(leader, null, DAY);
  assert.equal(standard.subject, null);
  const plain = standard.tariffs.find((t) => t.name === "Licht Ökostrom 24")!;
  assert.deepEqual([plain.bands[0].now, plain.bands[0].admin?.now, plain.bands[0].cost?.now], [90, 150, 90]);
  assert.ok(standard.tariffs.some((t) => t.name === "Home Paket 12" && t.admin?.needsReview));
  const as = (id: number) => {
    const band = commissionView(leader, id, DAY).tariffs.find((t) => t.name === "Licht Ökostrom 24")!.bands[0];
    return [band.now, band.cost?.now, band.admin?.now];
  };
  // Tom bekommt 90 €, mit Lisas Differenz kostet der Vertrag 105 €, der Geschaeftsfuehrung bleiben 45 €.
  assert.deepEqual(as(f.tom), [90, 105, 150]);
  // Auch zwei Ebenen tief nie mehr als der Satz eines Teamleiters: nur Mia bekommt etwas, Lisa nicht.
  assert.deepEqual(as(f.ole), [90, 105, 150]);
  assert.deepEqual(as(f.mia), [105, 105, 150]);
  assert.deepEqual(as(f.paul), [90, 90, 150]);
  const structure = commissionStructure(leader);
  assert.deepEqual(structure.tiers, { BERATER: 60, SENIOR: 65, TEAMLEITER: 70 });
  assert.deepEqual(structure.people.map((p) => [p.name, p.depth, p.tier, p.percent, p.managerName, p.editable]), [
    ["Lisa", 0, "TEAMLEITER", 70, null, true],
    ["Max", 1, "SENIOR", 65, "Lisa", true],
    ["Mia", 1, "TEAMLEITER", 70, null, true],
    ["Ole", 2, "BERATER", 60, "Mia", true],
    ["Tom", 1, "BERATER", 60, "Lisa", true],
    ["Paul", 0, "BERATER", 60, null, true],
  ]);
  // Eine deaktivierte Teamleiterin bekommt keine Differenz mehr.
  db.prepare("UPDATE users SET active = 0 WHERE id = ?").run(f.lisa);
  assert.deepEqual(as(f.tom), [90, 90, 150]);
});

/* ------------------------------ Einstellen ------------------------------- */

test("individuelle Saetze legt nur die Verwaltung fest - Teamleiter nehmen ihren Leuten nichts weg", () => {
  const f = setup();
  const leader = user(f.leader);
  forbidden(() => setPersonCommission(user(f.lisa), f.tom, 50));
  forbidden(() => setPersonCommission(user(f.lisa), f.ole, 50));
  forbidden(() => setPersonCommission(user(f.tom), f.lisa, 100));
  forbidden(() => setPersonCommission(user(f.lisa), f.lisa, 100));
  forbidden(() => setPersonCommission(user(f.paul), f.paul, 90));
  forbidden(() => setPersonCommission(leader, f.leader, 50));
  assert.throws(() => setPersonCommission(leader, f.outsider, 50), /nicht gefunden/);
  invalid(() => setPersonCommission(leader, f.tom, 120), /0 und 100/);
  // Eine zweite Person in der Geschaeftsfuehrung bekommt ebenfalls die volle Admin-Provision - da gibt es nichts einzustellen.
  const coLeader = Number(db.prepare("INSERT INTO users(team_id, manager_id, name, email, password_hash, role) VALUES (?, ?, 'Zweite Leitung', ?, '', 'LEADER')")
    .run(f.team, f.leader, `co-${++sequence}@example.test`).lastInsertRowid);
  invalid(() => setPersonCommission(leader, coLeader, 50), /volle Admin-Provision/);
  // Die Verwaltung darf auf jeder Ebene abweichen.
  setPersonCommission(leader, f.ole, 50);
  setPersonCommission(leader, f.lisa, 72.5);
  const person = (id: number) => commissionStructure(leader).people.find((p) => p.id === id)!;
  assert.deepEqual([person(f.lisa).value, person(f.lisa).percent, person(f.ole).percent], [72.5, 72.5, 50]);
  // Zurueck auf die Stufe geht mit null.
  setPersonCommission(leader, f.ole, null);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM commission_people WHERE user_id = ?").get(f.ole) as { n: number }).n, 0);
  assert.deepEqual([person(f.ole).value, person(f.ole).percent], [null, 60]);
  // Wechselt Tom die Fuehrungskraft, gilt wieder seine Stufe.
  setPersonCommission(leader, f.tom, 80);
  db.prepare("UPDATE users SET manager_id = ? WHERE id = ?").run(f.mia, f.tom);
  assert.deepEqual([person(f.tom).managerName, person(f.tom).value, person(f.tom).percent], ["Mia", null, 60]);
});

test("die Saetze der Stufen: nur die Verwaltung, nie unter der Stufe darunter", () => {
  const f = setup();
  const leader = user(f.leader);
  forbidden(() => saveCommissionSettings(user(f.lisa), { leadPercent: 90 }));
  invalid(() => saveCommissionSettings(leader, { seniorPercent: 50 }), /Standardsatz/);
  invalid(() => saveCommissionSettings(leader, { leadPercent: 62 }), /Senior Berater/);
  invalid(() => saveCommissionSettings(leader, { leadPercent: 101 }), /0 und 100/);
  const plain = (id: number) => commissionView(leader, id, DAY).tariffs.find((t) => t.name === "Licht Ökostrom 24")!.bands[0];
  // Steigt der Standardsatz ueber einen alten Stufensatz, zieht die Stufe mit - niemand faellt unter die Stufe darunter.
  saveCommissionSettings(leader, { standardPercent: 68 });
  assert.deepEqual(commissionStructure(leader).tiers, { BERATER: 68, SENIOR: 68, TEAMLEITER: 70 });
  assert.deepEqual([plain(f.max).now, plain(f.tom).cost?.now], [102, 105]);
  // Ohne eigene Saetze bekommen alle den Standardsatz - dann gibt es auch keine Differenz.
  assert.deepEqual(saveCommissionSettings(leader, { seniorPercent: "", leadPercent: null }).lead_percent, null);
  assert.deepEqual(commissionStructure(leader).tiers, { BERATER: 68, SENIOR: 68, TEAMLEITER: 68 });
  assert.deepEqual([plain(f.lisa).now, plain(f.tom).now, plain(f.tom).cost?.now], [102, 102, 102]);
});

test("Ausnahmen und Boni werden geprueft und erscheinen bei den richtigen Leuten", () => {
  const f = setup();
  const leader = user(f.leader);
  invalid(() => saveCommissionRule(leader, { scope: "PROVIDER", scopeValue: "Gibtsnicht", mode: "PERCENT", value: 50 }), /Anbieter/);
  invalid(() => saveCommissionRule(leader, { scope: "SPARTE", scopeValue: "WASSER", mode: "PERCENT", value: 50 }), /Sparte/);
  invalid(() => saveCommissionRule(leader, { scope: "SPARTE", scopeValue: "GAS", mode: "PERCENT", value: 101 }), /0 und 100/);
  invalid(() => saveCommissionRule(leader, { scope: "SPARTE", scopeValue: "GAS", mode: "EGAL", value: 10 }));
  const first = saveCommissionRule(leader, { scope: "SPARTE", scopeValue: "GAS", mode: "PERCENT", value: 50 });
  const again = saveCommissionRule(leader, { scope: "SPARTE", scopeValue: "GAS", mode: "FIXED", value: 80 });
  assert.equal(first, again, "je Bereich gibt es eine Ausnahme");

  invalid(() => createCommissionBonus(leader, { kind: "VOLUME", amount: 10 }), /Staffel/);
  invalid(() => createCommissionBonus(leader, { kind: "PERSONAL", amount: 10 }), /Für wen/);
  invalid(() => createCommissionBonus(leader, { kind: "TARIFF", amount: 10, validFrom: "2026-11-30", validTo: "2026-11-01" }), /Ende/);
  invalid(() => createCommissionBonus(leader, { kind: "TARIFF", amount: 0 }));
  createCommissionBonus(leader, { kind: "TARIFF", label: "Herbst", amount: 20, scope: "PROVIDER", scopeValue: "Ostwerk", validTo: "2026-11-30" });
  createCommissionBonus(leader, { kind: "PERSONAL", label: "Einarbeitung", amount: 10, userId: f.tom, validFrom: "2026-11-01", validTo: "2026-11-28" });
  const combo = createCommissionBonus(leader, { kind: "COMBO", amount: 15 });
  const eon = (view: ReturnType<typeof commissionView>) => view.tariffs.find((t) => t.provider === "Ostwerk")!.bonuses.map((b) => [b.label, b.amount]);
  assert.deepEqual(eon(commissionView(user(f.tom), f.tom, DAY)), [["Herbst", 20], ["Einarbeitung", 10]]);
  assert.deepEqual(eon(commissionView(user(f.paul), f.paul, DAY)), [["Herbst", 20]]);
  assert.deepEqual(eon(commissionView(leader, null, DAY)), [["Herbst", 20]]);
  assert.deepEqual(eon(commissionView(user(f.paul), f.paul, "2026-12-01")), []);
  assert.deepEqual(commissionView(user(f.paul), f.paul, DAY).combo.map((b) => b.amount), [15]);
  updateCommissionBonus(leader, combo, { active: false });
  assert.deepEqual(commissionView(user(f.paul), f.paul, DAY).combo, []);
});

test("ohne Standardsatz sieht der Vertrieb die Tarife, aber noch keine Betraege", () => {
  const f = fixture();
  commitCommissionImport(user(f.leader), LIST, { validFrom: "2026-11-05" });
  const view = commissionView(user(f.paul), f.paul, DAY);
  assert.equal(view.configured, false);
  assert.ok(view.tariffs.length > 0);
  assert.ok(view.tariffs.every((t) => t.bands.every((b) => b.now === null)));
});
