"use client";

import { useState } from "react";
import { IconCheck } from "@/components/icons";
import { InlineError } from "@/components/ui";

/** Beitritt anfragen - die Fuehrungskraft des Einladenden gibt ihn frei. */
export function JoinForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/join/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registrierung fehlgeschlagen.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Keine Verbindung. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col items-center surface px-6 py-12 text-center">
        <span className="glyph glyph-lg glyph-round glyph-result check-pop mb-4">
          <IconCheck className="h-6 w-6" />
        </span>
        <p className="text-headline">Anfrage gesendet</p>
        <p className="mt-1 max-w-sm text-subhead text-muted">Nach der Freigabe meldest du dich mit E-Mail und Passwort an.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="join-name">
          Name
        </label>
        <input className="field" id="join-name" name="name" autoComplete="name" maxLength={120} required />
      </div>
      <div>
        <label className="label" htmlFor="join-email">
          E-Mail
        </label>
        <input className="field" id="join-email" name="email" type="email" autoComplete="email" maxLength={190} required />
      </div>
      <div>
        <label className="label" htmlFor="join-phone">
          Telefon
        </label>
        <input
          className="field"
          id="join-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={40}
          placeholder="Optional"
        />
      </div>
      <div>
        <label className="label" htmlFor="join-password">
          Passwort
        </label>
        <input
          className="field"
          id="join-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          placeholder="Mind. 8 Zeichen"
          required
        />
      </div>
      {error && <InlineError>{error}</InlineError>}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy ? "Wird gesendet …" : "Beitritt anfragen"}
      </button>
    </form>
  );
}
