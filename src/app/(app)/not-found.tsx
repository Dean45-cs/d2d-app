import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { IconSearch } from "@/components/icons";

/**
 * notFound() in der App - etwa ein geloeschtes Gebiet oder ein fremdes
 * Profil. Die Schale mit Reiter- und Seitenleiste bleibt stehen.
 */
export default function AppNotFound() {
  return (
    <div className="page-narrow pt-12">
      <EmptyState
        boxed
        icon={<IconSearch className="h-6 w-6" />}
        title="Nicht gefunden"
        text="Gelöscht, verschoben oder nicht für dich freigegeben."
        action={
          <Link href="/" className="btn btn-primary btn-sm">
            Zur Startseite
          </Link>
        }
      />
    </div>
  );
}
