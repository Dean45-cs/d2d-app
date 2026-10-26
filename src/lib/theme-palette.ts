import { ACCENT_LABEL, DEFAULT_ACCENT, type AccentId } from "./accents";
import { contrast, fitGamut, hexToOklch, oklchToHex, over, rgbTriplet, type Oklch } from "./color";

export { ACCENT_LABEL, DEFAULT_ACCENT, type AccentId };

/*
 * Akzentfarben der App - als waere die App in dieser Farbe erschienen.
 *
 * Eine Akzentfarbe ist mehr als ein Knopf in anderer Farbe: Schrift im
 * Akzent, Hauptaktion, Markenflaeche, Licht hinter der Anmeldung, Logo,
 * Preisstufen der Karte und der Hauch Farbe in Grund, Linien und Glas
 * gehoeren dazu. Alles wird aus dem gestalteten Gruen abgeleitet: gleiche
 * Helligkeit (OKLCH), der Ton der neuen Farbe, die Buntheit, die der
 * Bildschirm bei diesem Ton zeigen kann. Danach wird jede Rolle auf ihren
 * Kontrast nachgezogen (Schrift >= 4,5 : 1, Bedienelemente >= 3 : 1, weisse
 * Schrift auf der Hauptaktion >= 4,5 : 1, auf der Markenflaeche >= 9 : 1).
 *
 * Das Gruen selbst steht unveraendert in brand.css und globals.css; jedes
 * Token dort liest zuerst sein --t-Gegenstueck (var(--t-accent, #15904a)).
 * Die Themen setzen nur diese --t-Werte - eine Regel je Thema, keine
 * Konkurrenz mit Hell/Dunkel, Energiesparmodus oder Kontrast. Die Datei
 * src/app/themes.css entsteht daraus mit `npm run themes`.
 */

interface AccentSpec {
  id: AccentId;
  label: string;
  /** Farbton der hellen Stufen (Akzent im Dunkeln, Logo-Licht). */
  hue: number;
  /** Farbton der tiefen Stufen (Markenflaeche, Schrift) - Gelb wird zur Bronze, Blau zum Marineblau. */
  deepHue?: number;
  /** Buntheit im Verhaeltnis zum Gruen; begrenzt wird ohnehin auf das, was der Bildschirm zeigen kann. */
  chroma: number;
  /** Ton und Buntheit der Neutralen (Grund, Linien, Glas) - Standard: der Akzent, so zart wie beim Gruen. */
  neutralHue?: number;
  neutralChroma?: number;
  /** Feste Helligkeit fuer einzelne Rollen (Graphit hat kaum Farbe und braucht dafuer Tiefe). */
  lightness?: Partial<Record<`${Mode}.${BrandRole}`, number>>;
}

export const ACCENTS: readonly AccentSpec[] = [
  { id: "gruen", label: ACCENT_LABEL.gruen, hue: 151, chroma: 1 },
  { id: "petrol", label: ACCENT_LABEL.petrol, hue: 196, deepHue: 212, chroma: 0.92 },
  { id: "blau", label: ACCENT_LABEL.blau, hue: 252, deepHue: 262, chroma: 1.3 },
  { id: "indigo", label: ACCENT_LABEL.indigo, hue: 276, deepHue: 280, chroma: 1.4 },
  { id: "violett", label: ACCENT_LABEL.violett, hue: 304, deepHue: 300, chroma: 1.4 },
  { id: "pink", label: ACCENT_LABEL.pink, hue: 356, deepHue: 4, chroma: 1.45 },
  { id: "rot", label: ACCENT_LABEL.rot, hue: 27, deepHue: 22, chroma: 1.5 },
  { id: "orange", label: ACCENT_LABEL.orange, hue: 56, deepHue: 42, chroma: 1.3, neutralChroma: 0.8 },
  { id: "gold", label: ACCENT_LABEL.gold, hue: 86, deepHue: 64, chroma: 1.15, neutralHue: 80, neutralChroma: 0.7 },
  {
    id: "graphit",
    label: ACCENT_LABEL.graphit,
    hue: 255,
    chroma: 0.24,
    neutralChroma: 1.15,
    lightness: {
      "light.accent": 0.47,
      "light.accentInk": 0.38,
      "light.primaryTop": 0.42,
      "light.primaryBottom": 0.32,
      "light.deep": 0.3,
      "light.deeper": 0.23,
      "dark.accent": 0.68,
      "dark.accentInk": 0.86,
      "dark.primaryTop": 0.46,
      "dark.primaryBottom": 0.37,
    },
  },
];

