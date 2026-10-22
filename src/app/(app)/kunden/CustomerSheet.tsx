"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerRow } from "@/lib/customers";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/useConfirm";
import { Cell, InlineError, Switch } from "@/components/ui";
import { IconNavigate, IconPhone } from "@/components/icons";
import { CONTRACT_TERMS, contractEnd, dayLabel, productLabel, telHref } from "@/lib/contracts";
import { routeUrl } from "@/lib/map";
import { sqlDay } from "@/lib/format";
import { fetchWithTimeout } from "@/lib/offline-queue";

/** "Hauptstraße 12 · Müller" - Strasse, Hausnummer und Klingel. */
export function customerAddress(row: Pick<CustomerRow, "street_name" | "house_number" | "doorbell_label">): string {
  return [`${row.street_name ?? ""} ${row.house_number}`.trim(), row.doorbell_label].filter(Boolean).join(" · ");
}

/**
 * Kunde eines Auftrags: oben Anruf und Route, darunter die Angaben aus dem
 * Buchungsportal. Das Vertragsende rechnet sich aus Lieferbeginn und
 * Laufzeit, bleibt aber von Hand aenderbar - das Portal hat das letzte Wort.
 */
export function CustomerSheet({ row, today, onClose }: { row: CustomerRow; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone);
  const [customerNumber, setCustomerNumber] = useState(row.customer_number);
  const [start, setStart] = useState(row.contract_start ?? "");
  const [months, setMonths] = useState(row.contract_months ? String(row.contract_months) : "");
  const [end, setEnd] = useState(row.contract_end ?? "");
  const [note, setNote] = useState(row.note);
  const [recontacted, setRecontacted] = useState(Boolean(row.recontacted_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = Boolean(row.name || row.phone || row.customer_number || row.contract_end || row.note);
  const changed =
    name.trim() !== row.name ||
    phone.trim() !== row.phone ||
    customerNumber.trim() !== row.customer_number ||
    start !== (row.contract_start ?? "") ||
    months !== (row.contract_months ? String(row.contract_months) : "") ||
    end !== (row.contract_end ?? "") ||
    note.trim() !== row.note ||
    recontacted !== Boolean(row.recontacted_at);
  const terms: number[] = [...CONTRACT_TERMS];
  if (row.contract_months && !terms.includes(row.contract_months)) terms.push(row.contract_months);

  /** Lieferbeginn oder Laufzeit geaendert: das Vertragsende geht mit. */
  function updateDates(nextStart: string, nextMonths: string) {
    setStart(nextStart);
    setMonths(nextMonths);
    const computed = contractEnd(nextStart, Number(nextMonths));
    if (computed) setEnd(computed);
  }

  async function send(method: "PATCH" | "DELETE", body?: object): Promise<string | null> {
    try {
      const response = await fetchWithTimeout(`/api/customers/${row.visit_id}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) return null;
      const data = await response.json().catch(() => ({}));
      return (data.error as string | undefined) ?? "Nicht gespeichert.";
    } catch {
      return "Keine Verbindung.";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    const failure = await send("PATCH", {
      name,
      phone,
      customerNumber,
      contractStart: start,
      contractMonths: months,
      contractEnd: end,
      note,
      // Nur wenn ausdruecklich umgeschaltet: ein neues Vertragsende beginnt die Wiedervorlage sonst von vorn.
      ...(recontacted !== Boolean(row.recontacted_at) ? { recontacted } : {}),
    });
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    toast(saved ? "Kunde gespeichert" : "Kunde zugeordnet");
    onClose();
    router.refresh();
  }

  async function remove() {
    const ok = await confirm({
      title: "Kundendaten entfernen?",
      text: "Name, Rufnummer und Vertragsdaten dieses Auftrags werden gelöscht. Der Abschluss selbst bleibt.",
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const failure = await send("DELETE");
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    toast("Kundendaten entfernt");
    onClose();
    router.refresh();
  }

  const computedEnd = contractEnd(start, Number(months));

  return (
    <Sheet
      title={row.name || "Kunde zuordnen"}
      subtitle={customerAddress(row)}
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button
            type="submit"
            form="customer-form"
            className="btn btn-primary btn-lg btn-block"
            disabled={busy || !changed}
          >
            {busy ? "Speichern …" : "Speichern"}
          </button>
        </div>
      }
    >
      {(row.phone || (row.lat !== null && row.lng !== null)) && (
        <ul className="list list-icons mb-6">
          {row.phone && (
            <li>
              <Cell
                href={telHref(row.phone)}
                external
                icon={<span className="glyph glyph-round"><IconPhone className="h-4 w-4" /></span>}
                title="Anrufen"
                subtitle={row.phone}
              />
            </li>
          )}
          {row.lat !== null && row.lng !== null && (
            <li>
              <Cell
                href={routeUrl(row.lat, row.lng)}
                external
                icon={<span className="glyph glyph-round"><IconNavigate className="h-4 w-4" /></span>}
                title="Route"
                subtitle={[row.postal_code, row.city].filter(Boolean).join(" ") || undefined}
              />
            </li>
          )}
        </ul>
      )}

      <ul className="list mb-6">
        <li>
          <Cell
            title="Abschluss"
            detail={[dayLabel(sqlDay(row.sold_at)), productLabel(row.energy_type)].filter(Boolean).join(" · ")}
          />
        </li>
        <li>
          <Cell title="Verkauft von" detail={row.user_name} />
        </li>
      </ul>

      <form id="customer-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
          <div>
            <label className="label" htmlFor="customer-name">
              Kunde
            </label>
            <input
              id="customer-name"
              className="field"
              autoComplete="off"
              placeholder="Vor- und Nachname"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="customer-phone">
              Telefon
            </label>
            <input
              id="customer-phone"
              className="field"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="0171 …"
              maxLength={40}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="customer-number">
            Kunden- oder Auftragsnummer
          </label>
          <input
            id="customer-number"
            className="field"
            autoComplete="off"
            placeholder="aus dem Buchungsportal, optional"
            maxLength={60}
            value={customerNumber}
            onChange={(e) => setCustomerNumber(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
          <div>
            <label className="label" htmlFor="contract-start">
              Lieferbeginn
            </label>
            <input
              id="contract-start"
              type="date"
              className="field"
              value={start}
              onChange={(e) => updateDates(e.target.value, months)}
            />
          </div>
          <div>
            <label className="label" htmlFor="contract-months">
              Laufzeit
            </label>
            <select
              id="contract-months"
              className="field"
              value={months}
              onChange={(e) => updateDates(start, e.target.value)}
            >
              <option value="">–</option>
              {terms.map((term) => (
                <option key={term} value={term}>
                  {term} {term === 1 ? "Monat" : "Monate"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="contract-end">
            Vertragsende{computedEnd && computedEnd === end ? " · aus Lieferbeginn und Laufzeit" : ""}
          </label>
          <input
            id="contract-end"
            type="date"
            className="field"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <p className="list-footer">Bei Strom und Gas das frühere Ende. Ab zwei Monaten vorher steht der Kunde unter „Fällig“.</p>
        </div>

        <div>
          <label className="label" htmlFor="customer-note">
            Notiz
          </label>
          <textarea
            id="customer-note"
            className="field"
            placeholder="Tarif, beste Zeit zum Anrufen …"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {end && (
          <ul className="list">
            <li>
              <Cell
                title="Umberaten"
                subtitle={
                  row.recontacted_at && recontacted
                    ? `Erledigt am ${dayLabel(sqlDay(row.recontacted_at))}`
                    : end >= today
                      ? undefined
                      : "Vertrag ist frei – anrufen oder vorbeigehen"
                }
                trailing={<Switch checked={recontacted} onChange={setRecontacted} label="Umberaten erledigt" />}
              />
            </li>
          </ul>
        )}
      </form>

      {saved && (
        <button type="button" className="btn btn-plain btn-block mt-6 text-danger" disabled={busy} onClick={() => void remove()}>
          Kundendaten entfernen
        </button>
      )}
      {dialog}
    </Sheet>
  );
}
