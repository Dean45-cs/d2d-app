"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { IconChevronRight, IconLogout } from "./icons";
import { Logo } from "./Logo";
import { Sheet } from "./Sheet";
import { Avatar } from "./ui";
import { NAV_ICONS } from "./nav-icons";
import { MORE_HREF, type NavItem, type Navigation } from "@/lib/nav";

export interface NavUser {
  id: number;
  name: string;
  email: string;
  roleLabel: string;
  avatar: string | null;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Abmelden und zurueck zur Anmeldung - von ueberall gleich. */
export function useLogout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }, [router]);
  return { logout, busy };
}

/* ------------------------------------------------------------------------ */
/*                          Seitenleiste am Rechner                          */
/* ------------------------------------------------------------------------ */

export function Sidebar({ nav, user }: { nav: Navigation; user: NavUser }) {
  const pathname = usePathname();
  const { logout, busy } = useLogout();

  // Punkte nach Gruppe zusammenfassen, Reihenfolge wie in der Liste.
  const groups: Array<{ name: string; items: NavItem[] }> = [];
  for (const item of nav.items) {
    const group = groups.find((g) => g.name === item.group);
    if (group) group.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-brand-900 text-white md:flex">
      <div className="px-5 pb-5 pt-6">
        <Logo size={34} />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Hauptnavigation">
        {groups.map((group) => (
          <div key={group.name}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">
              {group.name}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex h-9 items-center gap-3 rounded-[var(--r-sm)] px-3 text-[14px] font-medium transition-colors ${
                        active
                          ? "bg-white/[0.13] text-white"
                          : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-energy-300" : ""}`} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-1 rounded-[var(--r-sm)]">
          <Link
            href={`/profil/${user.id}`}
            aria-current={isActive(pathname, `/profil/${user.id}`) ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r-sm)] px-2 py-2 transition-colors hover:bg-white/[0.06]"
            title="Mein Profil"
          >
            <Avatar name={user.name} src={user.avatar} size={34} tone="light" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13.5px] font-semibold">{user.name}</p>
              <p className="truncate text-[12px] text-white/55">Mein Profil</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Abmelden"
            title="Abmelden"
          >
            <IconLogout className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------ */
/*                              Kopfzeile Handy                              */
/* ------------------------------------------------------------------------ */

export function MobileTopBar({ user }: { user: NavUser }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between bg-brand-900 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white md:hidden">
        <Logo size={30} tagline="" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full ring-2 ring-white/15 transition active:scale-95"
          aria-label={`Konto von ${user.name}`}
        >
          <Avatar name={user.name} src={user.avatar} size={32} tone="light" />
        </button>
      </header>
      {open && <AccountSheet user={user} onClose={close} />}
    </>
  );
}

/** Wer angemeldet ist, der Weg zum eigenen Profil - und der Weg hinaus. */
export function AccountSheet({ user, onClose }: { user: NavUser; onClose: () => void }) {
  const { logout, busy } = useLogout();
  return (
    <Sheet title="Konto" onClose={onClose}>
      <AccountCard user={user} href={`/profil/${user.id}`} onNavigate={onClose} />
      <button
        type="button"
        className="btn btn-ghost mt-4 w-full"
        style={{ color: "var(--danger-ink)" }}
        onClick={() => void logout()}
        disabled={busy}
      >
        <IconLogout className="h-[18px] w-[18px]" />
        {busy ? "Abmelden …" : "Abmelden"}
      </button>
    </Sheet>
  );
}

/** Die angemeldete Person - mit Verweis aufs eigene Profil, wenn `href` gesetzt ist. */
export function AccountCard({
  user,
  href,
  onNavigate,
}: {
  user: NavUser;
  href?: string;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <Avatar name={user.name} src={user.avatar} size={52} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-[16px] font-semibold">{user.name}</p>
        <p className="muted truncate text-[13px]">{user.email}</p>
        <p className="truncate text-[12.5px] font-semibold text-tint">
          {href ? "Mein Profil ansehen" : user.roleLabel}
        </p>
      </div>
    </>
  );
  if (!href) return <div className="inset flex items-center gap-3.5 p-3.5">{content}</div>;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="inset flex items-center gap-3.5 p-3.5 transition-colors hover:bg-[var(--hover)]"
    >
      {content}
      <IconChevronRight className="muted h-4 w-4 shrink-0 opacity-60" />
    </Link>
  );
}

/** Abmelde-Zeile fuer Listen, etwa auf der Seite "Mehr". */
export function LogoutRow() {
  const { logout, busy } = useLogout();
  return (
    <button
      type="button"
      className="list-row font-medium"
      style={{ color: "var(--danger-ink)" }}
      onClick={() => void logout()}
      disabled={busy}
    >
      <span
        className="tile-icon h-8 w-8"
        style={{ background: "color-mix(in srgb, var(--signal-500) 12%, transparent)" }}
        aria-hidden
      >
        <IconLogout className="h-[18px] w-[18px]" />
      </span>
      {busy ? "Abmelden …" : "Abmelden"}
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/*                            Reiterleiste Handy                             */
/* ------------------------------------------------------------------------ */

export function MobileTabBar({ nav }: { nav: Navigation }) {
  const pathname = usePathname();
  const inMore =
    isActive(pathname, MORE_HREF) || nav.more.some((item) => isActive(pathname, item.href));
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-20 grid border-t pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
      style={{
        gridTemplateColumns: `repeat(${nav.tabs.length}, minmax(0, 1fr))`,
        borderColor: "var(--line)",
      }}
      aria-label="Hauptnavigation"
    >
      {nav.tabs.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = item.href === MORE_HREF ? inMore : isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-[3px] pb-1.5 pt-2 text-[10.5px] font-medium transition-colors ${
              active ? "text-tint" : "muted"
            }`}
          >
            <Icon className="h-6 w-6" />
            <span className="w-full truncate px-0.5 text-center">{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