type Mode = "light" | "dark";

/** Rollen der Marke: sie bekommen Ton und Buntheit des Akzents. */
type BrandRole =
  | "accent"
  | "accentInk"
  | "accentVivid"
  | "primaryTop"
  | "primaryBottom"
  | "deepShadow"
  | "glowShadow"
  | "deep"
  | "deeper"
  | "brandGlow"
  | "backdrop"
  | "onAccent"
  | "price1"
  | "price2"
  | "price3"
  | "price4"
  | "logo1"
  | "logo2"
  | "logo3"
  | "logoRing"
  | "logoDot"
  | "logoHalo"
  | "logoHalo2"
  | "logoShadow";

/** Rollen des Neutralen: sie bekommen nur den zarten Hauch. */
type NeutralRole =
  | "price0"
  | "chartDoors"
  | "chartMet"
  | "chartSoft"
  | "bg"
  | "surface"
  | "surface2"
  | "mapGround"
  | "ink"
  | "ink2"
  | "muted"
  | "tint"
  | "line"
  | "scrim"
  | "glass"
  | "glassSolid"
  | "shade"
  | "segThumb";

type Role = BrandRole | NeutralRole;

/**
 * Das gestaltete Gruen - genau die Werte aus brand.css, globals.css und
 * Logo.tsx. Schatten und Toenungen mit eigener Deckkraft stehen als ihre
 * volle Farbe da.
 */
const GREEN: Record<Mode, Partial<Record<Role, string>>> = {
  light: {
    accent: "#15904a",
    accentInk: "#0c6a34",
    accentVivid: "#2fd161",
    primaryTop: "#16884a",
    primaryBottom: "#0d6634",
    deepShadow: "#083c1e",
    glowShadow: "#0e6c35",
    deep: "#0f4d2a",
    deeper: "#0a361e",
    brandGlow: "#46d680",
    backdrop: "#2ebe69",
    onAccent: "#ffffff",
    price0: "#c7ccc9",
    price1: "#9dbfa8",
    price2: "#5fb37c",
    price3: "#22a052",
    price4: "#0b7a35",
    chartDoors: "#8a978f",
    chartMet: "#36413b",
    chartSoft: "#c9d2cd",
    bg: "#f2f4f3",
    mapGround: "#e3e7e5",
    ink: "#0b1510",
    ink2: "#36413b",
    muted: "#5f6964",
    tint: "#465a50",
    line: "#283c32",
    scrim: "#040e09",
    glass: "#fafcfb",
    glassSolid: "#f8faf9",
    shade: "#10281c",
    logo1: "#46e38e",
    logo2: "#17a852",
    logo3: "#06612f",
    logoRing: "#cff7de",
    logoDot: "#d4f9e1",
    logoHalo: "#f0fff5",
    logoHalo2: "#bdffd6",
    logoShadow: "#00361a",
  },
  dark: {
    accent: "#30d158",
    accentInk: "#34d66b",
    accentVivid: "#30d158",
    primaryTop: "#16884a",
    primaryBottom: "#0e6b37",
    glowShadow: "#17904c",
    deep: "#0e4426",
    deeper: "#062414",
    backdrop: "#30d158",
    onAccent: "#062611",
    price0: "#4a4f4c",
    price1: "#3f6b4e",
    price2: "#2e8f52",
    price3: "#2bb45e",
    price4: "#3be077",
    chartDoors: "#8e9a94",
    chartMet: "#d0d7d3",
    chartSoft: "#36403b",
    surface: "#141917",
    surface2: "#1f2522",
    mapGround: "#1f2522",
    ink: "#f3f6f4",
    ink2: "#d0d7d3",
    muted: "#a3aca7",
    tint: "#788c82",
    line: "#54645c",
    glass: "#1a201d",
    glassSolid: "#1a201d",
    segThumb: "#59625d",
  },
};

const NEUTRAL_ROLES = new Set<Role>([
  "price0",
  "chartDoors",
  "chartMet",
  "chartSoft",
  "bg",
  "surface",
  "surface2",
  "mapGround",
  "ink",
  "ink2",
  "muted",
  "tint",
  "line",
  "scrim",
  "glass",
  "glassSolid",
  "shade",
  "segThumb",
]);

