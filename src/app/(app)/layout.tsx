import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MobileTabBar, MobileTopBar, Sidebar } from "@/components/AppNav";
import { InstallHint } from "@/components/InstallHint";
import { navItems } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = navItems(user.role);
  const roleLabel = user.role === "LEADER" ? "Teamleitung" : "Vertrieb";

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} userName={user.name} roleLabel={roleLabel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar userName={user.name} />
        {/* Unten Platz für die Tab-Leiste plus Home-Indikator des iPhones */}
        <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-10 md:pt-7">
          {/* Nicht per md:hidden ausblenden: das iPad ist breit genug fuer die
              Desktop-Ansicht, braucht den Hinweis aber genauso. Die Komponente
              entscheidet selbst, ob sie sich zeigt. */}
          <div className="mx-auto max-w-2xl">
            <InstallHint />
          </div>
          {children}
        </main>
        <MobileTabBar items={items} />
      </div>
    </div>
  );
}
