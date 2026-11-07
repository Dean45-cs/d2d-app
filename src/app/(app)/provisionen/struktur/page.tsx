import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { commissionStructure, viewablePeople } from "@/lib/commissions/store";
import { StructureList } from "./StructureList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Provisionen · Personen" };

/**
 * Wer was bekommt: Fuehrungskraefte geben ihren direkten Leuten einen Anteil
 * an der eigenen Provision, die Verwaltung stellt persoenliche Saetze ein.
 * Sichtbar ist immer nur, was darunter liegt.
 */
export default async function CommissionStructurePage() {
  const user = await requireUser();
  const admin = permissionsFor(user)["commissions.manage"];
  if (!admin && viewablePeople(user).length === 0) redirect("/provisionen");
  return <StructureList structure={commissionStructure(user)} viewerId={user.id} />;
}
