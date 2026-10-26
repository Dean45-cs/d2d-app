import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contrast, hexToRgb, over } from "../../src/lib/color";
import { ACCENTS, THEME_VARS, buildPalette, themeCss } from "../../src/lib/theme-palette";

/*
 * Akzentfarben (src/lib/theme-palette.ts): jede Farbe haelt dieselben
 * Kontrastregeln wie das Gruen (docs/DESIGN.md), und das Gruen bleibt genau
 * so, wie es in brand.css und globals.css gestaltet ist.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const WHITE = "#ffffff";
const rgbHex = (rgb: [number, number, number]) =>
  `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;

test("themes.css ist aus dem Code erzeugt (npm run themes)", () => {
  assert.equal(read("src/app/themes.css"), themeCss());
});

test("das Gruen steht in den Tokens genau so, wie die Palette es kennt", () => {
  const css = read("src/app/brand.css") + read("src/app/globals.css");
  const green = buildPalette("gruen");
  // Schatten tragen je Stelle ihren eigenen gruenen Wert - sie werden nur im Thema vereinheitlicht.
  const shared = new Set(["shade", "deep-shadow", "glow-shadow"]);
  for (const [mode, suffix] of [["light", ""], ["dark", "-d"]] as const) {
    for (const [name, role, kind] of THEME_VARS[mode]) {
      if (shared.has(name)) continue;
      const fallbacks = [...css.matchAll(new RegExp(`var\\(--t-${name}${suffix}, ([^)]+)\\)`, "g"))].map((m) => m[1]);
      assert.ok(fallbacks.length > 0, `--t-${name}${suffix} wird nirgends gelesen`);
      const expected = kind === "rgb" ? hexToRgb(green[mode][role]).join(" ") : green[mode][role];
      for (const fallback of fallbacks) assert.equal(fallback, expected, `--t-${name}${suffix}`);
    }
  }
});

for (const accent of ACCENTS) {
  test(`${accent.label}: Kontraste hell und dunkel`, () => {
    const { light, dark } = buildPalette(accent.id);
    const bg = light.bg;
    // Hell
    assert.ok(contrast(light.accent, WHITE) >= 3, "Akzent auf Weiss");
    assert.ok(contrast(light.accent, bg) >= 3, "Akzent auf Grund");
    for (const ground of [WHITE, bg, rgbHex(over(light.accentVivid, 0.16, WHITE)), rgbHex(over(light.accentVivid, 0.26, WHITE))]) {
      assert.ok(contrast(light.accentInk, ground) >= 4.5, `Akzentschrift auf ${ground}`);
    }
    assert.ok(contrast(WHITE, light.primaryTop) >= 4.5, "weisse Schrift auf der Hauptaktion (oben)");
    assert.ok(contrast(WHITE, light.primaryBottom) >= contrast(WHITE, light.primaryTop), "unten dunkler als oben");
    assert.ok(contrast(WHITE, light.deep) >= 9, "weisse Schrift auf der Markenflaeche");
    assert.ok(contrast(WHITE, light.price4) >= 3, "tiefste Preisstufe");
    assert.ok(contrast(light.muted, WHITE) >= 4.5 && contrast(light.muted, bg) >= 4.5, "leise Schrift");
    assert.ok(contrast(light.ink, WHITE) >= 15, "Schrift");
    // Dunkel
    const surface = dark.surface;
    assert.ok(contrast(dark.accent, surface) >= 3, "Akzent auf dunkler Flaeche");
    assert.ok(contrast(dark.accentInk, surface) >= 4.5 && contrast(dark.accentInk, dark.surface2) >= 4.5, "Akzentschrift dunkel");
    assert.ok(contrast(dark.onAccent, dark.accent) >= 4.5, "Zeichen auf dem Akzent");
    assert.ok(contrast(WHITE, dark.primaryTop) >= 4.5, "weisse Schrift auf der Hauptaktion (dunkel)");
    assert.ok(contrast(WHITE, dark.deep) >= 9, "weisse Schrift auf der Markenflaeche (dunkel)");
    assert.ok(contrast(dark.muted, surface) >= 4.5, "leise Schrift dunkel");
  });
}

test("jede Farbe sieht anders aus - und jede Preisstufe wird stetig dunkler", () => {
  const accents = ACCENTS.map((accent) => buildPalette(accent.id).light.accent);
  assert.equal(new Set(accents).size, ACCENTS.length);
  for (const accent of ACCENTS) {
    const { light } = buildPalette(accent.id);
    const steps = [0, 1, 2, 3, 4].map((step) => contrast(light[`price${step}`], WHITE));
    for (let step = 1; step < steps.length; step += 1) assert.ok(steps[step] > steps[step - 1], `${accent.label} Stufe ${step}`);
  }
});

test("ohne Toenung sind Grund und Linien grau, die Marke bleibt", () => {
  const plain = buildPalette("blau", { tint: false });
  const tinted = buildPalette("blau");
  const [r, g, b] = hexToRgb(plain.light.bg);
  assert.ok(r === g && g === b, plain.light.bg);
  assert.equal(plain.light.accent, tinted.light.accent);
});
