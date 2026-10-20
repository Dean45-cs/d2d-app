import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { permissionsFor } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar, TabBar, type NavUser } from "@/components/AppNav";
import { ToastProvider } from "@/components/Toast";
import { navigation } from "@/lib/nav";
import { mapConfig } from "@/lib/map";
import { MapConfigProvider } from "@/components/map/MapConfig";
import { PushSync } from "@/components/PushSync";
import { OfflineSupport } from "@/components/OfflineSupport";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = navigation(user.role, permissionsFor(user), user.id);
  const navUser: NavUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleLabel: user.role === "LEADER" ? "Teamleitung" : "Vertrieb",
    avatar: user.avatar || null,
  };

  // Ein- oder ausgeklappte Seitenleiste kommt aus dem Cookie - so steht sie
  // schon beim ersten Bild richtig und nichts springt.
  const stored = (await cookies()).get("cs_sidebar")?.value;
  const sidebar = stored === "rail" || stored === "full" ? stored : "auto";

  return (
    <MapConfigProvider value={mapConfig()}>
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
      </ToastProvider>
    </MapConfigProvider>
  );
}
