"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Cell, InlineError, ListLabel, Segmented, Switch } from "@/components/ui";
import { kwhRange, money, percentLabel, SEGMENT_LABEL, SPARTE_LABEL, SPARTEN, type RuleMode, type Segment, type Sparte } from "@/lib/commissions/model";
import type { CommissionView, ViewBand, ViewTariff } from "@/lib/commissions/store";
import { parseInput, send, shortDay } from "./client";
import { bandAt } from "./CommissionList";

/** Welche Regel fuer den Tarif gilt - nur fuer die Verwaltung. */
function ruleText(tariff: ViewTariff): string {
  const rule = tariff.admin?.rule;
  if (!rule) return "";
  const value = rule.mode === "FIXED" ? `fest ${money(rule.value)}` : percentLabel(rule.value);
  if (rule.source === "STANDARD") return `Standardsatz ${value}`;
  if (rule.source === "SPARTE") return `Ausnahme ${SPARTE_LABEL[tariff.sparte]}: ${value}`;
  if (rule.source === "PROVIDER") return `Ausnahme ${tariff.provider}: ${value}`;
  return `Eigene Ausnahme: ${value}`;
}

/**
 * Ein Tarif im Detail: jede Staffel mit dem eigenen Betrag, davon Aktion,
 * spaeter die Folgeprovision, dazu die Boni. Fuehrungskraefte sehen, was sie
 * behalten; die Verwaltung Admin-Provision und Marge - und ordnet den Tarif ein.
 */
export function TariffSheet({
  tariff,
  view,
  kwh,
  onClose,
}: {
  tariff: ViewTariff;
  view: CommissionView;
  kwh: number | null;
  onClose: () => void;
}) {
  const match = kwh !== null ? bandAt(tariff.bands, kwh) : undefined;
  const bonus = tariff.bonuses.reduce((sum, item) => sum + item.amount, 0);
  const name = view.subject?.name;
  const heading = view.subject === null ? "Standardliste" : view.manager || (view.admin && name) ? `Provision von ${name}` : "Deine Provision";

  return (
    <Sheet
      title={tariff.name}
      subtitle={`${tariff.provider} · ${SPARTE_LABEL[tariff.sparte]} · ${SEGMENT_LABEL[tariff.segment]}`}
      onClose={onClose}
      width="lg"
    >
      <div className="space-y-6">
        <section>
          <ListLabel>{heading}</ListLabel>
          <ul className="list">
            {tariff.bands.map((band) => (
              <li key={`${band.from}-${band.to}`}>
                <BandRow band={band} view={view} bonus={bonus} highlighted={band === match} promoUntil={view.stand?.promoUntil ?? null} />
              </li>
            ))}
          </ul>
          {kwh !== null && !match && (
            <p className="list-footer">Für {kwh.toLocaleString("de-DE")} kWh gilt dieser Tarif nicht.</p>
          )}
        </section>

        {tariff.bonuses.length > 0 && (
          <section>
            <ListLabel>Boni je Vertrag</ListLabel>
            <ul className="list">
              {tariff.bonuses.map((item) => (
                <li key={item.id}>
                  <Cell
                    title={item.label || (item.personal ? "Persönlicher Bonus" : "Bonus")}
                    subtitle={[item.personal ? "nur für dich" : null, item.until ? `bis ${shortDay(item.until, true)}` : null]
                      .filter(Boolean)
                      .join(" · ") || undefined}
                    trailing={<span className="text-headline tabular-nums text-accent-ink">+{money(item.amount)}</span>}
                  />
                </li>
              ))}
            </ul>
            <p className="list-footer">Boni kommen zur Provision dazu und gehen an den, der verkauft.</p>
          </section>
        )}

        <section>
          <ListLabel>Gut zu wissen</ListLabel>
          <ul className="list">
            <li>
              <Cell title="Auszahlung" detail={tariff.timing} />
            </li>
            {tariff.note && (
              <li>
                <Cell title={tariff.note} wrap />
              </li>
            )}
          </ul>
        </section>

        {view.admin && tariff.admin && <AdminSection tariff={tariff} />}
      </div>
    </Sheet>
  );
}

