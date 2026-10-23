"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconLogout, IconSidebar } from "./icons";
import { Logo } from "./Logo";
import { Avatar } from "./ui";
import { NAV_ICONS } from "./nav-icons";
import { activeHref, type NavItem, type NavSection } from "@/lib/nav";
import { forgetPushDevice } from "@/lib/push-client";
import { fetchWithTimeout, flush } from "@/lib/offline-queue";
import { clearOfflinePages } from "@/lib/offline-pages";
import { useToast } from "./Toast";

export interface NavUser {
  id: number;
  name: string;
  email: string;
  roleLabel: string;
  avatar: string | null;
}

/**
 * Abmelden und zurueck zur Anmeldung - von ueberall gleich. Ohne Netz geht
 * das nicht: die Sitzung bliebe auf dem Server bestehen, obwohl die App
 * "abgemeldet" zeigt. Dann lieber ehrlich sagen und angemeldet bleiben.
 */
export function useLogout(userId: number) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const logout = useCallback(async () => {
    setBusy(true);
    try {
      // Wartende Eintraege noch mit dieser Anmeldung senden - danach fehlt sie dafuer.
      await flush(userId).catch(() => undefined);
      // Erst das Geraet fuer Push abmelden - danach fehlt dafuer die Anmeldung.
      await forgetPushDevice().catch(() => undefined);
      const response = await fetchWithTimeout("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(`Abmelden: ${response.status}`);
    } catch {
      setBusy(false);
      toast("Abmelden braucht Verbindung – bitte bei Empfang erneut tippen");
      return;
    }
    await clearOfflinePages();
    router.push("/login");
    router.refresh();
  }, [router, toast, userId]);
  return { logout, busy };
}

/* ------------------------------------------------------------------------ */
/*                    Reiterleiste (Handy) - schwebendes Glas                */
/* ------------------------------------------------------------------------ */

export function TabBar({ tabs, user }: { tabs: NavItem[]; user: NavUser }) {
  const pathname = usePathname();
  const active = activeHref(tabs, pathname);
  const [collapsed, setCollapsed] = useState(false);
  const last = useRef(0);

  // Nach unten rollen: die Leiste schrumpft auf den aktiven Reiter.
  // Nach oben rollen oder oben angekommen: sie ist wieder ganz da.
  useEffect(() => {
    setCollapsed(false);
    last.current = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last.current;
        if (y < 80) setCollapsed(false);
        else if (delta > 12) setCollapsed(true);
        else if (delta < -12) setCollapsed(false);
        if (Math.abs(delta) > 12) last.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <nav
      className="tabbar glass md:hidden"
      data-collapsed={collapsed}
      aria-label="Hauptnavigation"
      onClick={() => collapsed && setCollapsed(false)}
    >
      {tabs.map((item) => {
        const isActive = item.href === active;
        const icons = NAV_ICONS[item.icon];
        const Icon = isActive ? icons.fill : icons.line;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className="tabbar-item"
            onClick={(event) => {
              if (collapsed) {
                event.preventDefault();
                setCollapsed(false);
              }
            }}
          >
            {item.icon === "profile" ? (
              <span
                className={`tabbar-avatar grid place-items-center rounded-full ${
                  isActive ? "ring-2 ring-accent" : ""
                }`}
              >
                <Avatar name={user.name} src={user.avatar} size={26} />
              </span>
            ) : (
              <Icon />
            )}
            <span className="tabbar-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/*                 Seitenleiste (iPad, Rechner) - einklappbar                */
/* ------------------------------------------------------------------------ */

const SIDEBAR_COOKIE = "cs_sidebar";

export function Sidebar({ sections, user }: { sections: NavSection[]; user: NavUser }) {
  const pathname = usePathname();
  const { logout, busy } = useLogout(user.id);
  const account: NavItem = { href: "/profil", label: "Profil", icon: "profile", match: [`/profil/${user.id}`] };
  const active = activeHref([...sections.flatMap((s) => s.items), account], pathname);

  function toggle() {
    const shell = document.querySelector<HTMLElement>(".shell");
    if (!shell) return;
    // Was gerade zu sehen ist, nicht was eingestellt ist: "auto" ist je nach
    // Breite und Seite (beim Klinken auf dem iPad schmal) mal so, mal so.
    const style = getComputedStyle(shell);
    const expanded = parseFloat(style.getPropertyValue("--shell-offset")) > parseFloat(style.getPropertyValue("--rail-w"));
    const next = expanded ? "rail" : "full";
    shell.dataset.sidebar = next;
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside className="sidebar glass hidden md:flex" aria-label="Seitenleiste">
      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <Link href="/" className="rail-hide min-w-0 flex-1 rounded-lg px-1" aria-label="Carlsson Sales – Start">
          <Logo size={28} />
        </Link>
        <button type="button" onClick={toggle} className="icon-btn" aria-label="Seitenleiste ein- oder ausklappen">
          <IconSidebar className="h-[22px] w-[22px]" />
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 pb-4" aria-label="Hauptnavigation">
        {sections.map((section, index) => (
          <div key={section.title ?? index}>
            {section.title && (
              <p className="sidebar-text sidebar-heading">{section.title}</p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = item.href === active;
                const icons = NAV_ICONS[item.icon];
                const Icon = isActive ? icons.fill : icons.line;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className="sidebar-item"
                      title={item.label}
                    >
                      <Icon />
                      <span className="sidebar-text">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-separator p-3">
        <div className="flex items-center gap-1">
          <Link
            href="/profil"
            aria-current={active === "/profil" ? "page" : undefined}
            className="sidebar-item min-w-0 flex-1"
            title="Profil"
          >
            <span className="sidebar-avatar grid place-items-center">
              <Avatar name={user.name} src={user.avatar} size={26} />
            </span>
            <span className="sidebar-text min-w-0">
              <span className="block truncate text-subhead font-semibold">{user.name}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="icon-btn rail-hide"
            aria-label="Abmelden"
            title="Abmelden"
          >
            <IconLogout className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
