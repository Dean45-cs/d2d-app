"use client";

import { useRef, useState } from "react";
import { fileToAvatar } from "@/lib/avatar";
import { Sheet } from "@/components/Sheet";
import { Avatar, InlineError, ListLabel, Segmented } from "@/components/ui";
import { ROLE_LABEL } from "./types";

type Form = { name: string; email: string; phone: string; password: string; role: "MEMBER" | "LEADER"; avatar: string };

/** Konto direkt anlegen - die Person meldet sich mit E-Mail und Startpasswort an. */
export function CreateMemberSheet({
  canSetRole,
  onClose,
  onCreated,
}: {
  canSetRole: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ name: "", email: "", phone: "", password: "", role: "MEMBER", avatar: "" });

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setPicking(true);
    setError(null);
    try {
      update("avatar", await fileToAvatar(file));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Bild nicht lesbar.");
    } finally {
      setPicking(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (form.password.length < 8) {
      setError("Das Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Mitglied nicht angelegt.");
        return;
      }
      onCreated(form.name);
    } catch {
      setError("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Mitglied anlegen"
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="submit" form="create-member" className="btn btn-primary btn-lg btn-block" disabled={busy || picking}>
            {busy ? "Anlegen …" : "Anlegen"}
          </button>
        </div>
      }
    >
      <form id="create-member" onSubmit={submit}>
        <div className="flex flex-col items-center gap-3 pb-2">
          <Avatar name={form.name || null} src={form.avatar} size={80} loading={picking} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              {form.avatar ? "Bild ändern" : "Bild wählen"}
            </button>
            {form.avatar && (
              <button type="button" className="btn btn-plain btn-sm" onClick={() => update("avatar", "")}>
                Entfernen
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>

        <ListLabel>Konto</ListLabel>
        <div className="list">
          <Row label="Name">
            <input
              className="field field-bare min-w-0 flex-1"
              autoComplete="off"
              maxLength={120}
              placeholder="Vor- und Nachname"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </Row>
          <Row label="E-Mail">
            <input
              className="field field-bare min-w-0 flex-1"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={190}
              placeholder="Für die Anmeldung"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
          </Row>
          <Row label="Telefon">
            <input
              className="field field-bare min-w-0 flex-1"
              type="tel"
              maxLength={40}
              placeholder="Optional"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Row>
          <Row label="Passwort">
            <input
              className="field field-bare min-w-0 flex-1"
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              minLength={8}
              placeholder="Mind. 8 Zeichen"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              required
            />
          </Row>
        </div>

        {canSetRole && (
          <>
            <ListLabel>Rolle</ListLabel>
            <Segmented
              ariaLabel="Rolle"
              value={form.role}
              onChange={(role) => update("role", role)}
              options={[
                { value: "MEMBER", label: ROLE_LABEL.MEMBER },
                { value: "LEADER", label: ROLE_LABEL.LEADER },
              ]}
            />
          </>
        )}
      </form>
    </Sheet>
  );
}

/** Eine Eingabezeile der Liste: Beschriftung links, Feld rechts. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="cell">
      <span className="w-24 shrink-0 text-body">{label}</span>
      {children}
    </label>
  );
}
