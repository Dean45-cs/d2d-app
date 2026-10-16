"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sheet } from "@/components/Sheet";
import { Cell, InlineError, ListLabel, Pill, plural } from "@/components/ui";
import { checkPrice, readPriceTable, TABLE_COLUMNS, type TableRow } from "@/lib/energy/table";

interface ImportResult {
  created: number;
  updated: number;
  /** Unveraendert zurueckgekommen - bleibt samt Pruefdatum, wie es war. */
  unchanged?: number;
  skipped: number;
  errors: Array<{ line: number; error: string }>;
  unlocated: string[];
}

const PREVIEW_ROWS = 40;

/** Excel speichert CSV unter Windows oft als ANSI - dann stimmen die Umlaute nicht. */
async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

function ct(value: number | null): string {
  return value === null ? "" : `${value.toLocaleString("de-DE", { maximumFractionDigits: 3 })} ct`;
}

/**
 * Viele Orte auf einmal: Vorlage herunterladen, in Excel oder Google Tabellen
 * ausfuellen, hier einfuegen. Die Vorschau zeigt vor dem Speichern, was
 * uebernommen wird und was nicht.
 */
export function ImportSheet({
  knownPostalCodes,
  onClose,
  onDone,
}: {
  knownPostalCodes: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const table = readPriceTable(text);
    const known = new Set(knownPostalCodes);
    const ready: Array<TableRow & { label: string; detail: string; isNew: boolean }> = [];
    const problems: Array<{ line: number; error: string }> = [];
    let empty = 0;
    for (const row of table.rows) {
      const checked = checkPrice(row.fields);
      if (!checked.ok) {
        if (checked.empty) empty++;
        else problems.push({ line: row.line, error: checked.error });
        continue;
      }
      const price = checked.value;
      ready.push({
        ...row,
        label: `${price.postal_code} ${price.city}`.trim(),
        detail: [
          price.provider,
          price.strom_ct_kwh !== null && `Strom ${ct(price.strom_ct_kwh)}`,
          price.gas_ct_kwh !== null && `Gas ${ct(price.gas_ct_kwh)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        isNew: !known.has(price.postal_code),
      });
    }
    return { ready, problems, empty, error: table.error };
  }, [text, knownPostalCodes]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (/\.xlsx?$/i.test(file.name)) {
      setError("Excel-Dateien bitte als CSV speichern – oder die Zellen einfach kopieren und einfügen.");
      return;
    }
    setFileName(file.name);
    setText(await readFile(file));
  }

  async function submit() {
    if (parsed.ready.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/provider-prices/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: parsed.ready.map(({ line, fields }) => ({ line, fields })),
        }),
      });
      const data = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Die Tabelle konnte nicht übernommen werden.");
        return;
      }
      const parts = [
        `${plural(data.created + data.updated, "Ort", "Orte")} übernommen`,
        data.updated > 0 && `davon ${data.updated} aktualisiert`,
        (data.unchanged ?? 0) > 0 && `${data.unchanged} unverändert`,
        data.errors.length > 0 && `${data.errors.length} mit Fehler`,
      ].filter(Boolean);
      let message = `${parts.join(", ")}.`;
      if (data.unlocated.length > 0) {
        message += ` Ohne Kartenpunkt (Lage unbekannt): ${data.unlocated.join(", ")} – gilt trotzdem für Gebiete mit dieser PLZ.`;
      }
      onDone(message);
    } catch {
      setError("Keine Verbindung – bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const hasInput = text.trim() !== "";

  return (
    <Sheet
      title="Preise als Tabelle"
      subtitle="Aus Excel oder Google Tabellen"
      onClose={onClose}
      width="lg"
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={submit}
            disabled={busy || parsed.ready.length === 0}
          >
            {busy
              ? "Wird übernommen …"
              : parsed.ready.length > 0
                ? `${plural(parsed.ready.length, "Ort", "Orte")} übernehmen`
                : "Übernehmen"}
          </button>
        </div>
      }
    >
      <ol className="space-y-6">
        <Step number={1} title="Vorlage laden">
          <a href="/api/provider-prices/export" download className="btn btn-secondary btn-sm">
            Vorlage laden (CSV)
          </a>
          <p className="mt-2 text-footnote text-muted">Gebiete ohne Preis stehen schon drin.</p>
        </Step>

        <Step number={2} title="Preise ergänzen">
          <p className="text-footnote text-muted">ct/kWh und €/Monat, brutto. Leere Zeilen werden übersprungen.</p>
        </Step>

        <Step number={3} title="Hier einfügen">
          <label className="sr-only" htmlFor="import-table">
            Tabelle
          </label>
          <textarea
            id="import-table"
            className="field min-h-32 font-mono"
            placeholder={`${TABLE_COLUMNS.slice(0, 5)
              .map((c) => c.label)
              .join(" | ")} | …`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
            }}
            spellCheck={false}
          />
          <label className="link mt-2 inline-flex min-h-11 cursor-pointer items-center">
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {fileName ? `Datei: ${fileName}` : "CSV-Datei wählen"}
          </label>
        </Step>
      </ol>

      {hasInput &&
        (parsed.error ? (
          <div className="mt-6">
            <InlineError>{parsed.error}</InlineError>
          </div>
        ) : (
          <>
            <ListLabel>Vorschau</ListLabel>
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              <Pill tone="accent">{plural(parsed.ready.length, "Ort", "Orte")} bereit</Pill>
              {parsed.empty > 0 && <Pill>{parsed.empty} ohne Preis</Pill>}
              {parsed.problems.length > 0 && <Pill tone="danger">{plural(parsed.problems.length, "Fehler", "Fehler")}</Pill>}
            </div>
            {parsed.problems.length > 0 && (
              <ul className="mb-2 space-y-1 px-1">
                {parsed.problems.slice(0, PREVIEW_ROWS).map((problem) => (
                  <li key={problem.line} className="text-footnote font-semibold text-danger">
                    Zeile {problem.line}: {problem.error}
                  </li>
                ))}
              </ul>
            )}
            <ul className="list">
              {parsed.ready.slice(0, PREVIEW_ROWS).map((row) => (
                <li key={row.line}>
                  <Cell
                    title={row.label}
                    subtitle={row.detail}
                    trailing={<Pill tone={row.isNew ? "accent" : "neutral"}>{row.isNew ? "neu" : "ersetzt"}</Pill>}
                  />
                </li>
              ))}
            </ul>
            {parsed.ready.length > PREVIEW_ROWS && (
              <p className="list-footer">… und {parsed.ready.length - PREVIEW_ROWS} weitere</p>
            )}
          </>
        ))}
    </Sheet>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="glyph glyph-sm glyph-round kpi text-footnote font-bold" aria-hidden="true">
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-headline">{title}</p>
        {children}
      </div>
    </li>
  );
}
