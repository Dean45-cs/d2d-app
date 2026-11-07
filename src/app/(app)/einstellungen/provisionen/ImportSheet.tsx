"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Cell, InlineError, ListLabel, Pill, plural } from "@/components/ui";
import type { ImportPreview } from "@/lib/commissions/store";
import type { ImportRow } from "@/lib/commissions/table";
import { send } from "../../provisionen/client";

interface ReadResponse {
  rows: ImportRow[];
  skipped: Array<{ line: number; error: string }>;
  skippedCount: number;
  preview: ImportPreview;
  meta: { label: string; validFrom: string; promoUntil: string };
}

/** Die ersten Namen einer Gruppe, der Rest als Zahl. */
function names(list: string[], max = 4): string {
  if (list.length <= max) return list.join(", ");
  return `${list.slice(0, max).join(", ")} und ${list.length - max} weitere`;
}

/**
 * Die Liste aus dem Portal uebernehmen: Excel-Datei ("Meine Provisionen")
 * waehlen oder die Tabelle aus Excel einfuegen. Die Vorschau zeigt vor dem
 * Speichern, was neu ist, was sich aendert und was entfaellt.
 */
export function ImportSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [read, setRead] = useState<ReadResponse | null>(null);
  const [label, setLabel] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const [promoUntil, setPromoUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readList() {
    if (busy || (!file && !text.trim())) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    if (file) form.append("file", file);
    else form.append("text", text);
    const result = await send("/api/commissions/import/preview", "POST", form, 60_000);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const data = result.data as unknown as ReadResponse;
    setRead(data);
    setLabel(data.meta.label);
    setValidFrom(data.meta.validFrom || today);
    setPromoUntil(data.meta.promoUntil);
  }

  async function commit() {
    if (!read || busy) return;
    setBusy(true);
    setError(null);
    const result = await send("/api/commissions/import", "POST", { rows: read.rows, label, validFrom, promoUntil }, 60_000);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(`Liste übernommen · ${plural(read.preview.tariffs, "Tarif", "Tarife")}`);
    onClose();
    router.refresh();
  }

  const preview = read?.preview;

  return (
    <Sheet
      title="Liste importieren"
      subtitle={read ? "Vorschau – noch nichts gespeichert" : "Meine Provisionen aus dem Portal"}
      onClose={onClose}
      width="lg"
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          {read ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-plain" disabled={busy} onClick={() => setRead(null)}>
                Zurück
              </button>
              <button type="button" className="btn btn-primary btn-lg flex-1" disabled={busy || !validFrom} onClick={() => void commit()}>
                {busy ? "Übernehmen …" : "Übernehmen"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={busy || (!file && !text.trim())}
              onClick={() => void readList()}
            >
              {busy ? "Lesen …" : "Liste lesen"}
            </button>
          )}
        </div>
      }
    >
      {!read || !preview ? (
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="commission-file">
              Excel-Datei aus dem Portal
            </label>
            <input
              id="commission-file"
              type="file"
              className="field py-3"
              accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            <p className="list-footer">
              Im Portal unter „Meine Provisionen“ exportieren. Erwartet werden die Spalten Anbieter, Tarif, Verbrauch von/bis,
              Grund-, Aktions- und Folgeprovision.
            </p>
          </div>
          {!file && (
            <div>
              <label className="label" htmlFor="commission-text">
                Oder die Tabelle aus Excel einfügen
              </label>
              <textarea
                id="commission-text"
                className="field min-h-32 font-mono text-footnote"
                placeholder={"Anbieter\tTarif\tVerbrauch VON\tVerbrauch BIS\tGrundprovision …"}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <ListLabel>
              {plural(preview.tariffs, "Tarif", "Tarife")} · {plural(preview.bands, "Staffel", "Staffeln")}
            </ListLabel>
            <ul className="list">
              <Row title="Neu" count={preview.added.length} detail={names(preview.added)} tone="accent" />
              <Row title="Geändert" count={preview.changed.length} detail={names(preview.changed)} />
              <Row title="Unverändert" count={preview.unchanged} />
              <Row
                title="Entfällt"
                count={preview.removed.length}
                detail={preview.removed.length > 0 ? `${names(preview.removed)} – bleiben gespeichert, für den Vertrieb ausgeblendet` : undefined}
                tone="warn"
              />
              <Row
                title="Sparte prüfen"
                count={preview.review.length}
                detail={preview.review.length > 0 ? `Weder Strom noch Gas im Namen: ${names(preview.review)} – vorerst als Strom` : undefined}
                tone="warn"
              />
              <Row title="Individuelle Provision" count={preview.individual} detail="Nur Platzhalter in der Liste – der Vertrieb sieht „individuell“" />
            </ul>
            {read.skippedCount > 0 && (
              <p className="list-footer text-danger">
                {plural(read.skippedCount, "Zeile übersprungen", "Zeilen übersprungen")}:{" "}
                {read.skipped
                  .slice(0, 5)
                  .map((skip) => `Zeile ${skip.line}: ${skip.error}`)
                  .join(" · ")}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <label className="label" htmlFor="import-label">
                Bezeichnung
              </label>
              <input id="import-label" className="field" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="import-from">
                  Stand
                </label>
                <input id="import-from" type="date" className="field" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="import-promo">
                  Aktion gilt bis
                </label>
                <input id="import-promo" type="date" className="field" value={promoUntil} onChange={(e) => setPromoUntil(e.target.value)} />
              </div>
            </div>
            <p className="list-footer">
              Danach zählt nur noch die Grundprovision. Leer lassen, wenn die Aktionsprovision bis zur nächsten Liste gilt.
            </p>
          </section>
        </div>
      )}
    </Sheet>
  );
}

function Row({ title, count, detail, tone }: { title: string; count: number; detail?: ReactNode; tone?: "accent" | "warn" }) {
  if (count === 0 && title !== "Unverändert") return null;
  return (
    <li>
      <Cell
        title={title}
        subtitle={count > 0 ? detail : undefined}
        wrap
        trailing={tone && count > 0 ? <Pill tone={tone}>{count}</Pill> : <span className="text-subhead text-muted">{count}</span>}
      />
    </li>
  );
}
