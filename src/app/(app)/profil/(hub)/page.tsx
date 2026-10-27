import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { navigation } from "@/lib/nav";
import { getLevelProgress } from "@/lib/level-queries";
import { countAppointments } from "@/lib/queries";
import { countCustomers } from "@/lib/customers";
import { cardSettings } from "@/lib/card-queries";
import { berlinToday } from "@/lib/contracts";
import { Avatar, Cell, ListLabel, PageHeader, ToneTile, type SymbolTone } from "@/components/ui";
import { NAV_ICONS } from "@/components/nav-icons";
import { InstallCell } from "@/components/InstallHint";
import { PowerSaveCell } from "@/components/PowerSave";
import {
  IconCalendar,
  IconChart,
  IconCog,
  IconComment,
  IconContacts,
  IconMap,
  IconPlay,
  IconQr,
  IconSparkles,
  IconTarget,
} from "@/components/icons";
import { LogoutCell } from "./LogoutCell";
import { PasswordCell } from "./PasswordCell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profil" };

const TARIFRECHNER = process.env.NEXT_PUBLIC_TARIFRECHNER_URL ?? "https://portal-ep24.de/menues/tarifrechner/";

/**
 * Der Reiter "Profil": man selbst, die eigenen Listen, das Geraet - und fuer
 * die Leitung die Verwaltung. Alles als gruppierte Liste wie in den
 * iOS-Einstellungen; jede Seite dahinter prueft ihre Rechte selbst.
 */
export default async function ProfileHubPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  const nav = navigation(user.role, rights, user.id);
  const level = getLevelProgress(user.team_id, user.id);
  const openAppointments = countAppointments(user.team_id, { userId: user.id }).open;
  const dueCustomers = rights["customers.manage"] ? countCustomers(user.team_id, berlinToday()).due : 0;
  const cardOn = cardSettings(user.id).token !== null;

  return (
    <div className="page-narrow">
      <PageHeader title="Profil" />

      <ul className="list">
        <li>
          <Cell
            href={`/profil/${user.id}`}
            icon={<Avatar name={user.name} src={user.avatar} size={56} />}
            title={<span className="text-title-3">{user.name}</span>}
            subtitle={`Lv. ${level.level} · ${level.title}`}
            className="min-h-20"
          />
        </li>
      </ul>

      <ListLabel>Meine Arbeit</ListLabel>
      <ul className="list list-icons">
        {!rights["reports.team"] && (
          <li>
            <Cell href="/start" icon={<ToneTile tone="teal"><IconChart className="h-4 w-4" /></ToneTile>} title="Meine Zahlen" />
          </li>
        )}
        <li>
          <Cell
            href="/termine"
            icon={<ToneTile tone="indigo"><IconCalendar className="h-4 w-4" /></ToneTile>}
            title={rights["appointments.team"] ? "Termine" : "Meine Termine"}
            detail={openAppointments > 0 ? openAppointments : undefined}
          />
        </li>
        <li>
          <Cell
            href="/profil/visitenkarte"
            icon={<ToneTile tone="teal"><IconQr className="h-4 w-4" /></ToneTile>}
            title="Visitenkarte"
            detail={cardOn ? "An" : "Aus"}
          />
        </li>
        {rights["customers.manage"] && (
          <li>
            <Cell
              href="/kunden"
              icon={<ToneTile tone="blue"><IconContacts className="h-4 w-4" /></ToneTile>}
              title="Kunden"
              detail={dueCustomers > 0 ? `${dueCustomers} fällig` : undefined}
            />
          </li>
        )}
        <li>
          <Cell href="/team/erfolge" icon={<ToneTile tone="brown"><IconSparkles className="h-4 w-4" /></ToneTile>} title="Erfolge" />
        </li>
        {/* In den Einstellungen ausgeblendete Bereiche bleiben hier erreichbar (globals.css, data-area-link). */}
        {rights["reports.team"] && (
          <li data-area-link="start">
            <Cell href="/start" icon={<ToneTile tone="teal"><IconChart className="h-4 w-4" /></ToneTile>} title="Übersicht" />
          </li>
        )}
        <li data-area-link="map">
          <Cell href="/gebiete" icon={<ToneTile tone="blue"><IconMap className="h-4 w-4" /></ToneTile>} title="Karte" />
        </li>
        <li data-area-link="team">
          <Cell href="/team" icon={<ToneTile tone="purple"><IconComment className="h-4 w-4" /></ToneTile>} title="Team" />
        </li>
      </ul>

      <ListLabel>Dieses Gerät</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell
            href="/einstellungen"
            icon={<ToneTile tone="slate"><IconCog className="h-4 w-4" /></ToneTile>}
            title="Einstellungen"
            subtitle="Farbe, Klinken, Karte, Mitteilungen …"
          />
        </li>
        <PowerSaveCell />
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
                      <ToneTile tone={ADMIN_TONES[item.icon] ?? "slate"}>
                        <Icon className="h-4 w-4" />
                      </ToneTile>
                    }
                    title={item.label}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ListLabel>Werkzeuge</ListLabel>
      <ul className="list list-icons">
        <li>
          <Cell
            href="/profil/einfuehrung"
            icon={<ToneTile tone="magenta"><IconPlay className="h-4 w-4" /></ToneTile>}
            title="Einführung"
            subtitle="Alle Funktionen als Video"
          />
        </li>
        <li>
          <Cell
            href={TARIFRECHNER}
            external
            icon={<ToneTile tone="teal"><IconTarget className="h-4 w-4" /></ToneTile>}
            title="Tarifrechner"
          />
        </li>
      </ul>

      <ListLabel>Konto</ListLabel>
      <ul className="list list-icons">
        <PasswordCell />
      </ul>

      <ul className="list mt-6">
        <LogoutCell userId={user.id} />
      </ul>

      <p className="list-footer text-center">
        Carlsson Sales · {user.email}
      </p>
    </div>
  );
}

/** Ton je Verwaltungseintrag - wie die farbigen Zeichen der iOS-Einstellungen. */
const ADMIN_TONES: Partial<Record<string, SymbolTone>> = {
  users: "blue",
  invite: "indigo",
  shield: "slate",
  list: "purple",
  cog: "teal",
};
