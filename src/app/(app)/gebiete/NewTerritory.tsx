"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus } from "@/components/icons";
import type { User } from "@/lib/types";

export function NewTerritoryButton({ members }: { members: User[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    city: "",
    postalCode: "",
    assignedUserId: "",
    streets: "",
    note: "",
    dueDate: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/territories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          assignedUserId: form.assignedUserId ? Number(form.assignedUserId) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Gebiet konnte nicht angelegt werden.");
        return;
      }
      setOpen(false);
      setForm({ name: "", city: "", postalCode: "", assignedUserId: "", streets: "", note: "", dueDate: "" });
      router.push(`/gebiete/${data.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPlus className="h-4 w-4" />
        Neues Gebiet
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end bg-black/45 md:items-center md:justify-center"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] p-5 pb-8 md:max-w-xl md:rounded-3xl"
          >
            <h2 className="mb-4 text-lg font-bold">Neues Gebiet anlegen</h2>

            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="t-name">Gebietsname</label>
                <input
                  id="t-name"
                  className="input"
                  placeholder="z. B. Innenstadt Nord – KW 38"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label" htmlFor="t-plz">PLZ</label>
                  <input
                    id="t-plz"
                    className="input"
                    inputMode="numeric"
                    value={form.postalCode}
                    onChange={(e) => update("postalCode", e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label" htmlFor="t-city">Ort</label>
                  <input
                    id="t-city"
                    className="input"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="t-user">Zuteilen an</label>
                  <select
                    id="t-user"
                    className="select"
                    value={form.assignedUserId}
                    onChange={(e) => update("assignedUserId", e.target.value)}
                  >
                    <option value="">– später zuteilen –</option>
                    {members
                      .filter((m) => m.active)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="t-due">Bis wann</label>
                  <input
                    id="t-due"
                    className="input"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => update("dueDate", e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="t-streets">
                  Straßen – eine pro Zeile
                </label>
                <textarea
                  id="t-streets"
                  className="textarea font-mono text-sm"
                  rows={7}
                  placeholder={
                    "Bahnhofstraße 1-45; 30 WE\nGartenweg\nLindenallee 2-18"
                  }
                  value={form.streets}
                  onChange={(e) => update("streets", e.target.value)}
                />
                <p className="muted mt-1 text-xs">
                  Hausnummern und Wohneinheiten sind optional:
                  <code className="mx-1 rounded bg-black/5 px-1">Straße 1-45; 30 WE</code>
                </p>
              </div>

              <div>
                <label className="label" htmlFor="t-note">Notiz fürs Team</label>
                <input
                  id="t-note"
                  className="input"
                  placeholder="z. B. Mehrfamilienhäuser, ab 16 Uhr klingeln"
                  value={form.note}
                  onChange={(e) => update("note", e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-signal-500/10 px-3 py-2 text-sm font-medium text-signal-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy ? "Anlegen …" : "Gebiet anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
