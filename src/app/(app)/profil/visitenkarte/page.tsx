import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { cardSettings } from "@/lib/card-queries";
import { CardSettings } from "./CardSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitenkarte" };

/** Die eigene Visitenkarte: einschalten, QR-Code zeigen, Link teilen. */
export default async function BusinessCardPage() {
  const user = await requireUser();
  const settings = cardSettings(user.id);
  return <CardSettings initial={settings} name={user.name} avatar={user.avatar || null} userId={user.id} />;
}
