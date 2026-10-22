"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerCounts, CustomerRow, CustomerView } from "@/lib/customers";
import { Avatar, Cell, EmptyState, OutcomeGlyph, PageHeader, SegmentedLinks, plural } from "@/components/ui";
import { ContractEndBlock } from "@/components/ContractEnd";
import { useToast } from "@/components/Toast";
import { IconCheck, IconContacts, IconPhone, IconSearch, IconShare } from "@/components/icons";
import { contractStatus, dayLabel, productLabel, telHref } from "@/lib/contracts";
import { sqlDay } from "@/lib/format";
import { fetchWithTimeout } from "@/lib/offline-queue";
import { CustomerSheet, customerAddress } from "./CustomerSheet";

/**
 * Kundenliste: jeder Abschluss mit dem Kunden dahinter.
 *
 * "Fällig" ist der Rueckweg - Vertraege, die bald enden oder schon frei sind,
 * mit Anruf und Abhaken in der Zeile. "Ohne Kunde" sind die Abschluesse, die
 * noch aus dem Buchungsportal nachzutragen sind. "Alle" mit Suche.
 */
export function CustomerList({
  rows,
  counts,
  view,
  query,
  today,
  faces,
  limit,
}: {
  rows: CustomerRow[];
  counts: CustomerCounts;
  view: CustomerView;
  query: string;
  /** Heute in Berlin ("2026-10-22") - danach richtet sich "fällig". */
  today: string;
  /** Profilbilder je Mitarbeiter-ID. */
  faces: Record<number, string>;
  limit: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState<CustomerRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [search, setSearch] = useState(query);
  // Zurueck nach "Alle": das Feld zeigt wieder die Suche der Adresse, nicht die von vorhin.
  const [searchView, setSearchView] = useState(view);
  if (searchView !== view) {
    setSearchView(view);
    setSearch(query);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Aus der Uebersicht: /kunden?kunde=12 oeffnet genau diesen Auftrag.
    const target = rows.find((row) => row.visit_id === Number(params.get("kunde")));
    if (target) setDetail(target);
    // Die Ansicht in der Adresse festhalten - sonst sprang sie nach dem Speichern um,
    // sobald anderswo etwas zu tun ist (etwa der erste faellige Kunde beim Abarbeiten von "Ohne Kunde").
    if (!params.has("kunde") && params.get("ansicht") === view) return;
    params.delete("kunde");
    params.set("ansicht", view);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  }, [rows, view]);

  // Suchen beim Tippen - kurz gewartet, damit nicht jeder Buchstabe eine Anfrage ist.
  useEffect(() => {
    const term = search.trim();
    if (view !== "alle" || term === query) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ ansicht: "alle" });
      if (term) params.set("q", term);
      router.replace(`/kunden?${params}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query, view, router]);

  async function setRecontacted(row: CustomerRow, done: boolean) {
    setBusy(row.visit_id);
    try {
      const response = await fetchWithTimeout(`/api/customers/${row.visit_id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recontacted: done }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast(data.error ?? "Nicht gespeichert");
        return;
      }
      if (done) {
        toast(`${row.name || "Kunde"} umberaten`, {
          action: { label: "Rückgängig", onClick: () => void setRecontacted(row, false) },
        });
      } else {
        toast("Wieder fällig");
      }
      router.refresh();
    } catch {
      toast("Keine Verbindung");
    } finally {
      setBusy(null);
    }
  }

  const summary = [
    counts.due > 0 && `${counts.due} fällig`,
    counts.open > 0 && `${counts.open} ohne Kunde`,
    plural(counts.total, "Auftrag", "Aufträge"),
  ]
    .filter(Boolean)
    .join(" · ");
  const shownTotal = view === "faellig" ? counts.due : view === "offen" ? counts.open : counts.total;

  return (
    <div className="page-narrow">
      <PageHeader
        title="Kunden"
        subtitle={summary}
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        actions={
          counts.total > 0 && (
            <a href="/api/customers/export" download className="btn btn-plain btn-sm" aria-label="Kundenliste als Datei exportieren">
              <IconShare className="h-4 w-4" />
              Export
            </a>
          )
        }
      >
        <SegmentedLinks
          ariaLabel="Kunden filtern"
          current={view}
          options={[
            { key: "faellig", label: "Fällig", href: "/kunden?ansicht=faellig" },
            { key: "offen", label: "Ohne Kunde", href: "/kunden?ansicht=offen" },
            { key: "alle", label: "Alle", href: "/kunden?ansicht=alle" },
          ]}
        />
      </PageHeader>

      {view === "alle" && counts.total > 0 && (
        <label className="relative mb-4 block">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            className="field pl-12"
            placeholder="Name, Telefon, Straße, Verkäufer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Kunden suchen"
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
      )}

      {rows.length === 0 ? (
        <Empty view={view} query={query} hasSales={counts.total > 0} />
      ) : view === "faellig" ? (
        <DueList
          rows={rows}
          today={today}
          faces={faces}
          busy={busy}
          onOpen={setDetail}
          onDone={(row) => void setRecontacted(row, true)}
        />
      ) : (
        <ul className="list list-icons">
          {rows.map((row) =>
            view === "offen" ? (
              <li key={row.visit_id}>
                <Cell
                  onClick={() => setDetail(row)}
                  icon={<OutcomeGlyph outcome="SALE" />}
                  title={customerAddress(row)}
                  subtitle={soldLine(row)}
                  chevron
                />
              </li>
            ) : (
              <li key={row.visit_id}>
                <Cell
                  onClick={() => setDetail(row)}
                  icon={<ContractEndBlock end={row.contract_end} today={today} />}
                  title={row.name || <span className="text-muted">Kunde fehlt</span>}
                  // Das Vertragsende steht links im Block - hier nur, wo und von wem.
                  subtitle={`${customerAddress(row)} · ${row.user_name}`}
                  chevron
                />
              </li>
            ),
          )}
        </ul>
      )}

      {rows.length >= limit && shownTotal > rows.length && (
        <p className="list-footer">
          {view === "alle"
            ? `Die neuesten ${rows.length} von ${shownTotal} – die Suche findet alle.`
            : `Die ersten ${rows.length} von ${shownTotal}.`}
        </p>
      )}

      {detail && (
        <CustomerSheet
          // Neu gemountet je Auftrag: das Formular startet mit dessen Werten.
          key={detail.visit_id}
          row={detail}
          today={today}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/** Faellige Rueckrufe: schon freie Vertraege zuerst, dann die bald endenden. */
function DueList({
  rows,
  today,
  faces,
  busy,
  onOpen,
  onDone,
}: {
  rows: CustomerRow[];
  today: string;
  faces: Record<number, string>;
  busy: number | null;
  onOpen: (row: CustomerRow) => void;
  onDone: (row: CustomerRow) => void;
}) {
  const ended = rows.filter((row) => contractStatus(row.contract_end, today).tone === "ended");
  const soon = rows.filter((row) => contractStatus(row.contract_end, today).tone !== "ended");
  const groups = [
    { key: "ended", title: "Vertrag ausgelaufen", late: true, items: ended },
    { key: "soon", title: "Endet bald", late: false, items: soon },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          <p className={`list-label ${group.late ? "text-danger" : ""}`}>
            {group.title} · {group.items.length}
          </p>
          <ul className="list list-icons">
            {group.items.map((row) => (
              <li key={row.visit_id} className="cell pr-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpen(row)}
                >
                  <ContractEndBlock end={row.contract_end} today={today} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{row.name || "Ohne Namen"}</span>
                    <span className="flex min-w-0 items-center gap-2 text-footnote text-muted">
                      <Avatar name={row.user_name} src={faces[row.user_id]} size={16} />
                      <span className="truncate">
                        {customerAddress(row)} · {contractStatus(row.contract_end, today).label}
                      </span>
                    </span>
                  </span>
                </button>
                {row.phone && (
                  <a
                    href={telHref(row.phone)}
                    className="icon-btn icon-btn-fill"
                    aria-label={`${row.name || "Kunde"} anrufen`}
                  >
                    <IconPhone className="h-5 w-5" />
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy === row.visit_id}
                  onClick={() => onDone(row)}
                  className="icon-btn icon-btn-accent"
                  aria-label={`${row.name || "Kunde"} als umberaten abhaken`}
                >
                  <IconCheck className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Empty({ view, query, hasSales }: { view: CustomerView; query: string; hasSales: boolean }) {
  if (!hasSales) {
    return (
      <EmptyState
        boxed
        icon={<IconContacts className="h-6 w-6" />}
        title="Noch keine Aufträge"
        text="Jeder bestätigte Abschluss erscheint hier."
      />
    );
  }
  if (view === "faellig") {
    return <EmptyState boxed icon={<IconCheck className="h-6 w-6" />} title="Gerade niemand fällig" />;
  }
  if (view === "offen") {
    return <EmptyState boxed icon={<IconCheck className="h-6 w-6" />} title="Jeder Auftrag hat einen Kunden" />;
  }
  return <EmptyState boxed icon={<IconSearch className="h-6 w-6" />} title={query ? `Nichts zu „${query}“` : "Keine Aufträge"} />;
}

/** "12.10.2026 · Strom · Sina Berger" */
function soldLine(row: CustomerRow): string {
  return [dayLabel(sqlDay(row.sold_at)), productLabel(row.energy_type), row.user_name].filter(Boolean).join(" · ");
}
