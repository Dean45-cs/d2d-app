import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { navigation } from "@/lib/nav";
import { Cell, ListLabel, PageHeader, type SymbolTone } from "@/components/ui";
import { NAV_ICONS } from "@/components/nav-icons";
import { InstallCell } from "@/components/InstallHint";
import { PowerSaveCell } from "@/components/PowerSave";
import { SettingIcon } from "@/components/settings/controls";
import { IconBell, IconDoor, IconLayers, IconMap, IconPalette, IconTarget } from "@/components/icons";
import { AppearanceDetail, AreaDetail, GoalDetail, OfflineWarmCell, ResetCell } from "./HubParts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einstellungen" };

/**
 * Einstellungen: alles, was sich jeder selbst einrichtet - wie in den
 * iOS-Einstellungen eine gruppierte Liste, dahinter je Bereich eine Seite.
 * Gilt fuer dieses Geraet; nur die Mitteilungsarten haengen am Konto.
 * Fuer die Leitung steht die Verwaltung des Teams darunter.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const nav = navigation(user.role, permissionsFor(user), user.id);

  return (
    <div className="page-narrow">
      <PageHeader title="Einstellungen" back={{ href: "/profil", label: "Profil", mobileOnly: true }} />

      <ul className="list list-icons">
        <li>
          <Cell
            href="/einstellungen/darstellung"
            icon={<SettingIcon tone="purple"><IconPalette /></SettingIcon>}
            title="Darstellung"
            subtitle={<AppearanceDetail />}
          />
        </li>
      </ul>

      <ListLabel>Arbeit</ListLabel>
      <ul className="list list-icons">
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
      </ul>

      <ListLabel>Mitteilungen</ListLabel>
      <ul className="list list-icons">
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
      </ul>

      {nav.admin.length > 0 && (
        <>
          <ListLabel>Verwaltung</ListLabel>
          <ul className="list list-icons">
            {nav.admin.map((item) => {
              const Icon = NAV_ICONS[item.icon].line;
              return (
                <li key={item.href}>
                  <Cell
                    href={item.href}
                    icon={
                      <SettingIcon tone={ADMIN_TONES[item.icon] ?? "slate"}>
                        <Icon />
                      </SettingIcon>
                    }
                    title={item.label}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ul className="list list-icons mt-8">
        <ResetCell />
      </ul>
      <p className="list-footer">
        Einstellungen gelten für dieses Gerät. Worüber Push-Nachrichten kommen, gilt für dein Konto.
      </p>
    </div>
  );
}

/** Ton je Verwaltungseintrag - wie im Profil. */
const ADMIN_TONES: Partial<Record<string, SymbolTone>> = {
  users: "blue",
  invite: "indigo",
  shield: "slate",
  list: "purple",
  cog: "teal",
};
