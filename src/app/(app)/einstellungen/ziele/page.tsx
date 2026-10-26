import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { GoalSettings } from "./GoalSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ziele & Erfolge – Einstellungen" };

export default async function GoalSettingsPage() {
  await requireUser();
  return <GoalSettings />;
}
