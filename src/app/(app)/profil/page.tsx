import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** "/profil" fuehrt zum eigenen Profil. */
export default async function OwnProfilePage() {
  const user = await requireUser();
  redirect(`/profil/${user.id}`);
}