/** Weiss - die Flaeche im Hellen und die Schrift auf der Hauptaktion. */
const WHITE = "#ffffff";

export interface Palette {
  id: AccentId;
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Ton bei einer Helligkeit: helle Stufen im Hauptton, tiefe im tiefen Ton. */
function hueAt(spec: AccentSpec, lightness: number): number {
  const deep = spec.deepHue ?? spec.hue;
  const share = Math.min(1, Math.max(0, (lightness - 0.3) / 0.5));
  // Kuerzester Weg auf dem Farbkreis (Pink liegt um 0 Grad).
  let delta = spec.hue - deep;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return (deep + delta * share + 360) % 360;
}

function brandColor(spec: AccentSpec, mode: Mode, role: BrandRole, base: string): Oklch {
  const source = hexToOklch(base);
  const l = spec.lightness?.[`${mode}.${role}`] ?? source.l;
  return fitGamut({ l, c: source.c * spec.chroma, h: hueAt(spec, l) });
}

function neutralColor(spec: AccentSpec, base: string): Oklch {
  const source = hexToOklch(base);
  return { l: source.l, c: source.c * (spec.neutralChroma ?? 1), h: spec.neutralHue ?? spec.hue };
}

/**
 * Helligkeit schrittweise verschieben, bis der Kontrast reicht - nach unten
 * fuer Schrift auf Hell, nach oben fuer Schrift auf Dunkel. Die Buntheit
 * wird dabei immer wieder auf den Bildschirm begrenzt.
 */
function untilContrast(
  color: Oklch,
  spec: AccentSpec,
  grounds: Array<string | (() => string)>,
  min: number,
  direction: -1 | 1,
  chroma = color.c,
): Oklch {
  let current = color;
  for (let step = 0; step < 200; step += 1) {
    const hex = oklchToHex(current);
    if (grounds.every((ground) => contrast(hex, typeof ground === "function" ? ground() : ground) >= min)) return current;
    const l = Math.min(0.99, Math.max(0.02, current.l + direction * 0.004));
    if (l === current.l) return current;
    current = fitGamut({ l, c: chroma, h: hueAt(spec, l) });
  }
  return current;
}

/** Alle Werte eines Themas. Das Gruen sind die gestalteten Werte selbst. */
export function buildPalette(id: AccentId, options: { tint?: boolean } = {}): Palette {
  const spec = ACCENTS.find((accent) => accent.id === id) ?? ACCENTS[0];
  const tint = options.tint ?? true;
  const modes = {} as Record<Mode, Record<string, string>>;

  for (const mode of ["light", "dark"] as const) {
    const green = GREEN[mode] as Record<string, string>;
    // Das Gruen bleibt Wert fuer Wert, wie es gestaltet ist - ohne Toenung nur mit grauen Neutralen.
    if (spec.id === DEFAULT_ACCENT) {
      modes[mode] = Object.fromEntries(
        Object.entries(green).map(([role, base]) => [
          role,
          !tint && NEUTRAL_ROLES.has(role as Role) ? oklchToHex({ ...hexToOklch(base), c: 0 }) : base,
        ]),
      );
      continue;
    }
    const values: Record<string, Oklch> = {};
    for (const [role, base] of Object.entries(green) as Array<[Role, string]>) {
      if (NEUTRAL_ROLES.has(role)) {
        const neutral = neutralColor(spec, base);
        values[role] = tint ? neutral : { ...neutral, c: 0 };
      } else {
        values[role] = brandColor(spec, mode, role as BrandRole, base);
      }
    }
    tune(values, spec, mode);
    modes[mode] = Object.fromEntries(Object.entries(values).map(([role, color]) => [role, oklchToHex(color)]));
  }
  return { id: spec.id, light: modes.light, dark: modes.dark };
}

/** Kontraste je Rolle nachziehen - die Regeln aus docs/DESIGN.md. */
function tune(values: Record<string, Oklch>, spec: AccentSpec, mode: Mode): void {
  const hex = (role: string) => oklchToHex(values[role]);
  const fixed = (role: BrandRole) => spec.lightness?.[`${mode}.${role}`] !== undefined;

  if (mode === "light") {
    const bg = oklchToHex(values.bg);
    // Bedienelement im Akzent: >= 3 : 1 auf Weiss und auf dem Grund.
    values.accent = untilContrast(values.accent, spec, [WHITE, bg], 3.2, -1);
    // Schrift im Akzent: >= 4,5 : 1 auch auf der Toenung (Akzent 16 % ueber Weiss bzw. Grund).
    const tintOnWhite = () => rgbHex(over(hex("accentVivid"), 0.16, WHITE));
    const tintOnBg = () => rgbHex(over(hex("accentVivid"), 0.16, bg));
    values.accentInk = untilContrast(values.accentInk, spec, [WHITE, bg, tintOnWhite, tintOnBg], 5.2, -1);
    // Hauptaktion: weisse Schrift schon am hellen Ende >= 4,5 : 1, das dunkle Ende im selben Abstand darunter.
    if (!fixed("primaryTop")) values.primaryTop = untilContrast(values.primaryTop, spec, [WHITE], 4.6, -1);
    if (!fixed("primaryBottom")) {
      values.primaryBottom = fitGamut({
        ...values.primaryBottom,
        l: values.primaryTop.l - 0.103,
        h: hueAt(spec, values.primaryTop.l - 0.103),
      });
    }
    // Markenflaeche: weisse Schrift >= 9 : 1, leise Schrift (80 %) >= 4,5 : 1.
    if (!fixed("deep")) values.deep = untilContrast(values.deep, spec, [WHITE], 9.6, -1);
    if (!fixed("deeper")) {
      values.deeper = fitGamut({ ...values.deeper, l: values.deep.l - 0.076, h: hueAt(spec, values.deep.l - 0.076) });
    }
    // Tiefste Preisstufe als Grafik >= 3 : 1 auf Weiss.
    values.price4 = untilContrast(values.price4, spec, [WHITE], 4.5, -1);
  } else {
    const surface = oklchToHex(values.surface);
    const surface2 = oklchToHex(values.surface2);
    values.accent = untilContrast(values.accent, spec, [surface, surface2], 5, 1);
    values.accentVivid = values.accent;
    values.backdrop = values.accent;
    values.accentInk = untilContrast(values.accentInk, spec, [surface, surface2], 7, 1);
    if (!fixed("primaryTop")) values.primaryTop = untilContrast(values.primaryTop, spec, [WHITE], 4.6, -1);
    if (!fixed("primaryBottom")) {
      values.primaryBottom = fitGamut({
        ...values.primaryBottom,
        l: values.primaryTop.l - 0.088,
        h: hueAt(spec, values.primaryTop.l - 0.088),
      });
    }
    values.deep = untilContrast(values.deep, spec, [WHITE], 11, -1);
    values.deeper = fitGamut({ ...values.deeper, l: values.deep.l - 0.11, h: hueAt(spec, values.deep.l - 0.11) });
    // Zeichen auf voller Akzentflaeche (Haken des Abschlusses).
    values.onAccent = untilContrast(values.onAccent, spec, [() => hex("accent")], 7, -1);
  }
}

function rgbHex(rgb: [number, number, number]): string {
  return `#${rgb.map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

/* ------------------------------- CSS ------------------------------------ */

/**
 * Welche Rolle in welches --t-Token geht. "rgb": als Tripel ohne Deckkraft -
 * das Token bringt seine Deckkraft selbst mit (rgb(var(--t-tint) / 0.1)).
 */
const LIGHT_VARS: Array<[string, Role, "hex" | "rgb"]> = [
  ["accent", "accent", "hex"],
  ["accent-ink", "accentInk", "hex"],
  ["accent-vivid", "accentVivid", "hex"],
  ["primary-top", "primaryTop", "hex"],
  ["primary-bottom", "primaryBottom", "hex"],
  ["deep-shadow", "deepShadow", "rgb"],
  ["glow-shadow", "glowShadow", "rgb"],
  ["brand-deep", "deep", "hex"],
  ["brand-deeper", "deeper", "hex"],
  ["brand-glow", "brandGlow", "rgb"],
  ["backdrop", "backdrop", "rgb"],
  ["price-0", "price0", "hex"],
  ["price-1", "price1", "hex"],
  ["price-2", "price2", "hex"],
  ["price-3", "price3", "hex"],
  ["price-4", "price4", "hex"],
  ["chart-doors", "chartDoors", "hex"],
  ["chart-met", "chartMet", "hex"],
  ["chart-doors-soft", "chartSoft", "hex"],
  ["bg", "bg", "hex"],
  ["map-ground", "mapGround", "hex"],
  ["ink", "ink", "hex"],
  ["ink-2", "ink2", "hex"],
  ["muted", "muted", "hex"],
  ["tint", "tint", "rgb"],
  ["line", "line", "rgb"],
  ["scrim", "scrim", "rgb"],
  ["glass", "glass", "rgb"],
  ["glass-solid", "glassSolid", "hex"],
  ["shade", "shade", "rgb"],
  ["logo-1", "logo1", "hex"],
  ["logo-2", "logo2", "hex"],
  ["logo-3", "logo3", "hex"],
  ["logo-ring", "logoRing", "hex"],
  ["logo-dot", "logoDot", "hex"],
  ["logo-halo", "logoHalo", "hex"],
  ["logo-halo-2", "logoHalo2", "hex"],
  ["logo-shadow", "logoShadow", "hex"],
];

const DARK_VARS: Array<[string, Role, "hex" | "rgb"]> = [
  ["accent", "accent", "hex"],
  ["accent-ink", "accentInk", "hex"],
  ["primary-top", "primaryTop", "hex"],
  ["primary-bottom", "primaryBottom", "hex"],
  ["glow-shadow", "glowShadow", "rgb"],
  ["brand-deep", "deep", "hex"],
  ["brand-deeper", "deeper", "hex"],
  ["backdrop", "backdrop", "rgb"],
  ["on-accent", "onAccent", "hex"],
  ["price-0", "price0", "hex"],
  ["price-1", "price1", "hex"],
  ["price-2", "price2", "hex"],
  ["price-3", "price3", "hex"],
  ["price-4", "price4", "hex"],
  ["chart-doors", "chartDoors", "hex"],
  ["chart-met", "chartMet", "hex"],
  ["chart-doors-soft", "chartSoft", "hex"],
  ["surface", "surface", "hex"],
  ["surface-2", "surface2", "hex"],
  ["map-ground", "mapGround", "hex"],
  ["ink", "ink", "hex"],
  ["ink-2", "ink2", "hex"],
  ["muted", "muted", "hex"],
  ["tint", "tint", "rgb"],
  ["line", "line", "rgb"],
  ["glass", "glass", "rgb"],
  ["glass-solid", "glassSolid", "hex"],
  ["seg-thumb", "segThumb", "hex"],
];

/** Welche Rolle in welchem --t-Token steht - fuer die Tests. */
export const THEME_VARS = { light: LIGHT_VARS, dark: DARK_VARS } as const;

/** Nur die Neutralen - fuer "Flächen tönen: aus". */
const NEUTRAL_KEYS = new Set([...NEUTRAL_ROLES].map(String));

function declarations(palette: Palette, only?: Set<string>): string[] {
  const lines: string[] = [];
  for (const [mode, vars, suffix] of [
    ["light", LIGHT_VARS, ""],
    ["dark", DARK_VARS, "-d"],
  ] as const) {
    for (const [name, role, kind] of vars) {
      if (only && !only.has(role)) continue;
      const value = palette[mode][role];
      if (!value) continue;
      lines.push(`  --t-${name}${suffix}: ${kind === "rgb" ? rgbTriplet(value) : value};`);
    }
  }
  return lines;
}

/** Der Inhalt von src/app/themes.css. */
export function themeCss(): string {
  const blocks = ACCENTS.filter((accent) => accent.id !== DEFAULT_ACCENT).map(
    (accent) => `:root[data-accent="${accent.id}"] {\n${declarations(buildPalette(accent.id)).join("\n")}\n}`,
  );
  // Ohne Toenung: Grund, Linien und Glas in reinem Grau - nach den Themen, damit es sie uebersteuert.
  const plain = `:root[data-tint="off"] {\n${declarations(buildPalette(DEFAULT_ACCENT, { tint: false }), NEUTRAL_KEYS).join("\n")}\n}`;
  return [
    "/* Erzeugt von scripts/build-themes.ts aus src/lib/theme-palette.ts - nicht von Hand aendern.",
    "   Neu erzeugen: npm run themes */",
    "",
    ...blocks.flatMap((block) => [block, ""]),
    plain,
    "",
  ].join("\n");
}
