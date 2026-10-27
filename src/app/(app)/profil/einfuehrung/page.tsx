import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { IntroVideo } from "./IntroVideo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einführung" };

/** Die Einfuehrung als Video: alle Bereiche der App in zweieinhalb Minuten. */
export default async function IntroPage() {
  await requireUser();
  return <IntroVideo />;
}
