import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { TourSettings } from "./TourSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Klinken – Einstellungen" };

export default async function TourSettingsPage() {
  await requireUser();
  return <TourSettings />;
}
