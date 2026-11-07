"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell, InlineError, ListLabel, PageHeader, Pill, Segmented, Switch, ToneTile, plural } from "@/components/ui";
import { IconCloudUp, IconEuro, IconList, IconPlus, IconSparkles, IconUsers } from "@/components/icons";
import { money, percentLabel, SPARTE_LABEL, SPARTEN, type BonusScope, type RuleMode, type RuleScope, type Sparte } from "@/lib/commissions/model";
import type { AdminBonus, AdminRule, CommissionAdmin } from "@/lib/commissions/store";
import { parseInput, send, shortDay } from "../../provisionen/client";
import { ImportSheet } from "./ImportSheet";

type Open =
  | { kind: "import" }
  | { kind: "standard" }
  | { kind: "floor" }
  | { kind: "rule"; rule: AdminRule | null }
  | { kind: "bonus"; bonus: AdminBonus | null };

const SCOPE_LABEL: Record<RuleScope, string> = { SPARTE: "Sparte", PROVIDER: "Anbieter", TARIFF: "Tarif" };
const BONUS_KIND: Record<string, string> = { TARIFF: "Tarif-Bonus", PERSONAL: "Persönlicher Bonus", COMBO: "Kombi-Bonus", VOLUME: "Staffel" };

function ruleValue(mode: RuleMode, value: number): string {
  return mode === "FIXED" ? `fest ${money(value)}` : percentLabel(value);
}

function period(from: string | null, to: string | null): string | null {
  if (from && to) return `${shortDay(from)}–${shortDay(to, true)}`;
  if (to) return `bis ${shortDay(to, true)}`;
  if (from) return `ab ${shortDay(from, true)}`;
  return null;
}

/**
 * Provisionsregeln: die Liste vom Portal, der Standardsatz fuer alle,
 * Ausnahmen je Sparte, Anbieter oder Tarif und die Boni. Persoenliche
 * Saetze stehen unter Provisionen › Personen.
 */
