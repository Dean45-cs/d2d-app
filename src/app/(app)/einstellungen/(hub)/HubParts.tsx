"use client";

import { useRouter } from "next/navigation";
import { IconCloudUp, IconUndo } from "@/components/icons";
import { usePowerSaving } from "@/components/PowerSave";
import { usePrefs } from "@/components/PrefsSync";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell } from "@/components/ui";
import { PrefSwitch, SettingIcon } from "@/components/settings/controls";
import { ACCENT_LABEL } from "@/lib/accents";
import { HOME_COOKIE } from "@/lib/home";
import { setXpHints } from "@/lib/level-feedback";
import { setPowerSaving } from "@/lib/power";
import { resetPrefs } from "@/lib/preferences";
import { PUSH_BANNER_KEY } from "@/components/community/PushToggle";

/** "Rot · Dunkel · Groß" - was unter Darstellung gerade gilt. */
export function AppearanceDetail() {
  const prefs = usePrefs();
  const saving = usePowerSaving();
  const mode = saving ? "Dunkel" : prefs.theme === "light" ? "Hell" : prefs.theme === "dark" ? "Dunkel" : "Automatisch";
  const size = prefs.textSize === "l" ? "Groß" : prefs.textSize === "xl" ? "Sehr groß" : null;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="truncate">{[ACCENT_LABEL[prefs.accent], mode, size].filter(Boolean).join(" · ")}</span>
    </span>
  );
}

/** "20 Türen" - das Tagesziel. */
export function GoalDetail() {
  const prefs = usePrefs();
  return <>{prefs.goalDoors} Türen</>;
}

/** Wie viele Bereiche oder Abschnitte ausgeblendet sind. */
export function AreaDetail() {
  const prefs = usePrefs();
  const hidden = prefs.hiddenAreas.length + prefs.hiddenStart.length;
  return <>{hidden === 0 ? "Alle" : `${hidden} aus`}</>;
}

export function OfflineWarmCell() {
  return (
    <PrefSwitch
      name="offlineWarm"
      title="Ohne Netz starten"
      subtitle="Klinken und Termine im Hintergrund für das Funkloch speichern"
      icon={<SettingIcon tone="blue"><IconCloudUp /></SettingIcon>}
    />
  );
}

/** Merker, die Seiten selbst fuehren und die "Zuruecksetzen" mit leert. */
const PAGE_MEMORY = ["d2d.mapType", "d2d_street_order", "d2d_product", PUSH_BANNER_KEY];

/** Alles auf Anfang - Farbe, Schalter, Merker, Startseite. Mitteilungsarten bleiben (Konto). */
export function ResetCell() {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  async function reset() {
    const ok = await confirm({
      title: "Alle Einstellungen zurücksetzen?",
      text: "Farbe, Darstellung, Klinken, Karte, Bereiche, Ziele und Energiesparmodus auf diesem Gerät sind danach wie beim ersten Start. Worüber Push kommt, bleibt.",
      confirmLabel: "Zurücksetzen",
      danger: true,
    });
    if (!ok) return;
    resetPrefs();
    setXpHints(true);
    setPowerSaving(false);
    try {
      for (const key of PAGE_MEMORY) window.localStorage.removeItem(key);
    } catch {
      // Ohne Speicher gab es auch keine Merker.
    }
    document.cookie = `${HOME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    toast("Einstellungen zurückgesetzt");
    router.refresh();
  }

  return (
    <li>
      <Cell
        onClick={() => void reset()}
        icon={<SettingIcon tone="slate"><IconUndo /></SettingIcon>}
        title="Alle Einstellungen zurücksetzen"
        tone="danger"
        chevron={false}
      />
      {dialog}
    </li>
  );
}
