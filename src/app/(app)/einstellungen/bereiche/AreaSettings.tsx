"use client";

import { useState } from "react";
import { IconChart, IconComment, IconMap } from "@/components/icons";
import { usePrefs } from "@/components/PrefsSync";
import { ListLabel, PageHeader } from "@/components/ui";
import { ChoiceRows, SettingIcon, SwitchRow } from "@/components/settings/controls";
import { HOME_COOKIE, type HomeChoice } from "@/lib/home";
import { setPrefs, type AreaId, type StartSection } from "@/lib/preferences";

export interface AreaRights {
  /** Uebersicht des Teams statt "Meine Zahlen". */
  reports: boolean;
  /** Kundenliste mit "Umberatung fällig". */
  customers: boolean;
}

const SECTION_LABEL: Record<StartSection, { title: string; subtitle: string }> = {
  hero: { title: "Kopfkarte", subtitle: "Abschlüsse groß, dazu Türen, Gespräche, Termine" },
  history: { title: "Verlauf", subtitle: "Türen und Abschlüsse je Tag" },
  radar: { title: "Profil", subtitle: "Netzdiagramm gegen den Zeitraum davor" },
  appointments: { title: "Termine", subtitle: "Die nächsten offenen Termine" },
  recalls: { title: "Umberatung fällig", subtitle: "Verträge kurz vor dem Ende" },
  team: { title: "Team", subtitle: "Wer im Team wo steht" },
  reasons: { title: "Ablehnungsgründe", subtitle: "Die häufigsten Gründe im Zeitraum" },
  territories: { title: "Gebiete", subtitle: "Offene Gebiete mit Fortschritt" },
  provider: { title: "Teuerster Grundversorger", subtitle: "Wo das Klingeln am meisten lohnt" },
  contacts: { title: "Kontakte", subtitle: "Die letzten Türen im Zeitraum" },
};

/**
 * Was die App zeigt: Bereiche der Reiter- und Seitenleiste, die Abschnitte
 * der Uebersicht und womit die App startet. Ausgeblendetes bleibt im
 * Profil erreichbar - verloren geht nichts.
 */
export function AreaSettings({ rights, home: initialHome }: { rights: AreaRights; home: HomeChoice }) {
  const prefs = usePrefs();
  const [home, setHome] = useState(initialHome);

  function toggleArea(id: AreaId, shown: boolean) {
    const rest = prefs.hiddenAreas.filter((area) => area !== id);
    setPrefs({ hiddenAreas: shown ? rest : [...rest, id] });
  }
  function toggleSection(id: StartSection, shown: boolean) {
    const rest = prefs.hiddenStart.filter((section) => section !== id);
    setPrefs({ hiddenStart: shown ? rest : [...rest, id] });
  }
  function chooseHome(next: HomeChoice) {
    setHome(next);
    document.cookie = `${HOME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const sections: StartSection[] = [
    "hero",
    "history",
    "radar",
    "appointments",
    ...(rights.customers ? (["recalls"] as const) : []),
    ...(rights.reports ? (["team"] as const) : []),
    "reasons",
    ...(rights.reports ? (["territories", "provider"] as const) : []),
    "contacts",
  ];
  const startLabel = rights.reports ? "Übersicht" : "Meine Zahlen";

  return (
    <div className="page-narrow">
      <PageHeader title="Bereiche" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <ListLabel>Reiter und Seitenleiste</ListLabel>
      <ul className="list list-icons">
        {rights.reports && (
          <SwitchRow
            title="Übersicht"
            subtitle="Zahlen, Termine und Team auf einen Blick"
            icon={<SettingIcon tone="teal"><IconChart /></SettingIcon>}
            checked={!prefs.hiddenAreas.includes("start")}
            onChange={(on) => toggleArea("start", on)}
          />
        )}
        <SwitchRow
          title="Karte"
          subtitle="Gebiete und Preise"
          icon={<SettingIcon tone="blue"><IconMap /></SettingIcon>}
          checked={!prefs.hiddenAreas.includes("map")}
          onChange={(on) => toggleArea("map", on)}
        />
        <SwitchRow
          title="Team"
          subtitle="Feed, Rangliste und Erfolge"
          icon={<SettingIcon tone="purple"><IconComment /></SettingIcon>}
          checked={!prefs.hiddenAreas.includes("team")}
          onChange={(on) => toggleArea("team", on)}
        />
      </ul>
      <p className="list-footer">Klinken und Profil bleiben immer. Ausgeblendetes steht im Profil unter „Meine Arbeit“.</p>

      <ListLabel>Beim Öffnen</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Beim Öffnen der App">
        <ChoiceRows
          name="Beim Öffnen der App"
          value={home}
          onChange={chooseHome}
          choices={[
            { value: "auto", label: "Automatisch", subtitle: rights.reports ? "Übersicht" : "Klinken" },
            { value: "tour", label: "Klinken" },
            { value: "start", label: startLabel },
            { value: "termine", label: "Termine" },
            { value: "gebiete", label: "Karte" },
            { value: "team", label: "Team" },
          ]}
        />
      </ul>

      <ListLabel>{startLabel}</ListLabel>
      <ul className="list">
        {sections.map((id) => (
          <SwitchRow
            key={id}
            title={SECTION_LABEL[id].title}
            subtitle={SECTION_LABEL[id].subtitle}
            checked={!prefs.hiddenStart.includes(id)}
            onChange={(on) => toggleSection(id, on)}
          />
        ))}
      </ul>
      <p className="list-footer">Ausgeblendet ist nur die Ansicht – gezählt wird alles weiter.</p>
    </div>
  );
}
