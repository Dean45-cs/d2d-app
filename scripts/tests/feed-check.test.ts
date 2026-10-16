import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFeedCsv } from "../../src/lib/energy/feed-check";

const HEADER = "plz;ort;versorger;strom_ct_kwh;strom_grundpreis_eur;gas_ct_kwh;gas_grundpreis_eur;gueltig_ab;quelle_url;geprueft_am";
const today = new Date("2026-10-16T12:00:00Z");

test("eine saubere Zeile geht durch", () => {
  const csv = `${HEADER}\n44135;Dortmund;DEW21;38,45;142,80;12,10;178,00;2026-07-01;https://example.de/preisblatt.pdf;2026-10-15`;
  const result = checkFeedCsv(csv, today);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].strom_ct_kwh, 38.45);
  assert.deepEqual(result.stale, []);
});

test("Netto- oder Euro-Preise statt Cent fallen auf", () => {
  const csv = `${HEADER}\n44135;Dortmund;DEW21;0,38;142,80;;;;https://example.de/p.pdf;2026-10-15`;
  const result = checkFeedCsv(csv, today);
  assert.match(result.issues[0].error, /strom_ct_kwh/);
});

test("ohne Quelle oder Pruefdatum keine Freigabe", () => {
  const csv = `${HEADER}\n44135;Dortmund;DEW21;38,45;142,80;;;;;`;
  const errors = checkFeedCsv(csv, today).issues.map((issue) => issue.error);
  assert.ok(errors.some((e) => e.includes("quelle_url")));
  assert.ok(errors.some((e) => e.includes("geprueft_am")));
});

test("alte Pruefungen und doppelte PLZ werden gemeldet", () => {
  const row = "44135;Dortmund;DEW21;38,45;142,80;;;;https://example.de/p.pdf;2026-09-01";
  const result = checkFeedCsv(`${HEADER}\n${row}\n${row}`, today);
  assert.deepEqual(result.stale, ["44135"]);
  assert.equal(result.issues[0].error, "PLZ doppelt");
});
