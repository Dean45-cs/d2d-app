"use client";

import {
  IconBolt,
  IconCalendar,
  IconChat,
  IconCrosshair,
  IconExternal,
  IconEye,
  IconNavigate,
  IconQr,
  IconTarget,
} from "@/components/icons";
import { ListLabel, PageHeader } from "@/components/ui";
import { ChoiceRows, PrefChoice, PrefSwitch, SettingIcon, useStoredChoice } from "@/components/settings/controls";
import { usePowerSaving } from "@/components/PowerSave";

const PRODUCTS = ["BEIDES", "STROM", "GAS"] as const;
const ORDERS = ["near", "list"] as const;

/**
 * Klinken nach eigenem Geschmack: was in der Liste steht, was der Kopf
 * zeigt, welche Hinweise kommen und wie der Standort laeuft. Erfassen,
 * Rueckgaengig und Nachsenden ohne Netz bleiben immer gleich.
 */
export function TourSettings() {
  const saving = usePowerSaving();
  // Dieselben Merker, die Klinken selbst fuehrt - hier zum Voreinstellen.
  const [product, setProduct] = useStoredChoice("d2d_product", "BEIDES", PRODUCTS);
  const [order, setOrder] = useStoredChoice("d2d_street_order", "near", ORDERS);

  return (
    <div className="page-narrow">
      <PageHeader title="Klinken" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <ListLabel>Liste</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="tourOnlyOpen"
          title="Nur offene Türen"
          subtitle="Beim Öffnen gleich gefiltert – angetroffene und gesperrte ausgeblendet"
          icon={<SettingIcon tone="blue"><IconEye /></SettingIcon>}
        />
      </ul>
      <ListLabel>Straßen sortieren</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Straßen sortieren">
        <ChoiceRows
          name="Straßen sortieren"
          value={order}
          onChange={setOrder}
          choices={[
            { value: "near", label: "Nach Nähe", subtitle: "Die nächste Straße mit offenen Türen zuerst" },
            { value: "list", label: "Wie im Gebiet", subtitle: "In der Reihenfolge, in der die Leitung sie angelegt hat" },
          ]}
        />
      </ul>

      <ListLabel>Kopf</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="tourGoalRing"
          title="Tagesziel-Ring"
          subtitle="Türen heute gegen dein Tagesziel"
          icon={<SettingIcon tone="teal"><IconTarget /></SettingIcon>}
        />
        <PrefSwitch
          name="tourProvider"
          title="Versorger und Preis"
          subtitle="Grundversorger des Gebiets mit Preisstufe – das Argument an der Tür"
          icon={<SettingIcon tone="brown"><IconBolt /></SettingIcon>}
        />
        <PrefSwitch
          name="tourCard"
          title="Visitenkarte"
          subtitle="QR-Code oben rechts – nur bei eingeschalteter Visitenkarte"
          icon={<SettingIcon tone="slate"><IconQr /></SettingIcon>}
        />
      </ul>

      <ListLabel>Hinweise</ListLabel>
      <ul className="list list-icons">
        <PrefSwitch
          name="tourAppointments"
          title="Fällige Termine"
          subtitle="Termine von heute oben über der Liste"
          icon={<SettingIcon tone="indigo"><IconCalendar /></SettingIcon>}
        />
        <PrefSwitch
          name="tourNearbyHint"
          title="Nächste offene Tür"
          subtitle="Vorschlag, wenn die gewählte Tür weit weg ist"
          icon={<SettingIcon tone="purple"><IconNavigate /></SettingIcon>}
        />
        <PrefSwitch
          name="tourDistance"
          title="Entfernung zur Tür"
          subtitle="„ca. 120 m entfernt“ in der Ergebnisleiste"
          icon={<SettingIcon tone="blue"><IconCrosshair /></SettingIcon>}
        />
        <PrefSwitch
          name="tourConfirm"
          title="Termin bestätigen"
          subtitle="Nach einem Termin mit Rufnummer: WhatsApp oder SMS anbieten"
          icon={<SettingIcon tone="magenta"><IconChat /></SettingIcon>}
        />
      </ul>

      <ListLabel>Standort</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Standort beim Klinken">
        <PrefChoice
          name="tourLocation"
          label="Standort beim Klinken"
          choices={[
            {
              value: "auto",
              label: "Automatisch",
              subtitle: "Läuft mit, solange du die App bedienst – für Entfernungen und Vorschläge",
            },
            {
              value: "tap",
              label: "Nur auf Antippen",
              subtitle: "Erst bei „In meiner Nähe“ – schont den Akku, ohne Entfernungen dazwischen",
            },
          ]}
        />
      </ul>
      <p className="list-footer">
        {saving
          ? "Im Super-Energiesparmodus gilt immer „Nur auf Antippen“."
          : "Ohne frischen Standort speichert ein Eintrag keine Position."}
      </p>

      <ListLabel>Auftrag starten</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Produkt vorauswählen">
        <ChoiceRows
          name="Produkt vorauswählen"
          value={product}
          onChange={setProduct}
          choices={[
            { value: "BEIDES", label: "Strom + Gas" },
            { value: "STROM", label: "Strom" },
            { value: "GAS", label: "Gas" },
          ]}
        />
      </ul>
      <p className="list-footer">
        <IconExternal className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Vorausgewählt im Blatt vor dem Tarifrechner – merkt sich danach die letzte Wahl.
      </p>
    </div>
  );
}
