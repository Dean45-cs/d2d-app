"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentRow, OrderRow } from "@/lib/queries";
import type { OrderStatus } from "@/lib/types";
import { StatTile } from "@/components/ui";
import { routeUrl } from "@/lib/map";
import { slotLabel, slotOverdue } from "@/lib/appointments";
import {
  energyLabel,
  nextStatus,
  orderAddress,
  orderLost,
  orderOpen,
  ORDER_STATUS_HINT,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_SHORT,
  withdrawalDaysLeft,
  withdrawalLabel,
} from "@/lib/orders";

/**
 * Aufträge und Termine - alles, was nach der Tür noch zu tun ist.
 *
 * Die Reihenfolge ist Absicht: erst die Termine (die verfallen), dann die
 * Aufträge (die noch durch die Nachbearbeitung müssen).
 */
export function OrderList({
  orders,
  appointments,
  stats,
  missingOrders,
  isLeader,
}: {
  orders: OrderRow[];
  appointments: AppointmentRow[];
  stats: { orders: number; open: number; waiting_call: number; confirmed: number; lost: number };
  /** Abschlüsse ohne erfasste Auftragsdaten. */
  missingOrders: number;
  isLeader: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  /* Erst nach dem Einblenden: "noch 12 Tage" hängt an der Uhr des Geräts. */
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  async function setStatus(order: OrderRow, status: OrderStatus) {
    setBusy(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, statusNote: note.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Konnte nicht gespeichert werden.");
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(null);
    }
  }

  async function setAppointmentDone(id: number, done: boolean) {
    setBusy(id);
    try {
      await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done }),
      });
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(null);
    }
  }

  const openAppointments = appointments.filter((a) => !a.follow_up_done_at);
  const doneAppointments = appointments.filter((a) => a.follow_up_done_at);

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Aufträge (30 Tage)" value={stats.orders ?? 0} />
        <StatTile
          label="Wartet auf Anruf"
          value={stats.waiting_call ?? 0}
          tone="warn"
          hint="Bestätigungsanruf offen"
        />
        <StatTile label="Bestätigt" value={stats.confirmed ?? 0} tone="success" />
        <StatTile
          label="Storno / Widerruf"
          value={stats.lost ?? 0}
          tone="danger"
          hint={`${stats.open ?? 0} noch in Arbeit`}
        />
      </div>

      {error && (
        <p className="mb-3 text-sm font-medium text-signal-600" role="alert">
          {error}
        </p>
      )}

      {missingOrders > 0 && (
        <div
          className="mb-4 rounded-xl px-4 py-2.5 text-sm"
          style={{
            background: "color-mix(in srgb, var(--gas-500) 14%, transparent)",
            color: "var(--gas-600)",
          }}
        >
          {missingOrders === 1
            ? "1 Abschluss wurde ohne Auftragsdaten gezählt."
            : `${missingOrders} Abschlüsse wurden ohne Auftragsdaten gezählt.`}{" "}
          Ohne Kundendaten und Unterschrift lässt sich daraus kein Vertrag machen.
        </div>
      )}

      {/* ------------------------------- Termine ------------------------------ */}
      <section className="card mb-5 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Termine ({openAppointments.length})</h2>
          {doneAppointments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="muted shrink-0 text-xs font-semibold underline"
            >
              {showDone ? "erledigte ausblenden" : `${doneAppointments.length} erledigt`}
            </button>
          )}
        </div>

        {openAppointments.length === 0 ? (
          <p className="muted text-sm">
            Kein offener Termin. Termine entstehen an der Tür über „Termin vereinbart“.
          </p>
        ) : (
          <ul className="space-y-2">
            {openAppointments.map((item) => {
              const late = slotOverdue(item.follow_up_at, now ?? undefined);
              return (
                <li
                  key={item.id}
                  className="rounded-xl border p-2.5 hairline"
                  style={late ? { borderColor: "var(--signal-400)" } : undefined}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums"
                      style={{
                        background: late
                          ? "color-mix(in srgb, var(--signal-500) 15%, transparent)"
                          : "color-mix(in srgb, var(--brand-500) 14%, transparent)",
                        color: late ? "var(--signal-600)" : "var(--brand-600)",
                      }}
                    >
                      {now ? slotLabel(item.follow_up_at, now) : item.follow_up_at}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.contact_name || "Ohne Namen"}
                        <span className="muted font-normal">
                          {" · "}
                          {item.street_name ?? ""} {item.house_number}
                          {item.doorbell_label ? ` · ${item.doorbell_label}` : ""}
                        </span>
                      </p>
                      <p className="muted truncate text-xs">
                        {item.user_name}
                        {item.reason_note ? ` · ${item.reason_note}` : ""}
                      </p>
                    </div>
                  </div>
                  {/* Eigene Zeile: auf dem Handy quetschen Knöpfe sonst den Namen weg. */}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {item.contact_phone && (
                      <a
                        href={`tel:${item.contact_phone.replace(/[^+\d]/g, "")}`}
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hairline"
                      >
                        📞 anrufen
                      </a>
                    )}
                    {item.lat !== null && item.lng !== null && (
                      <a
                        href={routeUrl(item.lat, item.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold hairline"
                      >
                        ➤ Route
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void setAppointmentDone(item.id, true)}
                      className="btn btn-ghost px-3 py-1.5 text-xs"
                    >
                      erledigt
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showDone && doneAppointments.length > 0 && (
          <ul className="mt-3 space-y-1 border-t pt-3 hairline">
            {doneAppointments.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="muted w-24 shrink-0 text-xs tabular-nums">
                  {now ? slotLabel(item.follow_up_at, now) : item.follow_up_at}
                </span>
                <span className="muted min-w-0 flex-1 truncate line-through">
                  {item.contact_name || "Ohne Namen"} · {item.street_name ?? ""}{" "}
                  {item.house_number}
                </span>
                <button
                  type="button"
                  onClick={() => void setAppointmentDone(item.id, false)}
                  className="muted shrink-0 text-xs underline"
                >
                  wieder öffnen
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------ Aufträge ------------------------------ */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-semibold">Aufträge ({orders.length})</h2>

        {orders.length === 0 ? (
          <p className="muted text-sm">
            Noch kein Auftrag erfasst. An der Tür entsteht er über „Abschluss – Auftrag
            aufnehmen“.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => {
              const expanded = open === order.id;
              const days = now ? withdrawalDaysLeft(order.created_at, now) : null;
              const step = nextStatus(order.status);
              return (
                <li key={order.id} className="rounded-xl border p-3 hairline">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : order.id)}
                    className="flex w-full items-start gap-2 text-left"
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{order.customer_name}</p>
                      <p className="muted truncate text-xs">{orderAddress(order)}</p>
                      <p className="muted truncate text-xs">
                        {energyLabel(order.energy_type)} · {order.user_name} ·{" "}
                        {formatDate(order.created_at)}
                        {order.signature ? " · ✍️" : " · ohne Unterschrift"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className="badge"
                        style={statusStyle(order.status)}
                        title={ORDER_STATUS_HINT[order.status]}
                      >
                        {ORDER_STATUS_SHORT[order.status]}
                      </span>
                      {days !== null && orderOpen(order.status) && (
                        <p
                          className="mt-1 text-[11px] font-semibold tabular-nums"
                          style={{ color: days > 0 ? "var(--ink-muted)" : "var(--energy-700)" }}
                        >
                          {days > 0 ? `Widerruf: ${days} T.` : "Frist vorbei"}
                        </p>
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="mt-3 border-t pt-3 text-sm hairline">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <Field label="Telefon" value={order.customer_phone} />
                        <Field label="E-Mail" value={order.customer_email} />
                        <Field label="Tarif" value={order.tariff} />
                        <Field label="Bisheriger Anbieter" value={order.previous_provider} />
                        <Field
                          label="Verbrauch Strom"
                          value={order.usage_strom ? `${order.usage_strom} kWh` : ""}
                        />
                        <Field
                          label="Verbrauch Gas"
                          value={order.usage_gas ? `${order.usage_gas} kWh` : ""}
                        />
                        <Field label="Zähler Strom" value={order.meter_strom} />
                        <Field label="Zähler Gas" value={order.meter_gas} />
                        <Field label="Lieferbeginn" value={order.start_date ?? ""} />
                        <Field label="Notiz" value={order.note} />
                      </dl>

                      {now && (
                        <p className="muted mt-3 text-xs">{withdrawalLabel(order.created_at, now)}</p>
                      )}
                      <p className="muted mt-1 text-xs">
                        {order.withdrawal_given
                          ? "✓ Widerrufsbelehrung ausgehändigt"
                          : "⚠ Widerrufsbelehrung nicht bestätigt"}
                        {" · "}
                        {order.privacy_given
                          ? "✓ Datenschutzhinweis übergeben"
                          : "⚠ Datenschutzhinweis nicht bestätigt"}
                      </p>

                      {order.signature && (
                        <div className="mt-2">
                          <p className="muted text-[11px]">
                            Unterschrift vom {formatDate(order.signed_at ?? order.created_at)}
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={order.signature}
                            alt={`Unterschrift von ${order.customer_name}`}
                            className="mt-1 h-24 w-full rounded-lg border bg-white object-contain"
                            style={{ borderColor: "var(--line)" }}
                          />
                        </div>
                      )}

                      {order.status_at && (
                        <p className="muted mt-2 text-xs">
                          {ORDER_STATUS_LABEL[order.status]} ·{" "}
                          {order.status_by_name ?? "System"} · {formatDate(order.status_at)}
                          {order.status_note ? ` · ${order.status_note}` : ""}
                        </p>
                      )}

                      {isLeader && !orderLost(order.status) && (
                        <div className="mt-3">
                          <input
                            className="input mb-2 text-sm"
                            placeholder="Notiz zum Schritt (optional)"
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 300))}
                          />
                          <div className="flex flex-wrap gap-2">
                            {step && (
                              <button
                                type="button"
                                disabled={busy === order.id}
                                onClick={() => void setStatus(order, step)}
                                className="btn btn-primary px-3 py-2 text-sm"
                              >
                                {ORDER_STATUS_LABEL[step]}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy === order.id}
                              onClick={() => void setStatus(order, "WIDERRUFEN")}
                              className="btn btn-ghost px-3 py-2 text-sm"
                            >
                              Widerrufen
                            </button>
                            <button
                              type="button"
                              disabled={busy === order.id}
                              onClick={() => void setStatus(order, "STORNIERT")}
                              className="btn btn-ghost px-3 py-2 text-sm"
                            >
                              Storniert
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </>
  );
}

function statusStyle(status: OrderStatus): { background: string; color: string } {
  if (status === "BESTAETIGT") {
    return {
      background: "color-mix(in srgb, var(--energy-500) 18%, transparent)",
      color: "var(--energy-700)",
    };
  }
  if (status === "STORNIERT" || status === "WIDERRUFEN") {
    return {
      background: "color-mix(in srgb, var(--signal-500) 15%, transparent)",
      color: "var(--signal-600)",
    };
  }
  if (status === "ERFASST") {
    return {
      background: "color-mix(in srgb, var(--gas-500) 18%, transparent)",
      color: "var(--gas-600)",
    };
  }
  return {
    background: "color-mix(in srgb, var(--brand-500) 15%, transparent)",
    color: "var(--brand-600)",
  };
}

/** "20.09., 18:42" - die Datenbank liefert UTC. */
function formatDate(value: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
