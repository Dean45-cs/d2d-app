import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { AppearanceSettings } from "./AppearanceSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Darstellung" };

export default async function AppearancePage() {
  await requireUser();
  return <AppearanceSettings />;
}
