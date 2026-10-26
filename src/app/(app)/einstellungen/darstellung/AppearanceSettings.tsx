"use client";

import { useMemo } from "react";
import { IconCheck, IconContrast, IconLayers, IconMoon, IconSparkles, IconSun } from "@/components/icons";
import { LogoMark } from "@/components/Logo";
import { usePowerSaving } from "@/components/PowerSave";
import { usePrefs } from "@/components/PrefsSync";
import { ListLabel, PageHeader, ProgressRing, Switch } from "@/components/ui";
import { PrefChoice, PrefSwitch, SettingIcon } from "@/components/settings/controls";
import { ACCENT_IDS, ACCENT_LABEL, type AccentId } from "@/lib/accents";
import { setPrefs, type ThemeChoice } from "@/lib/preferences";
import { buildPalette, type Palette } from "@/lib/theme-palette";

/**
 * Darstellung: Hell/Dunkel, Akzentfarbe, Schrift und Effekte. Jede Wahl
 * wirkt sofort auf die ganze App - die Vorschau oben ist die App selbst.
 */
export function AppearanceSettings() {
  const prefs = usePrefs();
  const saving = usePowerSaving();
  const palettes = useMemo(() => new Map(ACCENT_IDS.map((id) => [id, buildPalette(id)])), []);
  const current = palettes.get(prefs.accent)!;

  return (
    <div className="page-narrow">
      <PageHeader title="Darstellung" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <Preview />

      <ListLabel>Erscheinungsbild</ListLabel>
      <div className="surface p-4">
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Erscheinungsbild">
          {(["system", "light", "dark"] as const).map((mode) => (
            <ModeTile
              key={mode}
              mode={mode}
              palette={current}
              selected={(saving ? "dark" : prefs.theme) === mode}
              disabled={saving}
              onPick={() => setPrefs({ theme: mode })}
            />
          ))}
        </div>
      </div>
      <p className="list-footer">
        {saving
          ? "Im Super-Energiesparmodus ist die App immer dunkel."
          : "Automatisch folgt Hell und Dunkel dem Gerät – abends dunkel, wenn das System es auch ist."}
      </p>

      <ListLabel>Akzentfarbe</ListLabel>
      <div className="surface px-2 py-4">
        <div className="grid grid-cols-5 gap-y-4" role="radiogroup" aria-label="Akzentfarbe">
          {ACCENT_IDS.map((id) => (
            <AccentSwatch
              key={id}
              id={id}
              palette={palettes.get(id)!}
              selected={prefs.accent === id}
              onPick={() => setPrefs({ accent: id })}
            />
          ))}
        </div>
      </div>
      <ul className="list list-icons mt-4">
        <PrefSwitch
          name="tint"
          title="Flächen tönen"
          subtitle="Grund, Linien und Glas mit einem Hauch der Akzentfarbe"
          icon={<SettingIcon tone="purple"><IconLayers /></SettingIcon>}
        />
      </ul>
      <p className="list-footer">
        Knöpfe, Schrift, Kopfkarte, Logo und die Preisstufen der Karte nehmen die Farbe an. Rot und Bernstein bleiben
        Warnungen – immer mit Wort oder Zeichen.
      </p>

      <ListLabel>Textgröße</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Textgröße">
        <PrefChoice
          name="textSize"
          label="Textgröße"
          choices={[
            { value: "m", label: "Standard", leading: <SizeSample size={15} /> },
            { value: "l", label: "Groß", leading: <SizeSample size={17} /> },
            { value: "xl", label: "Sehr groß", leading: <SizeSample size={19} /> },
          ]}
        />
      </ul>
      <p className="list-footer">Alles wächst mit – Schrift, Knöpfe und Abstände.</p>

      <ListLabel>Effekte</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="glass"
          title="Glas"
          subtitle={saving ? "Im Energiesparmodus aus" : "Leisten und Blätter durchscheinend – aus: feste Flächen"}
          icon={<SettingIcon tone="blue"><IconLayers /></SettingIcon>}
          disabled={saving}
        />
        <PrefSwitch
          name="motion"
          title="Animationen"
          subtitle={saving ? "Im Energiesparmodus aus" : "Übergänge, Blätter, Haken beim Abschluss"}
          icon={<SettingIcon tone="indigo"><IconSparkles /></SettingIcon>}
          disabled={saving}
        />
        <PrefSwitch
          name="contrast"
          title="Kontrast erhöhen"
          subtitle="Kräftigere Linien und Schrift, feste Flächen – gut in der Sonne"
          icon={<SettingIcon tone="slate"><IconContrast /></SettingIcon>}
        />
        <PrefSwitch
          name="tabbarShrink"
          title="Reiterleiste verkleinern"
          subtitle="Beim Rollen schrumpft sie auf den aktiven Reiter (Handy)"
          icon={<SettingIcon tone="teal"><IconSparkles /></SettingIcon>}
        />
      </ul>
    </div>
  );
}

