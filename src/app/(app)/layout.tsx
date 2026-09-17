import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MobileTabBar, MobileTopBar, Sidebar } from "@/components/AppNav";
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
        <main className="flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-7">
          {children}
        </main>
        <MobileTabBar items={items} />
      </div>
    </div>
  );
}