function BandRow({
  band,
  view,
  bonus,
  highlighted,
  promoUntil,
}: {
  band: ViewBand;
  view: CommissionView;
  bonus: number;
  highlighted: boolean;
  promoUntil: string | null;
}) {
  const lines = [
    band.promo > 0 ? `davon ${money(band.promo)} Aktion${promoUntil ? ` bis ${shortDay(promoUntil)}` : ""}` : null,
    band.follow > 0 ? `später +${money(band.follow)} Folgeprovision` : null,
    bonus > 0 && band.now !== null ? `mit Bonus ${money(band.now + bonus)}` : null,
    view.manager && band.keep !== undefined ? `du behältst ${money(band.keep)}` : null,
    view.admin && band.admin
      ? [
          `Admin ${money(band.admin.now)}${band.admin.follow > 0 ? ` + ${money(band.admin.follow)} später` : ""}`,
          band.chain && view.subject !== null ? `Struktur ${money(band.chain.now)}` : null,
          band.chain ? `bleibt ${money(band.admin.now - band.chain.now - bonus)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  ].filter(Boolean);
  return (
    <Cell
      className={highlighted ? "bg-accent-tint" : ""}
      title={kwhRange(band.from, band.to)}
      subtitle={lines.join(" · ") || undefined}
      wrap
      trailing={
        <span className={`shrink-0 text-headline tabular-nums ${band.now === null ? "text-muted" : ""}`}>
          {band.individual ? "individuell" : band.now === null ? "–" : money(band.now)}
        </span>
      }
    />
  );
}

/** Nur fuer die Verwaltung: Sparte, Kundenart, Notiz, Sichtbarkeit und eine eigene Ausnahme. */
function AdminSection({ tariff }: { tariff: ViewTariff }) {
  const router = useRouter();
  const toast = useToast();
  const admin = tariff.admin!;
  const [sparte, setSparte] = useState<Sparte>(tariff.sparte);
  const [segment, setSegment] = useState<Segment>(tariff.segment);
  const [note, setNote] = useState(tariff.note);
  const [hidden, setHidden] = useState(admin.hidden);
  const [mode, setMode] = useState<RuleMode>(admin.tariffRule?.mode ?? "PERCENT");
  const [value, setValue] = useState(admin.tariffRule ? String(admin.tariffRule.value).replace(".", ",") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch: Record<string, unknown> = {};
  if (sparte !== tariff.sparte || admin.needsReview) patch.sparte = sparte;
  if (segment !== tariff.segment) patch.segment = segment;
  if (note.trim() !== tariff.note) patch.note = note.trim();
  if (hidden !== admin.hidden) patch.hidden = hidden;

  async function run(action: () => Promise<{ error: string | null }>, done: string) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(done);
    router.refresh();
  }

  const parsed = parseInput(value);
  const ruleValid = parsed !== null && !Number.isNaN(parsed);

  return (
    <>
      <section>
        <ListLabel>Einordnen</ListLabel>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="tariff-sparte">
                Sparte{admin.needsReview ? " · geraten" : ""}
              </label>
              <select id="tariff-sparte" className="field" value={sparte} onChange={(e) => setSparte(e.target.value as Sparte)}>
                {SPARTEN.map((option) => (
                  <option key={option} value={option}>
                    {SPARTE_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tariff-segment">
                Kundenart
              </label>
              <select id="tariff-segment" className="field" value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
                <option value="PRIVAT">Privat</option>
                <option value="GEWERBE">Gewerbe</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="tariff-note">
              Hinweis für den Vertrieb
            </label>
            <input
              id="tariff-note"
              className="field"
              maxLength={200}
              placeholder="z. B. nur Neukunden"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <ul className="list">
            <li>
              <Cell title="Für den Vertrieb ausblenden" trailing={<Switch checked={hidden} onChange={setHidden} label="Für den Vertrieb ausblenden" />} />
            </li>
          </ul>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={busy || Object.keys(patch).length === 0}
            onClick={() => void run(() => send(`/api/commissions/tariffs/${tariff.id}`, "PATCH", patch), "Tarif gespeichert")}
          >
            {admin.needsReview && Object.keys(patch).length === 1 && patch.sparte === tariff.sparte ? "Sparte bestätigen" : "Speichern"}
          </button>
        </div>
      </section>

      <section>
        <ListLabel>Provision für diesen Tarif</ListLabel>
        <p className="mb-3 px-1 text-subhead text-muted">Gerade gilt: {ruleText(tariff)}</p>
        <div className="space-y-3">
          <Segmented
            ariaLabel="Art der Ausnahme"
            value={mode}
            onChange={setMode}
            options={[
              { value: "PERCENT", label: "Satz" },
              { value: "FIXED", label: "Fester Betrag" },
            ]}
          />
          <label className="relative block">
            <span className="sr-only">{mode === "PERCENT" ? "Satz in Prozent der Admin-Provision" : "Betrag in Euro je Vertrag"}</span>
            <input
              className="field pr-24 tabular-nums"
              inputMode="decimal"
              placeholder={mode === "PERCENT" ? "z. B. 65" : "z. B. 90"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">
              {mode === "PERCENT" ? "% von Admin" : "€ je Vertrag"}
            </span>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={busy || !ruleValid}
              onClick={() =>
                void run(
                  () => send("/api/commissions/rules", "POST", { scope: "TARIFF", scopeValue: String(tariff.id), mode, value: parsed }),
                  "Ausnahme gespeichert",
                )
              }
            >
              Ausnahme speichern
            </button>
            {admin.tariffRule && (
              <button
                type="button"
                className="btn btn-plain"
                disabled={busy}
                onClick={() => void run(() => send(`/api/commissions/rules/${admin.tariffRule!.id}`, "DELETE"), "Ausnahme entfernt")}
              >
                Entfernen
              </button>
            )}
          </div>
          <p className="list-footer">
            Ein fester Betrag gilt für die Abschlussprovision; die Folgeprovision wird weiter prozentual geteilt. Persönliche Sätze
            verschieben auch Ausnahmen.
          </p>
          {error && <InlineError>{error}</InlineError>}
        </div>
      </section>
    </>
  );
}
