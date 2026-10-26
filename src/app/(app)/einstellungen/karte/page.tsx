import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { MapSettings } from "./MapSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Karte – Einstellungen" };

export default async function MapSettingsPage() {
  await requireUser();
  return <MapSettings />;
}
