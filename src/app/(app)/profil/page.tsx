import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { navigation } from "@/lib/nav";
import { getLevelProgress } from "@/lib/level-queries";
import { countAppointments } from "@/lib/queries";
import { Avatar, Cell, ListLabel, PageHeader } from "@/components/ui";
import { NAV_ICONS } from "@/components/nav-icons";
import { InstallCell } from "@/components/InstallHint";
import { PushRows } from "@/components/community/PushToggle";
import { IconCalendar, IconChart, IconSparkles, IconTarget } from "@/components/icons";
import { LogoutCell } from "./LogoutCell";

export const dynamic = "force-dynamic";

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
            <Cell href="/start" icon={<Glyph><IconChart className="h-4 w-4" /></Glyph>} title="Meine Zahlen" />
          </li>
        )}
        <li>
          <Cell
            href="/termine"
            icon={<Glyph><IconCalendar className="h-4 w-4" /></Glyph>}
            title={rights["appointments.team"] ? "Termine" : "Meine Termine"}
            detail={openAppointments > 0 ? openAppointments : undefined}
          />
        </li>
        <li>
          <Cell href="/team/erfolge" icon={<Glyph><IconSparkles className="h-4 w-4" /></Glyph>} title="Erfolge" />
        </li>
      </ul>

      <ListLabel>Dieses Gerät</ListLabel>
      <ul className="list list-icons">
        <PushRows />
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
                      <Glyph>
                        <Icon className="h-4 w-4" />
                      </Glyph>
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
            href={TARIFRECHNER}
            external
            icon={<Glyph><IconTarget className="h-4 w-4" /></Glyph>}
            title="Tarifrechner"
          />
        </li>
      </ul>

      <ul className="list mt-6">
        <LogoutCell />
      </ul>

      <p className="list-footer text-center">
        Carlsson Sales · {user.email}
      </p>
    </div>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph">{children}</span>;
}
