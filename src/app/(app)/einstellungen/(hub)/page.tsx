import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Cell, ListLabel, PageHeader } from "@/components/ui";
import { InstallCell } from "@/components/InstallHint";
import { PowerSaveCell } from "@/components/PowerSave";
import { SettingIcon } from "@/components/settings/controls";
import { IconBell, IconDoor, IconLayers, IconMap, IconPalette, IconTarget } from "@/components/icons";
import { AppearanceDetail, AreaDetail, GoalDetail, OfflineWarmCell, ResetCell } from "./HubParts";
import { PasswordCell } from "./PasswordCell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einstellungen" };

/**
 * Einstellungen: alles, was sich jeder selbst einrichtet - wie in den
 * iOS-Einstellungen eine gruppierte Liste, dahinter je Bereich eine Seite.
 * Gilt fuer dieses Geraet; nur die Mitteilungsarten haengen am Konto.
 * Die Verwaltung des Teams steht einmal - im Profil und in der Seitenleiste.
 */
export default async function SettingsPage() {
  await requireUser();

  return (
    <div className="page-narrow">
      <PageHeader title="Einstellungen" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />

      {/* Eine Liste statt dreier Gruppen - sechs Zeilen brauchen keine Ueberschriften. */}
      <ul className="list list-icons">
        <li>
          <Cell
            href="/einstellungen/darstellung"
            icon={<SettingIcon tone="purple"><IconPalette /></SettingIcon>}
            title="Darstellung"
            subtitle={<AppearanceDetail />}
          />
        </li>
        <li>
          <Cell
            href="/einstellungen/klinken"
            icon={<SettingIcon tone="teal"><IconDoor /></SettingIcon>}
            title="Klinken"
            subtitle="Liste, Kopf, Hinweise, Standort"
          />
        </li>
        <li>
          <Cell
            href="/einstellungen/karte"
            icon={<SettingIcon tone="blue"><IconMap /></SettingIcon>}
            title="Karte"
            subtitle="Ansicht, dunkle Karte, Standort im Gebiet"
          />
        </li>
        <li>
          <Cell
            href="/einstellungen/bereiche"
            icon={<SettingIcon tone="indigo"><IconLayers /></SettingIcon>}
            title="Bereiche"
            subtitle="Reiter, Startseite, Übersicht"
            detail={<AreaDetail />}
          />
        </li>
        <li>
          <Cell
            href="/einstellungen/ziele"
            icon={<SettingIcon tone="brown"><IconTarget /></SettingIcon>}
            title="Ziele & Erfolge"
            subtitle="Tagesziele, XP, Level"
            detail={<GoalDetail />}
          />
        </li>
        <li>
          <Cell
            href="/einstellungen/mitteilungen"
            icon={<SettingIcon tone="magenta"><IconBell /></SettingIcon>}
            title="Mitteilungen"
            subtitle="Push, worüber, Meldungen in der App"
          />
        </li>
      </ul>

      <ListLabel>Dieses Gerät</ListLabel>
      <ul className="list list-icons">
        <PowerSaveCell />
        <OfflineWarmCell />
        <InstallCell />
        <ResetCell />
      </ul>

      <ListLabel>Konto</ListLabel>
      <ul className="list list-icons">
        <PasswordCell />
      </ul>
      <p className="list-footer">
        Einstellungen gelten für dieses Gerät. Worüber Push-Nachrichten kommen, gilt für dein Konto.
      </p>
    </div>
  );
}
