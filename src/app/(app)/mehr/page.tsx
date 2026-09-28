import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { navigation } from "@/lib/nav";
import { AccountCard, LogoutRow } from "@/components/AppNav";
import { NAV_ICONS } from "@/components/nav-icons";
import { GroupLabel, PageHeader } from "@/components/ui";
import { IconChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Farbe des Symbols je Bereich - wie in den iOS-Einstellungen. */
const TINT: Record<string, string> = {
  "/gebiete": "var(--brand-600)",
  "/feed": "var(--brand-500)",
  "/vergleich": "var(--gas-500)",
  "/karte": "var(--gas-500)",
  "/auswertung": "var(--brand-500)",
  "/team": "var(--energy-600)",
  "/einstellungen": "var(--ink-muted)",
};

/**
 * Alles, was auf dem Handy nicht in die fuenf Reiter passt - plus das Konto.
 * Am Rechner steht dasselbe in der Seitenleiste.
 */
export default async function MorePage() {
  const user = await requireUser();
  const nav = navigation(user.role);
  if (nav.more.length === 0) redirect(nav.tabs[0].href);

  const groups = [...new Set(nav.more.map((item) => item.group))];

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Mehr" />

      <div className="mb-6">
        <AccountCard
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            roleLabel: user.role === "LEADER" ? "Teamleitung" : "Vertrieb",
            avatar: user.avatar || null,
          }}
          href={`/profil/${user.id}`}
        />
      </div>

      {groups.map((group) => (
        <section key={group} className="mb-6">
          <GroupLabel>{group}</GroupLabel>
          <div className="list">
            {nav.more
              .filter((item) => item.group === group)
              .map((item) => {
                const Icon = NAV_ICONS[item.icon];
                return (
                  <Link key={item.href} href={item.href} className="list-row">
                    <span
                      className="tile-icon h-8 w-8 text-white"
                      style={{ background: TINT[item.href] ?? "var(--brand-500)", borderRadius: 9 }}
                      aria-hidden
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex-1 text-[15px] font-medium">{item.label}</span>
                    <IconChevronRight className="muted h-4 w-4 opacity-60" />
                  </Link>
                );
              })}
          </div>
        </section>
      ))}

      <div className="list">
        <LogoutRow />
      </div>
    </div>
  );
}
