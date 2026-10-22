"use client";

import { useLogout } from "@/components/AppNav";
import { Cell } from "@/components/ui";

/** Abmelden - eine rote Zeile ganz unten, wie in den iOS-Einstellungen. */
export function LogoutCell({ userId }: { userId: number }) {
  const { logout, busy } = useLogout(userId);
  return (
    <li>
      <Cell onClick={() => void logout()} disabled={busy} title="Abmelden" tone="danger" className="justify-center" />
    </li>
  );
}
