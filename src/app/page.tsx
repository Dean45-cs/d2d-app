import { cookies } from "next/headers";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HOME_COOKIE, HOME_TARGETS, parseHome } from "@/lib/home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Eigene Startseite aus den Einstellungen - sonst Uebersicht (Teamleitung) bzw. Klinken.
  const chosen = HOME_TARGETS[parseHome((await cookies()).get(HOME_COOKIE)?.value)];
  redirect(chosen ?? (hasPermission(user, "reports.team") ? "/start" : "/tour"));
}
