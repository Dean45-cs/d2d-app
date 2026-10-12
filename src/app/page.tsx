import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(hasPermission(user, "reports.team") ? "/start" : "/tour");
}
