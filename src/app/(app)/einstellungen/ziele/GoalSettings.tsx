"use client";

import { useSyncExternalStore } from "react";
import { IconChat, IconCheckCircle, IconDoor, IconSparkles, IconTrophy } from "@/components/icons";
import { ListLabel, PageHeader } from "@/components/ui";
import { GoalStepper, PrefSwitch, SettingIcon, SwitchRow } from "@/components/settings/controls";
import { onXpHintsChange, setXpHints, xpHintsOn } from "@/lib/level-feedback";

/** Tagesziele fuer die Ringe und was nach einem Besuch gemeldet wird. */
export function GoalSettings() {
  const xpHints = useSyncExternalStore(onXpHintsChange, xpHintsOn, () => true);

  return (
    <div className="page-narrow">
      <PageHeader title="Ziele & Erfolge" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <ListLabel>Tagesziele</ListLabel>
      <ul className="list list-icons">
        <GoalStepper
          name="goalDoors"
          title="Türen"
          unit={["Tür", "Türen"]}
          icon={<SettingIcon tone="slate"><IconDoor /></SettingIcon>}
        />
        <GoalStepper
          name="goalMet"
          title="Gespräche"
          unit={["Gespräch", "Gespräche"]}
          icon={<SettingIcon tone="indigo"><IconChat /></SettingIcon>}
        />
        <GoalStepper
          name="goalSales"
          title="Abschlüsse"
          unit={["Abschluss", "Abschlüsse"]}
          icon={<SettingIcon tone="teal"><IconCheckCircle /></SettingIcon>}
        />
      </ul>
      <p className="list-footer">
        Für die Ringe unter „Erfolge“ und den Ring beim Klinken. XP gibt es weiter nur für die Besuche selbst.
      </p>

      <ListLabel>Nach einem Besuch</ListLabel>
      <ul className="list list-icons">
        <SwitchRow
          title="XP-Hinweise"
          subtitle="„+100 XP“ in der Meldung nach einem Besuch"
          icon={<SettingIcon tone="brown"><IconSparkles /></SettingIcon>}
          checked={xpHints}
          onChange={setXpHints}
        />
        <PrefSwitch
          name="levelUp"
          title="Level-Aufstieg melden"
          subtitle="Eigene Meldung mit dem neuen Titel, wenn ein Level erreicht ist"
          icon={<SettingIcon tone="purple"><IconTrophy /></SettingIcon>}
        />
      </ul>
    </div>
  );
}