export function CommissionSettings({ data, today, openImport }: { data: CommissionAdmin; today: string; openImport: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<Open | null>(openImport ? { kind: "import" } : null);
  const { settings, latest, counts } = data;

  async function patchSettings(body: Record<string, unknown>, done: string) {
    const result = await send("/api/commissions/settings", "PATCH", body);
    if (result.error) {
      toast(result.error);
      return false;
    }
    toast(done);
    router.refresh();
    return true;
  }

  return (
    <div className="page-narrow">
      <PageHeader
        title="Provisionsregeln"
        subtitle={latest ? `Stand ${shortDay(latest.valid_from, true)} · ${plural(counts.tariffs, "Tarif", "Tarife")}` : "Noch keine Liste"}
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
      />

      <div className="space-y-6">
        <section>
          <ListLabel>Liste vom Portal</ListLabel>
          <ul className="list list-icons">
            <li>
              <Cell
                onClick={() => setOpen({ kind: "import" })}
                icon={<ToneTile tone="teal"><IconCloudUp className="h-4 w-4" /></ToneTile>}
                title="Liste importieren"
                subtitle={latest ? latest.label || `Stand ${shortDay(latest.valid_from, true)}` : "Excel-Datei „Meine Provisionen“"}
                chevron
              />
            </li>
            {latest && (
              <li>
                <Cell
                  href="/provisionen"
                  icon={<ToneTile tone="blue"><IconEuro className="h-4 w-4" /></ToneTile>}
                  title="Liste ansehen"
                  detail={plural(counts.tariffs, "Tarif", "Tarife")}
                />
              </li>
            )}
            {counts.review > 0 && (
              <li>
                <Cell
                  href="/provisionen?pruefen=1"
                  icon={<ToneTile tone="brown"><IconList className="h-4 w-4" /></ToneTile>}
                  title="Sparte prüfen"
                  subtitle="Weder Strom noch Gas im Namen – vorerst als Strom eingeordnet"
                  trailing={<Pill tone="warn">{counts.review}</Pill>}
                />
              </li>
            )}
          </ul>
          {latest && (
            <p className="list-footer">
              {[
                latest.promo_until ? `Aktionsprovision gilt bis ${shortDay(latest.promo_until, true)}` : "Aktionsprovision gilt bis zur nächsten Liste",
                counts.hidden > 0 ? `${counts.hidden} ausgeblendet` : null,
                counts.inactive > 0 ? `${counts.inactive} entfallen` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </section>

        <section>
          <ListLabel>Für alle</ListLabel>
          <ul className="list">
            <li>
              <Cell
                onClick={() => setOpen({ kind: "standard" })}
                title="Standardsatz"
                subtitle="Anteil der Admin-Provision für den Vertrieb"
                detail={settings.standard_percent === null ? "nicht festgelegt" : percentLabel(settings.standard_percent)}
                tone={settings.standard_percent === null ? "accent" : undefined}
                chevron
              />
            </li>
            <li>
              <Cell
                title="Aktion weitergeben"
                subtitle={settings.share_promo ? "Der Satz gilt auch für die Aktionsprovision" : "Die Aktionsprovision behältst du"}
                trailing={
                  <Switch
                    checked={Boolean(settings.share_promo)}
                    onChange={(on) => void patchSettings({ sharePromo: on }, on ? "Aktion wird weitergegeben" : "Aktion behältst du")}
                    label="Aktionsprovision anteilig weitergeben"
                  />
                }
              />
            </li>
            <li>
              <Cell
                title="Folgeprovision weitergeben"
                subtitle={settings.share_follow ? "Anteilig, sobald du sie bekommst" : "Die Folgeprovision behältst du"}
                trailing={
                  <Switch
                    checked={Boolean(settings.share_follow)}
                    onChange={(on) => void patchSettings({ shareFollow: on }, on ? "Folgeprovision wird weitergegeben" : "Folgeprovision behältst du")}
                    label="Folgeprovision anteilig weitergeben"
                  />
                }
              />
            </li>
            <li>
              <Cell
                onClick={() => setOpen({ kind: "floor" })}
                title="Untergrenze für Führungskräfte"
                subtitle="So viel ihrer Provision geben sie mindestens weiter"
                detail={settings.min_share === null ? "keine" : percentLabel(settings.min_share)}
                chevron
              />
            </li>
          </ul>
          <p className="list-footer">Der Vertrieb sieht nur Euro-Beträge – nie Sätze, deine Admin-Provision oder was die Ebenen darüber bekommen.</p>
        </section>

        <section>
          <ListLabel>Ausnahmen</ListLabel>
          <ul className="list">
            {data.rules.map((rule) => (
              <li key={rule.id}>
                <Cell
                  onClick={() => setOpen({ kind: "rule", rule })}
                  title={rule.label}
                  subtitle={SCOPE_LABEL[rule.scope]}
                  detail={ruleValue(rule.mode, rule.value)}
                  chevron
                />
              </li>
            ))}
            <li>
              <Cell
                onClick={() => setOpen({ kind: "rule", rule: null })}
                icon={<IconPlus className="h-5 w-5 text-accent-ink" />}
                title="Ausnahme hinzufügen"
                tone="accent"
                disabled={!latest}
              />
            </li>
          </ul>
          <p className="list-footer">Die genauere gilt: Tarif vor Anbieter vor Sparte vor Standard. Eine Ausnahme für einen Tarif geht auch direkt in der Liste.</p>
        </section>

        <section>
          <ListLabel>Boni</ListLabel>
          <ul className="list">
            {data.bonuses
              .filter((bonus) => bonus.kind !== "VOLUME")
              .map((bonus) => {
                const expired = bonus.valid_to !== null && bonus.valid_to < today;
                return (
                  <li key={bonus.id}>
                    <Cell
                      onClick={() => setOpen({ kind: "bonus", bonus })}
                      title={bonus.label || BONUS_KIND[bonus.kind]}
                      subtitle={[
                        bonus.label ? BONUS_KIND[bonus.kind] : null,
                        bonus.kind === "PERSONAL" ? bonus.personName : null,
                        bonus.kind === "COMBO" ? "Strom und Gas beim selben Kunden" : bonus.target,
                        period(bonus.valid_from, bonus.valid_to),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      wrap
                      trailing={
                        <span className="flex shrink-0 items-center gap-2">
                          {!bonus.active && <Pill>Aus</Pill>}
                          {bonus.active && expired && <Pill>Abgelaufen</Pill>}
                          <span className="text-headline tabular-nums">+{money(bonus.amount_eur)}</span>
                        </span>
                      }
                      chevron
                    />
                  </li>
                );
              })}
            <li>
              <Cell
                onClick={() => setOpen({ kind: "bonus", bonus: null })}
                icon={<IconSparkles className="h-5 w-5 text-accent-ink" />}
                title="Bonus anlegen"
                tone="accent"
                disabled={!latest}
              />
            </li>
          </ul>
          <p className="list-footer">Boni zahlst du aus deiner Marge, sie gehen an den, der verkauft. Staffel-Boni kommen mit der Auftragsübersicht.</p>
        </section>

        <section>
          <ListLabel>Personen</ListLabel>
          <ul className="list list-icons">
            <li>
              <Cell
                href="/provisionen/struktur"
                icon={<ToneTile tone="indigo"><IconUsers className="h-4 w-4" /></ToneTile>}
                title="Persönliche Sätze und Anteile"
                subtitle="Wer direkt unter dir mehr oder weniger bekommt"
              />
            </li>
          </ul>
        </section>
      </div>

      {open?.kind === "import" && <ImportSheet today={today} onClose={() => setOpen(null)} />}
      {open?.kind === "standard" && (
        <PercentSheet
          title="Standardsatz"
          hint="So viel Prozent der Admin-Provision bekommt jede Person, für die nichts anderes gilt."
          value={settings.standard_percent}
          onClose={() => setOpen(null)}
          onSave={(value) => patchSettings({ standardPercent: value }, `Standardsatz ${value === null ? "" : percentLabel(value)}`)}
        />
      )}
      {open?.kind === "floor" && (
        <PercentSheet
          title="Untergrenze"
          hint="Führungskräfte geben ihren Leuten mindestens so viel Prozent ihrer eigenen Provision weiter. Leer: keine Untergrenze."
          value={settings.min_share}
          optional
          onClose={() => setOpen(null)}
          onSave={(value) => patchSettings({ minShare: value }, value === null ? "Keine Untergrenze" : `Untergrenze ${percentLabel(value)}`)}
        />
      )}
      {open?.kind === "rule" && <RuleSheet key={open.rule?.id ?? "neu"} rule={open.rule} data={data} onClose={() => setOpen(null)} />}
      {open?.kind === "bonus" && <BonusSheet key={open.bonus?.id ?? "neu"} bonus={open.bonus} data={data} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Ein Prozentwert - Standardsatz oder Untergrenze. */
function PercentSheet({
  title,
  hint,
  value,
  optional = false,
  onClose,
  onSave,
}: {
  title: string;
  hint: string;
  value: number | null;
  optional?: boolean;
  onClose: () => void;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  const [busy, setBusy] = useState(false);
  const parsed = parseInput(text);
  const valid = parsed === null ? optional : !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onSave(parsed);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form="percent-form" className="btn btn-primary btn-lg btn-block" disabled={!valid || busy}>
          {busy ? "Speichern …" : "Speichern"}
        </button>
      }
    >
      <form id="percent-form" onSubmit={submit} className="space-y-3">
        <div className="relative">
          <label className="sr-only" htmlFor="percent-value">
            {title} in Prozent
          </label>
          <input
            id="percent-value"
            className="field pr-12 tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            placeholder={optional ? "keine" : "z. B. 60"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">%</span>
        </div>
        <p className="list-footer">{hint}</p>
      </form>
    </Sheet>
  );
}

/** Auswahl eines Tarifs aus der Liste - mit Suche, die Liste ist lang. */
function TariffPicker({ tariffs, value, onChange }: { tariffs: CommissionAdmin["tariffs"]; value: string; onChange: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const matches = useMemo(() => {
    const needle = term.trim().toLocaleLowerCase("de-DE");
    const list = needle ? tariffs.filter((t) => `${t.provider} ${t.name}`.toLocaleLowerCase("de-DE").includes(needle)) : tariffs;
    // Der gewaehlte Tarif bleibt in der Auswahl, auch wenn die Suche ihn nicht mehr trifft.
    const chosen = tariffs.find((t) => String(t.id) === value);
    return chosen && !list.includes(chosen) ? [chosen, ...list] : list;
  }, [tariffs, term, value]);
  return (
    <div className="space-y-2">
      <input
        type="search"
        className="field"
        placeholder="Tarif suchen"
        aria-label="Tarif suchen"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <select className="field" aria-label="Tarif" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Tarif wählen …</option>
        {matches.slice(0, 300).map((tariff) => (
          <option key={tariff.id} value={tariff.id}>
            {tariff.provider} · {tariff.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Wofuer etwas gilt: Sparte, Anbieter oder Tarif (bei Boni auch "alle"). */
function ScopeFields({
  scope,
  scopeValue,
  setScope,
  setScopeValue,
  data,
  allowAll,
}: {
  scope: BonusScope;
  scopeValue: string;
  setScope: (scope: BonusScope) => void;
  setScopeValue: (value: string) => void;
  data: CommissionAdmin;
  allowAll: boolean;
}) {
  const options: Array<{ value: BonusScope; label: string }> = [
    ...(allowAll ? [{ value: "ALL" as const, label: "Alle" }] : []),
    { value: "SPARTE", label: "Sparte" },
    { value: "PROVIDER", label: "Anbieter" },
    { value: "TARIFF", label: "Tarif" },
  ];
  return (
    <div className="space-y-3">
      <Segmented
        ariaLabel="Gilt für"
        value={scope}
        onChange={(next) => {
          setScope(next);
          setScopeValue(next === "SPARTE" ? "STROM" : "");
        }}
        options={options}
      />
      {scope === "SPARTE" && (
        <select className="field" aria-label="Sparte" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
          {SPARTEN.map((sparte) => (
            <option key={sparte} value={sparte}>
              {SPARTE_LABEL[sparte as Sparte]}
            </option>
          ))}
        </select>
      )}
      {scope === "PROVIDER" && (
        <select className="field" aria-label="Anbieter" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>
          <option value="">Anbieter wählen …</option>
          {data.providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      )}
      {scope === "TARIFF" && <TariffPicker tariffs={data.tariffs} value={scopeValue} onChange={setScopeValue} />}
    </div>
  );
}

function RuleSheet({ rule, data, onClose }: { rule: AdminRule | null; data: CommissionAdmin; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [scope, setScope] = useState<RuleScope>(rule?.scope ?? "SPARTE");
  const [scopeValue, setScopeValue] = useState(rule?.scope_value ?? "STROM");
  const [mode, setMode] = useState<RuleMode>(rule?.mode ?? "PERCENT");
  const [text, setText] = useState(rule ? String(rule.value).replace(".", ",") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseInput(text);
  const valid = parsed !== null && !Number.isNaN(parsed) && scopeValue !== "" && (mode === "FIXED" || parsed <= 100);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    // Anderer Bereich: die alte Ausnahme faellt weg, die neue entsteht.
    if (rule && (rule.scope !== scope || rule.scope_value !== scopeValue)) {
      const removed = await send(`/api/commissions/rules/${rule.id}`, "DELETE");
      if (removed.error) {
        setBusy(false);
        setError(removed.error);
        return;
      }
    }
    const result = await send("/api/commissions/rules", "POST", { scope, scopeValue, mode, value: parsed });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast("Ausnahme gespeichert");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!rule) return;
    if (!(await confirm({ title: "Ausnahme entfernen?", text: `${rule.label}: danach gilt wieder die nächstallgemeine Regel.`, confirmLabel: "Entfernen", danger: true }))) return;
    const result = await send(`/api/commissions/rules/${rule.id}`, "DELETE");
    if (result.error) {
      setError(result.error);
      return;
    }
    toast("Ausnahme entfernt");
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title={rule ? "Ausnahme bearbeiten" : "Neue Ausnahme"}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!valid || busy} onClick={() => void save()}>
            {busy ? "Speichern …" : "Speichern"}
          </button>
          {rule && (
            <button type="button" className="btn btn-plain btn-block text-danger" disabled={busy} onClick={() => void remove()}>
              Ausnahme entfernen
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <section>
          <ListLabel>Gilt für</ListLabel>
          <ScopeFields
            scope={scope}
            scopeValue={scopeValue}
            setScope={(next) => setScope(next as RuleScope)}
            setScopeValue={setScopeValue}
            data={data}
            allowAll={false}
          />
        </section>
        <section className="space-y-3">
          <ListLabel>Provision</ListLabel>
          <Segmented
            ariaLabel="Art"
            value={mode}
            onChange={setMode}
            options={[
              { value: "PERCENT", label: "Satz" },
              { value: "FIXED", label: "Fester Betrag" },
            ]}
          />
          <div className="relative">
            <input
              className="field pr-28 tabular-nums"
              inputMode="decimal"
              aria-label={mode === "PERCENT" ? "Satz in Prozent der Admin-Provision" : "Betrag in Euro je Vertrag"}
              placeholder={mode === "PERCENT" ? "z. B. 65" : "z. B. 90"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">
              {mode === "PERCENT" ? "% von Admin" : "€ je Vertrag"}
            </span>
          </div>
          <p className="list-footer">
            {mode === "PERCENT"
              ? "Statt des Standardsatzes. Persönliche Sätze verschieben sich mit."
              : "Für die Abschlussprovision – egal wie hoch die Admin-Provision ist. Die Folgeprovision wird weiter prozentual geteilt."}
          </p>
        </section>
      </div>
      {dialog}
    </Sheet>
  );
}

function BonusSheet({ bonus, data, onClose }: { bonus: AdminBonus | null; data: CommissionAdmin; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [kind, setKind] = useState<"TARIFF" | "PERSONAL" | "COMBO">(bonus && bonus.kind !== "VOLUME" ? bonus.kind : "TARIFF");
  const [label, setLabel] = useState(bonus?.label ?? "");
  const [amount, setAmount] = useState(bonus ? String(bonus.amount_eur).replace(".", ",") : "");
  const [scope, setScope] = useState<BonusScope>(bonus?.scope ?? "ALL");
  const [scopeValue, setScopeValue] = useState(bonus?.scope_value ?? "");
  const [userId, setUserId] = useState(bonus?.user_id ? String(bonus.user_id) : "");
  const [validFrom, setValidFrom] = useState(bonus?.valid_from ?? "");
  const [validTo, setValidTo] = useState(bonus?.valid_to ?? "");
  const [active, setActive] = useState(bonus ? Boolean(bonus.active) : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseInput(amount);
  const valid =
    parsed !== null &&
    !Number.isNaN(parsed) &&
    parsed > 0 &&
    (kind !== "PERSONAL" || userId !== "") &&
    (kind === "COMBO" || scope === "ALL" || scopeValue !== "") &&
    (!validFrom || !validTo || validFrom <= validTo);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const body = {
      kind,
      label,
      amount: parsed,
      scope: kind === "COMBO" ? "ALL" : scope,
      scopeValue: kind === "COMBO" ? "" : scopeValue,
      userId: kind === "PERSONAL" ? Number(userId) : null,
      validFrom: validFrom || null,
      validTo: validTo || null,
      active,
    };
    const result = bonus ? await send(`/api/commissions/bonuses/${bonus.id}`, "PATCH", body) : await send("/api/commissions/bonuses", "POST", body);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast(bonus ? "Bonus gespeichert" : "Bonus angelegt");
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!bonus) return;
    if (!(await confirm({ title: "Bonus löschen?", text: "Er verschwindet sofort aus allen Listen.", confirmLabel: "Löschen", danger: true }))) return;
    const result = await send(`/api/commissions/bonuses/${bonus.id}`, "DELETE");
    if (result.error) {
      setError(result.error);
      return;
    }
    toast("Bonus gelöscht");
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      title={bonus ? "Bonus bearbeiten" : "Neuer Bonus"}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!valid || busy} onClick={() => void save()}>
            {busy ? "Speichern …" : bonus ? "Speichern" : "Anlegen"}
          </button>
          {bonus && (
            <button type="button" className="btn btn-plain btn-block text-danger" disabled={busy} onClick={() => void remove()}>
              Bonus löschen
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <Segmented
          ariaLabel="Art des Bonus"
          value={kind}
          onChange={setKind}
          options={[
            { value: "TARIFF", label: "Tarif" },
            { value: "PERSONAL", label: "Persönlich" },
            { value: "COMBO", label: "Kombi" },
          ]}
        />
        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
          <div>
            <label className="label" htmlFor="bonus-label">
              Bezeichnung
            </label>
            <input
              id="bonus-label"
              className="field"
              maxLength={80}
              placeholder={kind === "PERSONAL" ? "z. B. Einarbeitung" : kind === "COMBO" ? "z. B. Kombi-Aktion" : "z. B. Herbst-Aktion"}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="bonus-amount">
              Je Vertrag
            </label>
            <div className="relative">
              <input
                id="bonus-amount"
                className="field pr-10 tabular-nums"
                inputMode="decimal"
                placeholder="20"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">€</span>
            </div>
          </div>
        </div>

        {kind === "PERSONAL" && (
          <div>
            <label className="label" htmlFor="bonus-person">
              Für
            </label>
            <select id="bonus-person" className="field" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Person wählen …</option>
              {data.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {member.active ? "" : " (deaktiviert)"}
                </option>
              ))}
            </select>
          </div>
        )}

        {kind !== "COMBO" ? (
          <section>
            <ListLabel>Gilt für</ListLabel>
            <ScopeFields scope={scope} scopeValue={scopeValue} setScope={setScope} setScopeValue={setScopeValue} data={data} allowAll />
          </section>
        ) : (
          <p className="list-footer">Je Kunde, der Strom und Gas zusammen abschließt.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="bonus-from">
              Ab
            </label>
            <input id="bonus-from" type="date" className="field" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bonus-to">
              Bis
            </label>
            <input id="bonus-to" type="date" className="field" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </div>
        </div>

        {bonus && (
          <ul className="list">
            <li>
              <Cell title="Aktiv" trailing={<Switch checked={active} onChange={setActive} label="Bonus aktiv" />} />
            </li>
          </ul>
        )}
      </div>
      {dialog}
    </Sheet>
  );
}
