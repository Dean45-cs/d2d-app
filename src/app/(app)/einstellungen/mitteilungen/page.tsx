import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { pushKinds } from "@/lib/push";
import { NotificationSettings } from "./NotificationSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mitteilungen – Einstellungen" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  return <NotificationSettings initialKinds={pushKinds(user.id)} />;
}
