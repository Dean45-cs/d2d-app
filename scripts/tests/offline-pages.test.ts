import assert from "node:assert/strict";
import { test } from "node:test";
import { copyLabel, offlineCopyTime } from "../../src/lib/offline-pages";

function doc(content: string | null) {
  return {
    querySelector: (selector: string) =>
      selector === 'meta[name="d2d-offline-copy"]' && content !== null
        ? ({ getAttribute: (name: string) => (name === "content" ? content : null) } as unknown as Element)
        : null,
  };
}

test("a page fresh from the server has no stored time; a stored copy names its moment", () => {
  assert.equal(offlineCopyTime(doc(null)), null);
  assert.equal(offlineCopyTime(doc("kaputt")), null);
  assert.equal(offlineCopyTime(doc("2026-10-20T12:32:00.000Z"))?.toISOString(), "2026-10-20T12:32:00.000Z");
});

test("the stored time reads as a clock time today and with the day otherwise", () => {
  const now = new Date(2026, 9, 20, 15, 0);
  assert.equal(copyLabel(new Date(2026, 9, 20, 14, 32), now), "14:32");
  assert.match(copyLabel(new Date(2026, 9, 19, 8, 5), now), /19\.10\..*08:05/);
});
