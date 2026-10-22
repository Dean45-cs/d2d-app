import { SkeletonHeader, SkeletonList } from "@/components/ui";

/** Platzhalter der Kundenliste. */
export default function LoadingCustomers() {
  return (
    <div className="page-narrow" aria-busy="true" aria-label="Kunden werden geladen">
      <SkeletonHeader />
      <SkeletonList rows={6} />
    </div>
  );
}
