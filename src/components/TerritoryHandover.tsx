import type { HandoverSummary } from "@/lib/territory-handover";

export function TerritoryHandover({ summary }: { summary: HandoverSummary }) {
  return <section className="card mb-4 p-5" aria-label="Gebietsübergabe">
    <h2 className="text-[16px] font-semibold">Gebietsübergabe · Arbeitsstand</h2>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[["Offene Türen", summary.openDoors], ["Davon erneut offen", summary.retryDoors],
        ["Gesperrte Türen", summary.blockedDoors], ["Versuche bisher", summary.attempts]].map(([label, value]) =>
        <div key={label}><p className="muted text-[12px]">{label}</p><p className="text-[22px] font-semibold">{value}</p></div>)}
    </div>
    <p className="muted mt-2 text-[12px]">Die Türzahlen beziehen sich auf hinterlegte Häuser und Klingeln.</p>
    {summary.unknownBuildings > 0 && <p className="muted mt-1 text-[12px]">Bei {summary.unknownBuildings} Mehrfamilienhäusern fehlen noch die Klingelschilder.</p>}
    {summary.notes && <p className="mt-3 whitespace-pre-wrap text-[14px]"><strong>Teamnotiz: </strong>{summary.notes}</p>}
    {summary.details.length > 0 && <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer font-semibold">Bisherige Versuche und Sperren · {summary.details.length}</summary>
      <ul className="mt-2 space-y-2">{summary.details.map((door, index) => <li key={index}>
        <strong>{door.label}</strong> · {door.state === "BLOCKED" ? "Gesperrt – nicht klingeln" : `${door.attempts} erfolglose Versuche`}
        {door.note && <span className="muted"> · {door.note}</span>}
      </li>)}</ul>
    </details>}
    <details className="mt-3 text-[13px]" open={summary.appointments.length > 0}>
      <summary className="cursor-pointer font-semibold">Offene Termine · {summary.appointments.length}</summary>
      <ul className="mt-2 space-y-2">{summary.appointments.map((item) => <li key={item.id}>
        <strong>{item.slot}</strong> · {item.address}<br /><span className="muted">Verantwortlich: {item.owner_name}</span>
      </li>)}</ul>
    </details>
    {summary.latest && <div className="mt-4 border-t pt-3 text-[13px]" style={{ borderColor: "var(--line)" }}>
      <p className="font-semibold">Letzte Übergabe: {summary.latest.from_name ?? "Unzugeteilt"} → {summary.latest.to_name ?? "Unzugeteilt"}</p>
      <p className="muted">{summary.latest.appointments_transferred} Termine übergeben</p>
      {summary.latest.note && <p className="mt-1 whitespace-pre-wrap">{summary.latest.note}</p>}
    </div>}
  </section>;
}
