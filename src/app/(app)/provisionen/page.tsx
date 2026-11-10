import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { permissionsFor } from "@/lib/permissions";
import { commissionView, viewablePeople } from "@/lib/commissions/store";
import { CommissionList } from "./CommissionList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Provisionen" };

/**
 * Provisionsliste: welcher Tarif wie viel bringt.
 *
 * Jede Person sieht ihre eigene Liste, Fuehrungskraefte auch die ihrer
 * Leute (?person=…), die Verwaltung zusaetzlich die Standardliste mit den
 * Admin-Provisionen. Zugeschnitten wird auf dem Server (commissionView).
 */
export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string; pruefen?: string }>;
}) {
  const user = await requireUser();
  const admin = permissionsFor(user)["commissions.manage"];
  // Die Geschaeftsfuehrung bekommt die Admin-Provision - ohne Verwaltungsrecht gibt es fuer sie keine Liste.
  if (user.role === "LEADER" && !admin) redirect("/profil");
  const params = await searchParams;
  const people = viewablePeople(user);
  const requested = Number(params.person);
  const own = user.role !== "LEADER";
  let subjectId: number | null = admin ? null : user.id;
  if (Number.isSafeInteger(requested) && requested > 0) {
    if (requested === user.id && own) subjectId = user.id;
    else if (people.some((person) => person.id === requested)) subjectId = requested;
  }

  return (
    <CommissionList
      view={commissionView(user, subjectId)}
      people={people}
      self={{ id: user.id, ownList: own }}
      showStructure={admin || people.length > 0}
      reviewOnly={admin && params.pruefen === "1"}
    />
  );
}
