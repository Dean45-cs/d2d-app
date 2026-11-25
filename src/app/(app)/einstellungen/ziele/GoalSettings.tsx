"use client";

import { IconChat, IconCheckCircle, IconDoor } from "@/components/icons";
import { ListLabel, PageHeader } from "@/components/ui";
import { GoalStepper, SettingIcon } from "@/components/settings/controls";

/** Tagesziele fuer die Ringe. Die Ziele fuer den naechsten Rang stellt die Geschaeftsfuehrung unter Raenge ein. */
export function GoalSettings() {
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
        Für die Ringe unter „Erfolge“ und den Ring beim Klinken. Was für den nächsten Rang fehlt, steht unter Team › Karriere.
      </p>
    </div>
  );
}
