import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MobileTabBar, MobileTopBar, Sidebar, type NavUser } from "@/components/AppNav";
import { InstallHint } from "@/components/InstallHint";
import { navigation } from "@/lib/nav";
import { mapConfig } from "@/lib/map";
import { MapConfigProvider } from "@/components/map/MapConfig";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const nav = navigation(user.role);
  const navUser: NavUser = {
    name: user.name,
    email: user.email,
    roleLabel: user.role === "LEADER" ? "Teamleitung" : "Vertrieb",
    avatar: user.avatar || null,
  };

  return (
    <MapConfigProvider value={mapConfig()}>
      <div className="flex min-h-dvh">
        <Sidebar nav={nav} user={navUser} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar user={navUser} />
          {/* Unten Platz für die Tab-Leiste plus Home-Indikator des iPhones */}
          <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-12 md:pt-8 lg:px-10">
            {/* Nicht per md:hidden ausblenden: das iPad ist breit genug fuer die
                Desktop-Ansicht, braucht den Hinweis aber genauso. Die Komponente
                entscheidet selbst, ob sie sich zeigt. */}
            <div className="mx-auto max-w-2xl">
              <InstallHint />
            </div>
            {children}
          </main>
          <MobileTabBar nav={nav} />
        </div>
      </div>
    </MapConfigProvider>
  );
}
