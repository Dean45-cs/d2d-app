"use client";

import { IconLayers, IconMoon, IconNavigate } from "@/components/icons";
import { usePowerSaving } from "@/components/PowerSave";
import { ListLabel, PageHeader } from "@/components/ui";
import { ChoiceRows, PrefSwitch, SettingIcon, useStoredChoice } from "@/components/settings/controls";

const MAP_TYPES = ["standard", "hybrid"] as const;

/** Karten der App: Ansicht beim Oeffnen, dunkle Karte, Standort im Gebiet. */
export function MapSettings() {
  const saving = usePowerSaving();
  // Derselbe Merker wie der Ebenen-Knopf auf der Karte (MapView).
  const [type, setType] = useStoredChoice("d2d.mapType", "standard", MAP_TYPES);

  return (
    <div className="page-narrow">
      <PageHeader title="Karte" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <ListLabel>Ansicht beim Öffnen</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Kartenansicht">
        <ChoiceRows
          name="Kartenansicht"
          value={type}
          onChange={setType}
          choices={[
            { value: "standard", label: "Karte", subtitle: "Straßen und Hausnummern, am schnellsten geladen" },
            { value: "hybrid", label: "Satellit", subtitle: "Luftbild mit Straßennamen – wo Apple Karten oder ein Luftbild eingerichtet ist" },
          ]}
        />
      </ul>
      <p className="list-footer">
        {saving ? "Im Super-Energiesparmodus immer „Karte“ – Luftbilder sind die schwersten Kacheln." : "Der Ebenen-Knopf auf der Karte wechselt jederzeit."}
      </p>

      <ListLabel>Darstellung</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="mapDark"
          title="Dunkle Karte"
          subtitle="Im Dunkelmodus auch die Karte dunkel – aus: immer hell, besser bei Sonne"
          icon={<SettingIcon tone="indigo"><IconMoon /></SettingIcon>}
        />
      </ul>

      <ListLabel>Standort</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="mapAutoLocate"
          title="Im Gebiet mitverfolgen"
          subtitle="Der blaue Punkt läuft auf der Gebietskarte von selbst mit – aus: erst auf Antippen"
          icon={<SettingIcon tone="blue"><IconNavigate /></SettingIcon>}
          disabled={saving}
        />
      </ul>
      <p className="list-footer">
        <IconLayers className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Teilgebiete, Preisstufen und Gebietsgrenzen tragen die Akzentfarbe aus „Darstellung“.
      </p>
    </div>
  );
}
