import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { HOME_COOKIE, parseHome } from "@/lib/home";
import { AreaSettings } from "./AreaSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bereiche – Einstellungen" };

export default async function AreaSettingsPage() {
  const user = await requireUser();
  const rights = permissionsFor(user);
  const home = parseHome((await cookies()).get(HOME_COOKIE)?.value);
  return <AreaSettings rights={{ reports: rights["reports.team"], customers: rights["customers.manage"] }} home={home} />;
}
