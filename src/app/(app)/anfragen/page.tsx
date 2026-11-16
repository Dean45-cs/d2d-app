import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  canManageInquiries,
  countInquiries,
  hasInquiryAccess,
  inquiryAssignees,
  listInquiries,
  purgeInquiries,
} from "@/lib/inquiries";
import { isInquiryView, type InquiryCounts, type InquiryView } from "@/lib/inquiry-labels";
import { InquiryList } from "./InquiryList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anfragen" };

const LIMIT = 200;

function pickView(value: string | undefined, counts: InquiryCounts): InquiryView {
  if (isInquiryView(value)) return value;
  return counts.open > 0 || counts.done === 0 ? "offen" : "erledigt";
}

/**
 * Posteingang fuer das Kontaktformular der Website. Wer alle Anfragen
 * verwaltet, sieht alles und teilt zu; alle anderen sehen nur, was ihnen
 * zugeteilt wurde.
 */
export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!hasInquiryAccess(user)) redirect("/profil");
  purgeInquiries();
  const params = await searchParams;
  const counts = countInquiries(user);
  const view = pickView(params.ansicht, counts);
  const query = (params.q ?? "").trim().slice(0, 80);
  const manager = canManageInquiries(user);

  return (
    <InquiryList
      rows={listInquiries(user, { view, query, limit: LIMIT })}
      counts={counts}
      view={view}
      query={query}
      manager={manager}
      assignees={manager ? inquiryAssignees(user) : []}
      limit={LIMIT}
    />
  );
}
