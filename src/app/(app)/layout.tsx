import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { permissionsFor } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar, TabBar, type NavUser } from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
import { navigation } from "@/lib/nav";
import { positionLabel } from "@/lib/tiers";
import { mapConfig } from "@/lib/map";
import { MapConfigProvider } from "@/components/map/MapConfig";
import { PushSync } from "@/components/PushSync";
import { OfflineSupport } from "@/components/OfflineSupport";
import { RanksProvider } from "@/components/ranks/RanksContext";
import { RankCelebration } from "@/components/ranks/RankCelebration";
import { loadRanks, pendingCelebration } from "@/lib/ranks";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = navigation(user.role, permissionsFor(user), user.id);
  const ranks = loadRanks(user.team_id);
  const celebrate = pendingCelebration(user);
  const navUser: NavUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleLabel: positionLabel(user, ranks),
    avatar: user.avatar || null,
  };

  // Ein- oder ausgeklappte Seitenleiste kommt aus dem Cookie - so steht sie
  // schon beim ersten Bild richtig und nichts springt.
  const stored = (await cookies()).get("cs_sidebar")?.value;
  const sidebar = stored === "rail" || stored === "full" ? stored : "auto";

  return (
    <MapConfigProvider value={mapConfig()}>
      <RanksProvider value={ranks}>
      <ToastProvider>
        <div className="shell" data-sidebar={sidebar}>
          <Sidebar sections={nav.sidebar} user={navUser} />
          <main className="shell-main">
            {/* Zeitstempel je Server-Aufruf: daran erkennt die App, dass frische Daten da sind. */}
            <OfflineSupport userId={user.id} renderedAt={Date.now()} />
            {children}
          </main>
          <TabBar tabs={nav.tabs} user={navUser} />
        </div>
        <PushSync userId={user.id} />
        {celebrate && <RankCelebration tier={celebrate} name={user.name} />}
      </ToastProvider>
      </RanksProvider>
    </MapConfigProvider>
  );
}
