"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cell, EmptyState, ListLabel, Notice, PageHeader, Pill, Segmented, SegmentedLinks, plural } from "@/components/ui";
import { IconCog, IconEuro, IconSearch, IconSparkles } from "@/components/icons";
import { kwhRange, money, SPARTE_LABEL, type Sparte } from "@/lib/commissions/model";
import type { CommissionView, CommissionViewPerson, ViewBand, ViewTariff } from "@/lib/commissions/store";
import { shortDay } from "./client";
import { TariffSheet } from "./TariffSheet";

type SparteFilter = "ALLE" | Sparte;

/** Die Staffel fuer einen Verbrauch - undefined: der Tarif gilt dafuer nicht. */
export function bandAt(bands: ViewBand[], kwh: number): ViewBand | undefined {
  return bands.find((band) => band.from <= kwh && kwh <= band.to);
}

/** "90–246 €" statt "90 €–246 €". */
function moneyRange(min: number, max: number): string {
  if (Math.abs(max - min) < 0.005) return money(min);
  return `${money(min).replace(/\s?€$/, "")}–${money(max)}`;
}

interface Shown {
  tariff: ViewTariff;
  /** Fuer die Sortierung: hoechster (bzw. beim Verbrauch: genau der) Betrag. */
  value: number;
  text: string;
  band?: ViewBand;
}

/** Was in der Zeile rechts steht - fuer einen Verbrauch genau, sonst von–bis. */
function shown(tariff: ViewTariff, kwh: number | null): Shown | null {
  if (kwh !== null) {
    const band = bandAt(tariff.bands, kwh);
    if (!band) return null;
    if (band.individual) return { tariff, value: -1, text: "individuell", band };
    return { tariff, value: band.now ?? -2, text: band.now === null ? "–" : money(band.now), band };
  }
  const amounts = tariff.bands.filter((band) => !band.individual && band.now !== null).map((band) => band.now as number);
  if (tariff.bands.length > 0 && tariff.bands.every((band) => band.individual)) return { tariff, value: -1, text: "individuell" };
  if (amounts.length === 0) return { tariff, value: -2, text: "–" };
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { tariff, value: max, text: moneyRange(min, max), band: tariff.bands.length === 1 ? tariff.bands[0] : undefined };
}

/** Wonach die Suche schaut - ohne Gross-/Kleinschreibung, Unterstrich wie Leerzeichen. */
function searchable(text: string): string {
  return text.toLocaleLowerCase("de-DE").replace(/[_\s]+/g, " ");
}

/**
 * Die Provisionsliste: je Anbieter die Tarife mit dem eigenen Betrag.
 * Mit dem Verbrauch des Kunden zeigt jede Zeile genau die passende Staffel -
 * Tarife, die dafuer nicht gelten, fallen raus.
 */
