import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { commissionStructure, viewablePeople } from "@/lib/commissions/store";
import { StructureList } from "./StructureList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Provisionen · Personen" };

/**
 * Wer welche Stufe hat: Teamleiter sehen ihre direkten Leute und was sie an
 * deren Vertraegen bekommen, die Verwaltung das ganze Team samt Saetzen.
 */
export default async function CommissionStructurePage() {
  const user = await requireUser();
  const admin = permissionsFor(user)["commissions.manage"];
  if (!admin && viewablePeople(user).length === 0) redirect("/provisionen");
  return <StructureList structure={commissionStructure(user)} viewerId={user.id} />;
}
