import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { berlinToday } from "@/lib/contracts";
import { commissionAdmin } from "@/lib/commissions/store";
import { CommissionSettings } from "./CommissionSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Provisionsregeln" };

/** Liste importieren, Standardsatz, Ausnahmen und Boni - nur mit "Provisionen verwalten". */
export default async function CommissionSettingsPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const user = await requireUser();
  if (!permissionsFor(user)["commissions.manage"]) redirect("/profil");
  const params = await searchParams;
  return <CommissionSettings data={commissionAdmin(user)} today={berlinToday()} openImport={params.import === "1"} />;
}