/** Die App im Kleinen - aus denselben Bausteinen, darum immer im aktuellen Stand. */
function Preview() {
  return (
    <section className="surface overflow-hidden p-4" aria-label="Vorschau">
      <div className="hero !p-4">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1">
            <p className="hero-label">Abschlüsse heute</p>
            <p className="kpi text-title-1">3</p>
          </div>
          <span className="hero-pill">31 % Quote</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="btn btn-primary btn-sm pointer-events-none">Auftrag starten</span>
        <span className="chip pointer-events-none" aria-pressed="true">
          Strom + Gas
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <ProgressRing value={14} max={20} size={36} stroke={4} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-subhead font-semibold">14 von 20 Türen</span>
          <span className="block truncate text-footnote text-accent-ink">Alle anzeigen</span>
        </span>
        <span className="pointer-events-none">
          <Switch checked onChange={() => undefined} label="Beispiel" />
        </span>
      </div>
    </section>
  );
}

/** Hell, Dunkel, Automatisch - als kleines Bild der App in der gewaehlten Farbe. */
function ModeTile({
  mode,
  palette,
  selected,
  disabled,
  onPick,
}: {
  mode: ThemeChoice;
  palette: Palette;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const label = mode === "system" ? "Automatisch" : mode === "light" ? "Hell" : "Dunkel";
  const Icon = mode === "dark" ? IconMoon : IconSun;
  const light = { bg: palette.light.bg, card: "#ffffff", ink: palette.light.ink, line: palette.light.chartSoft, accent: palette.light.accent };
  const dark = { bg: "#000000", card: palette.dark.surface, ink: palette.dark.ink, line: palette.dark.chartSoft, accent: palette.dark.accent };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onPick}
      className="group flex flex-col items-center gap-2 disabled:opacity-60"
    >
      <span
        className={`relative block aspect-[3/4] w-full max-w-[104px] overflow-hidden rounded-lg ring-1 ring-separator transition-shadow ${
          selected ? "!ring-[3px] !ring-accent" : ""
        }`}
        aria-hidden="true"
      >
        {mode === "system" ? (
          <>
            <MiniApp colors={light} />
            <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
              <MiniApp colors={dark} />
            </span>
          </>
        ) : (
          <MiniApp colors={mode === "light" ? light : dark} />
        )}
      </span>
      <span className="flex items-center gap-1 text-subhead font-semibold">
        <Icon className="h-4 w-4 text-muted" />
        {label}
      </span>
      <span
        className={`grid h-5 w-5 place-items-center rounded-full ${selected ? "bg-accent text-on-accent" : "ring-1 ring-separator"}`}
        aria-hidden="true"
      >
        {selected && <IconCheck className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function MiniApp({ colors }: { colors: { bg: string; card: string; ink: string; line: string; accent: string } }) {
  return (
    <span className="absolute inset-0 flex flex-col gap-1.5 p-2" style={{ background: colors.bg }}>
      <span className="h-1.5 w-1/2 rounded-full" style={{ background: colors.ink, opacity: 0.85 }} />
      <span className="flex flex-col gap-1 rounded-md p-1.5" style={{ background: colors.card }}>
        <span className="h-1 w-3/4 rounded-full" style={{ background: colors.line }} />
        <span className="h-1 w-1/2 rounded-full" style={{ background: colors.line }} />
      </span>
      <span className="flex flex-col gap-1 rounded-md p-1.5" style={{ background: colors.card }}>
        <span className="h-1 w-2/3 rounded-full" style={{ background: colors.line }} />
        <span className="h-1 w-1/3 rounded-full" style={{ background: colors.accent }} />
      </span>
      <span className="mt-auto h-3 w-full rounded-full" style={{ background: colors.accent }} />
    </span>
  );
}

/** Ein Farbknopf: der Verlauf der Hauptaktion, gewaehlt mit Ring und Haken. */
function AccentSwatch({
  id,
  palette,
  selected,
  onPick,
}: {
  id: AccentId;
  palette: Palette;
  selected: boolean;
  onPick: () => void;
}) {
  const { primaryTop, primaryBottom, logo1 } = palette.light;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ACCENT_LABEL[id]}
      onClick={onPick}
      className="flex min-w-0 flex-col items-center gap-1.5"
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-full text-white transition-transform active:scale-95 ${
          selected ? "ring-[3px] ring-offset-2 ring-offset-surface" : ""
        }`}
        style={{
          background: `radial-gradient(120% 120% at 30% 20%, ${logo1}, transparent 55%), linear-gradient(160deg, ${primaryTop}, ${primaryBottom})`,
          // Der Ring in der Farbe selbst - so steht die Wahl auch neben ihrer Nachbarin fest.
          ["--tw-ring-color" as string]: primaryTop,
        }}
      >
        {selected && <IconCheck className="h-5 w-5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]" />}
      </span>
      <span className={`max-w-full truncate text-caption ${selected ? "font-semibold text-ink" : "text-muted"}`}>
        {ACCENT_LABEL[id]}
      </span>
    </button>
  );
}

function SizeSample({ size }: { size: number }) {
  return (
    <span className="glyph font-semibold" style={{ fontSize: size }} aria-hidden="true">
      Aa
    </span>
  );
}
