import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { lastRefresh, listReasons } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ReasonSettings } from "./ReasonSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== "LEADER") redirect("/tour");

  const reasons = listReasons(user.team_id, false);
  const refresh = lastRefresh();
  const feedMode = process.env.ENERGY_FEED_MODE ?? "seed";
  const tarifrechner =
    process.env.NEXT_PUBLIC_TARIFRECHNER_URL ??
    "https://portal-ep24.de/menues/tarifrechner/";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Einstellungen"
        subtitle="Ablehnungsgründe, Partner-Link und Datenquelle der Energiekarte"
      />

      <ReasonSettings reasons={reasons} />

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Auftragserfassung des Partners</h2>
        <p className="muted mb-2 text-sm">
          Der Abschluss-Button im Tür-Tracking öffnet diese Adresse:
        </p>
        <code className="block overflow-x-auto rounded-xl bg-black/5 px-3 py-2 text-xs">
          {tarifrechner}
        </code>
        <p className="muted mt-2 text-xs">
          Änderbar über <code>NEXT_PUBLIC_TARIFRECHNER_URL</code> in der Datei{" "}
          <code>.env.local</code>.
        </p>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Energiekarte – Datenquelle</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="muted">Modus</dt>
            <dd className="font-semibold">
              {feedMode === "seed" ? "Demo-Daten (keine echten Tarife)" : feedMode.toUpperCase()}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Letzter Abruf</dt>
            <dd className="font-semibold">
              {refresh?.finished_at
                ? new Date(refresh.finished_at).toLocaleString("de-DE")
                : "noch nie"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Ergebnis</dt>
            <dd className="font-semibold">
              {refresh ? `${refresh.status} · ${refresh.row_count} PLZ` : "–"}
            </dd>
          </div>
        </dl>
        <p className="muted mt-3 text-xs">
          Für echte Tagespreise <code>ENERGY_FEED_MODE=csv</code> (oder <code>json</code>)
          und <code>ENERGY_FEED_URL</code> in <code>.env.local</code> setzen. Das erwartete
          Format steht im README unter „Energiekarte“.
        </p>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Farben &amp; Logo</h2>
        <p className="muted text-sm">
          Alle Farben der App stehen in <code>src/app/brand.css</code>. Dort die
          Hex-Werte von Energie Partner 24 eintragen, dann übernimmt die gesamte
          Oberfläche sie. Ein eigenes Logo als <code>public/logo.svg</code> ablegen
          und in <code>src/components/Logo.tsx</code> einbinden.
        </p>
      </section>
    </div>
  );
}
