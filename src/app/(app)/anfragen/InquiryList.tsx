"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INQUIRY_TOPICS,
  type InquiryCounts,
  type InquiryRow,
  type InquiryTopic,
  type InquiryView,
} from "@/lib/inquiry-labels";
import { Cell, EmptyState, PageHeader, Pill, SegmentedLinks, ToneTile, plural, type SymbolTone } from "@/components/ui";
import { IconChat, IconCheck, IconSearch } from "@/components/icons";
import { timeAgo } from "@/lib/format";
import { InquirySheet } from "./InquirySheet";

const TOPIC_TONE: Record<InquiryTopic, SymbolTone> = {
  BERATUNG: "teal",
  BERATER_PRUEFEN: "indigo",
  BEWERBUNG: "purple",
  SONSTIGES: "slate",
};

/**
 * Posteingang der Website: neue Anfragen zuerst, dann was in Bearbeitung
 * ist. Ein Tipp oeffnet die Anfrage mit Antwort, Status, Zuteilung und Verlauf.
 */
export function InquiryList({
  rows,
  counts,
  view,
  query,
  manager,
  assignees,
  limit,
}: {
  rows: InquiryRow[];
  counts: InquiryCounts;
  view: InquiryView;
  query: string;
  manager: boolean;
  assignees: Array<{ id: number; name: string }>;
  limit: number;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<number | null>(null);
  const [search, setSearch] = useState(query);

  useEffect(() => {
    // Aus der Push-Nachricht: /anfragen?anfrage=12 oeffnet genau diese Anfrage.
    const params = new URLSearchParams(window.location.search);
    const target = Number(params.get("anfrage"));
    if (Number.isSafeInteger(target) && target > 0) setDetail(target);
    if (!params.has("anfrage")) return;
    params.delete("anfrage");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (term === query) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ ansicht: view });
      if (term) params.set("q", term);
      router.replace(`/anfragen?${params}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, query, view, router]);

  const summary = [
    counts.new > 0 && `${counts.new} neu`,
    counts.open > 0 && `${counts.open} offen`,
    !manager && "dir zugeteilt",
  ]
    .filter(Boolean)
    .join(" · ");

  const options = [
    { key: "offen", label: counts.open > 0 ? `Offen · ${counts.open}` : "Offen", href: "/anfragen?ansicht=offen" },
    { key: "erledigt", label: "Erledigt", href: "/anfragen?ansicht=erledigt" },
    ...(manager ? [{ key: "spam", label: counts.spam > 0 ? `Spam · ${counts.spam}` : "Spam", href: "/anfragen?ansicht=spam" }] : []),
  ];

  return (
    <div className="page-narrow">
      <PageHeader title="Anfragen" subtitle={summary || "Kontaktformular der Website"} back={{ href: "/profil", label: "Profil", mobileOnly: true }}>
        <SegmentedLinks ariaLabel="Anfragen filtern" current={view} options={options} />
      </PageHeader>

      <label className="relative mb-4 block">
        <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          className="field field-search pl-12"
          placeholder="Name, E-Mail, Telefon, PLZ, Text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Anfragen suchen"
          enterKeyHint="search"
          autoComplete="off"
          maxLength={80}
        />
      </label>

      {rows.length === 0 ? (
        <EmptyState
          boxed
          icon={query ? <IconSearch className="h-6 w-6" /> : view === "offen" ? <IconCheck className="h-6 w-6" /> : <IconChat className="h-6 w-6" />}
          title={query ? `Nichts zu „${query}“` : view === "offen" ? "Keine offenen Anfragen" : "Hier ist nichts"}
          text={!query && view === "offen" ? "Neue Nachrichten aus dem Kontaktformular der Website erscheinen hier." : undefined}
        />
      ) : (
        <ul className="list list-icons">
          {rows.map((row) => (
            <li key={row.id}>
              <Cell
                onClick={() => setDetail(row.id)}
                icon={
                  <ToneTile tone={TOPIC_TONE[row.topic]}>
                    <IconChat className="h-4 w-4" />
                  </ToneTile>
                }
                title={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{row.name}</span>
                    {row.status === "NEW" && <Pill tone="accent">Neu</Pill>}
                  </span>
                }
                subtitle={[INQUIRY_TOPICS[row.topic], row.assigned_name, row.message.replace(/\s+/g, " ")].filter(Boolean).join(" · ")}
                detail={timeAgo(row.created_at)}
                chevron
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length >= limit && <p className="list-footer">Die neuesten {plural(rows.length, "Anfrage", "Anfragen")} – die Suche findet ältere.</p>}

      {detail !== null && (
        <InquirySheet
          key={detail}
          id={detail}
          manager={manager}
          assignees={assignees}
          onClose={() => setDetail(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
