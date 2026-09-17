"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  IconBolt,
  IconChart,
  IconCog,
  IconDoor,
  IconHome,
  IconLogout,
  IconMap,
  IconUsers,
} from "./icons";
import { Logo } from "./Logo";
import type { IconName, NavItem } from "@/lib/nav";

const ICONS: Record<IconName, (props: { className?: string }) => React.ReactElement> = {
  home: IconHome,
  door: IconDoor,
  map: IconMap,
  bolt: IconBolt,
  chart: IconChart,
  users: IconUsers,
  cog: IconCog,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  items,
  userName,
  roleLabel,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-brand-900 px-4 py-5 text-white md:flex">
      <div className="px-2 pb-6">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="px-3 text-sm font-semibold">{userName}</p>
        <p className="px-3 pb-2 text-xs text-white/55">{roleLabel}</p>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
        >
          <IconLogout />
          Abmelden
        </button>
      </div>
    </aside>
  );
}

export function MobileTopBar({ userName }: { userName: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between bg-brand-900 px-4 py-3 text-white md:hidden">
      <Logo size={30} />
      <button
        onClick={logout}
        aria-label={`${userName} abmelden`}
        className="rounded-lg p-2 text-white/70 active:bg-white/10"
      >
        <IconLogout />
      </button>
    </header>
  );
}

export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid border-t bg-[var(--card)] pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        borderColor: "var(--line)",
      }}
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
              active ? "text-brand-600" : "muted"
            }`}
          >
            <Icon className="h-5 w-5" />
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
