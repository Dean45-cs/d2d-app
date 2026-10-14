import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { listReasons } from "@/lib/queries";
import { ReasonSettings } from "./ReasonSettings";

export const dynamic = "force-dynamic";

/** Ablehnungsgruende des Teams - auch die ausgeblendeten. */
export default async function ReasonsPage() {
  const user = await requireUser();
  if (!permissionsFor(user)["settings.reasons"]) redirect("/profil");
  return <ReasonSettings reasons={listReasons(user.team_id, false)} />;
}