export function CommissionList({
  view,
  people,
  self,
  showStructure,
  reviewOnly,
}: {
  view: CommissionView;
  people: CommissionViewPerson[];
  self: { id: number; ownList: boolean };
  showStructure: boolean;
  reviewOnly: boolean;
}) {
  const router = useRouter();
  const [sparte, setSparte] = useState<SparteFilter>("ALLE");
  const [kwhText, setKwhText] = useState("");
  const [query, setQuery] = useState("");
  const [business, setBusiness] = useState<"ALLE" | "PRIVAT" | "GEWERBE">("ALLE");
  const [extrasOnly, setExtrasOnly] = useState(false);
  const [byAmount, setByAmount] = useState(false);
  const [review, setReview] = useState(reviewOnly);
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const kwhDigits = kwhText.replace(/\D/g, "");
  const kwh = kwhDigits ? Number(kwhDigits) : null;
  const subjectName = view.subject?.name ?? null;
  const viewingOther = view.subject !== null && view.subject.id !== self.id;
  const hasOther = view.tariffs.some((tariff) => tariff.sparte === "SONSTIGES");
  const reviewCount = view.tariffs.filter((tariff) => tariff.admin?.needsReview && tariff.admin.active).length;
  const inactiveCount = view.tariffs.filter((tariff) => tariff.admin && !tariff.admin.active).length;

  const { rows, outside } = useMemo(() => {
    const term = searchable(query.trim());
    const list: Shown[] = [];
    let missing = 0;
    for (const tariff of view.tariffs) {
      if (tariff.admin && !tariff.admin.active && !showInactive) continue;
      if (review && !tariff.admin?.needsReview) continue;
      if (sparte !== "ALLE" && tariff.sparte !== sparte) continue;
      if (business !== "ALLE" && tariff.segment !== business) continue;
      if (term && !searchable(`${tariff.provider} ${tariff.name}`).includes(term)) continue;
      const hasExtra = tariff.bonuses.length > 0 || tariff.bands.some((band) => band.promo > 0);
      if (extrasOnly && !hasExtra) continue;
      const entry = shown(tariff, kwh);
      if (!entry) {
        missing += 1;
        continue;
      }
      list.push(entry);
    }
    if (byAmount) list.sort((a, b) => b.value - a.value || a.tariff.name.localeCompare(b.tariff.name, "de"));
    return { rows: list, outside: missing };
  }, [view.tariffs, query, sparte, business, extrasOnly, kwh, byAmount, review, showInactive]);

  const groups = useMemo(() => {
    if (byAmount) return [{ provider: "", rows }];
    const map = new Map<string, Shown[]>();
    for (const row of rows) {
      const list = map.get(row.tariff.provider) ?? [];
      list.push(row);
      map.set(row.tariff.provider, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([provider, list]) => ({ provider, rows: list }));
  }, [rows, byAmount]);

  const open = openId !== null ? view.tariffs.find((tariff) => tariff.id === openId) ?? null : null;
  // Boni fuer alle Tarife stehen einmal oben - an jeder Zeile waeren sie nur Rauschen.
  const general = useMemo(() => {
    const seen = new Map<number, ViewTariff["bonuses"][number]>();
    for (const tariff of view.tariffs) for (const bonus of tariff.bonuses) if (bonus.everywhere) seen.set(bonus.id, bonus);
    return [...seen.values()];
  }, [view.tariffs]);

  const subtitle = [
    view.subject === null ? "Standardliste" : viewingOther ? `Liste von ${subjectName}` : null,
    view.stand?.validFrom ? `Stand ${shortDay(view.stand.validFrom, true)}` : null,
    view.stand?.promoUntil && view.stand.promoActive ? `Aktion bis ${shortDay(view.stand.promoUntil)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const viewOptions = [
    ...(view.admin ? [{ value: "", label: "Standardliste" }] : []),
    ...(self.ownList ? [{ value: String(self.id), label: "Meine Liste" }] : []),
    ...people.map((person) => ({ value: String(person.id), label: person.name })),
  ];
  const currentOption = view.subject === null ? "" : String(view.subject.id);

  return (
    <div className="page-narrow">
      <PageHeader
        title="Provisionen"
        subtitle={subtitle || undefined}
        back={{ href: "/profil", label: "Profil", mobileOnly: true }}
        actions={
          view.admin && (
            <Link href="/einstellungen/provisionen" className="btn btn-plain btn-sm">
              <IconCog className="h-4 w-4" />
              Regeln
            </Link>
          )
        }
      >
        {showStructure && (
          <SegmentedLinks
            ariaLabel="Provisionen"
            current="liste"
            options={[
              { key: "liste", label: "Liste", href: "/provisionen" },
              { key: "struktur", label: view.admin ? "Personen" : "Meine Leute", href: "/provisionen/struktur" },
            ]}
          />
        )}
      </PageHeader>

      {viewOptions.length > 1 && (
        <div className="mb-4 flex items-center gap-3">
          <label htmlFor="commission-subject" className="shrink-0 text-subhead text-muted">
            Ansicht
          </label>
          <select
            id="commission-subject"
            className="field min-h-11 py-2 text-subhead"
            value={currentOption}
            onChange={(event) => {
              const value = event.target.value;
              router.push(value ? `/provisionen?person=${value}` : "/provisionen", { scroll: false });
            }}
          >
            {viewOptions.map((option) => (
              <option key={option.value || "standard"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!view.stand ? (
        <EmptyState
          boxed
          icon={<IconEuro className="h-6 w-6" />}
          title="Noch keine Provisionsliste"
          text={
            view.admin
              ? "Lade die Liste aus dem Portal hoch – danach siehst du hier, was jeder Tarif bringt."
              : "Sobald die Geschäftsführung die Liste hochlädt, steht hier, welcher Tarif dir wie viel bringt."
          }
          action={
            view.admin && (
              <Link href="/einstellungen/provisionen?import=1" className="btn btn-primary">
                Liste importieren
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {!view.configured &&
              (view.admin ? (
                <Notice icon={<IconCog className="h-5 w-5" />}>
                  Noch kein Standardsatz – der Vertrieb sieht noch keine Beträge.{" "}
                  <Link href="/einstellungen/provisionen" className="link">
                    Jetzt festlegen
                  </Link>
                </Notice>
              ) : (
                <Notice icon={<IconEuro className="h-5 w-5" />}>Die Beträge gibt die Geschäftsführung bald frei.</Notice>
              ))}
            {view.combo.map((bonus) => (
              <Notice key={bonus.id} icon={<IconSparkles className="h-5 w-5" />}>
                <strong>Kombi-Bonus +{money(bonus.amount)}</strong> für Strom und Gas beim selben Kunden
                {bonus.until ? ` · bis ${shortDay(bonus.until)}` : ""}
              </Notice>
            ))}
            {general.map((bonus) => (
              <Notice key={bonus.id} icon={<IconSparkles className="h-5 w-5" />}>
                <strong>
                  {bonus.label || (bonus.personal ? "Persönlicher Bonus" : "Bonus")} +{money(bonus.amount)}
                </strong>{" "}
                je Vertrag{bonus.personal && !viewingOther ? ", nur für dich" : ""}
                {bonus.until ? ` · bis ${shortDay(bonus.until)}` : ""}
              </Notice>
            ))}

            <Segmented
              ariaLabel="Sparte"
              value={sparte}
              onChange={setSparte}
              options={[
                { value: "ALLE", label: "Alle" },
                { value: "STROM", label: "Strom" },
                { value: "GAS", label: "Gas" },
                ...(hasOther ? [{ value: "SONSTIGES" as const, label: "Sonstige" }] : []),
              ]}
            />

            <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-2">
              <label className="relative block">
                <span className="sr-only">Jahresverbrauch des Kunden in kWh</span>
                <input
                  className="field pr-12 tabular-nums"
                  inputMode="numeric"
                  enterKeyHint="done"
                  autoComplete="off"
                  placeholder="Verbrauch"
                  value={kwhText}
                  onChange={(event) => setKwhText(event.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-subhead text-muted">kWh</span>
              </label>
              <label className="relative block">
                <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  className="field field-search pl-12"
                  placeholder="Suchen"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Tarif oder Anbieter suchen"
                  enterKeyHint="search"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="chips -mx-4 px-4" role="group" aria-label="Filter">
              <button type="button" className="chip" aria-pressed={business === "PRIVAT"} onClick={() => setBusiness(business === "PRIVAT" ? "ALLE" : "PRIVAT")}>
                Privat
              </button>
              <button type="button" className="chip" aria-pressed={business === "GEWERBE"} onClick={() => setBusiness(business === "GEWERBE" ? "ALLE" : "GEWERBE")}>
                Gewerbe
              </button>
              <button type="button" className="chip" aria-pressed={extrasOnly} onClick={() => setExtrasOnly((on) => !on)}>
                Aktion & Bonus
              </button>
              <button type="button" className="chip" aria-pressed={byAmount} onClick={() => setByAmount((on) => !on)}>
                Höchste zuerst
              </button>
              {view.admin && reviewCount > 0 && (
                <button type="button" className="chip" aria-pressed={review} onClick={() => setReview((on) => !on)}>
                  Prüfen · {reviewCount}
                </button>
              )}
              {view.admin && inactiveCount > 0 && (
                <button type="button" className="chip" aria-pressed={showInactive} onClick={() => setShowInactive((on) => !on)}>
                  Entfallene · {inactiveCount}
                </button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                boxed
                icon={<IconSearch className="h-6 w-6" />}
                title={kwh !== null && outside > 0 ? `Kein Tarif für ${kwh.toLocaleString("de-DE")} kWh` : "Kein Tarif passt"}
                text={kwh !== null && outside > 0 ? `${plural(outside, "Tarif gilt", "Tarife gelten")} nur für andere Verbräuche.` : undefined}
              />
            </div>
          ) : (
            <div className="mt-2 space-y-6">
              {groups.map((group) => (
                <section key={group.provider || "alle"}>
                  {group.provider && <ListLabel>{group.provider}</ListLabel>}
                  <ul className="list">
                    {group.rows.map((row) => (
                      <li key={row.tariff.id}>
                        <TariffRow
                          row={row}
                          kwh={kwh}
                          view={view}
                          showProvider={byAmount}
                          showSparte={sparte === "ALLE"}
                          onOpen={() => setOpenId(row.tariff.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <p className="list-footer">
            {[
              plural(rows.length, "Tarif", "Tarife"),
              kwh !== null && outside > 0 ? `${outside} gelten nicht für ${kwh.toLocaleString("de-DE")} kWh` : null,
              view.admin ? null : "Beträge je Vertrag, ohne Gewähr bis zur Freigabe",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      )}

      {open && <TariffSheet tariff={open} view={view} kwh={kwh} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function TariffRow({
  row,
  kwh,
  view,
  showProvider,
  showSparte,
  onOpen,
}: {
  row: Shown;
  kwh: number | null;
  view: CommissionView;
  showProvider: boolean;
  showSparte: boolean;
  onOpen: () => void;
}) {
  const { tariff, band } = row;
  const promo = band ? band.promo : Math.max(0, ...tariff.bands.map((b) => b.promo));
  const bonus = tariff.bonuses.reduce((sum, item) => sum + item.amount, 0);
  // An der Zeile nur Boni fuer bestimmte Tarife - die fuer alle stehen oben.
  const special = tariff.bonuses.filter((item) => !item.everywhere).reduce((sum, item) => sum + item.amount, 0);
  const follow = band ? band.follow : 0;
  const details = [
    showProvider ? tariff.provider : null,
    showSparte ? SPARTE_LABEL[tariff.sparte] : null,
    tariff.segment === "GEWERBE" ? "Gewerbe" : null,
    kwh === null ? (tariff.bands.length > 1 ? `${tariff.bands.length} Staffeln` : tariff.bands[0] ? kwhRange(tariff.bands[0].from, tariff.bands[0].to) : null) : null,
    follow > 0 ? `+${money(follow)} später` : null,
    tariff.timing === "bei Lieferbeginn" ? "Auszahlung bei Lieferbeginn" : null,
    view.manager && band?.keep !== undefined ? `für dich ${money(band.keep)}` : null,
    view.admin && band?.admin && band.cost ? `Admin ${money(band.admin.now)} · bleibt ${money(band.admin.now - band.cost.now - bonus)}` : null,
  ].filter(Boolean);

  return (
    <Cell
      onClick={onOpen}
      title={tariff.name}
      subtitle={details.join(" · ") || undefined}
      wrap
      trailing={
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-headline tabular-nums ${row.value > 0 ? "" : "text-muted"}`}>{row.text}</span>
          <span className="flex gap-1">
            {tariff.admin?.needsReview && tariff.admin.active && <Pill tone="warn">Prüfen</Pill>}
            {tariff.admin?.hidden && <Pill>Ausgeblendet</Pill>}
            {tariff.admin && !tariff.admin.active && <Pill>Entfallen</Pill>}
            {promo > 0 && <Pill tone="accent">Aktion</Pill>}
            {special > 0 && <Pill tone="accent">+{money(special)}</Pill>}
          </span>
        </span>
      }
      chevron
    />
  );
}
