"use client";

import { useState } from "react";
import { Note } from "@/components/ui";

export function JoinForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/join/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registrierung fehlgeschlagen.");
      setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Keine Verbindung. Bitte erneut versuchen."); }
    finally { setBusy(false); }
  }

  if (done) return <div role="status"><Note tone="success">Deine Anfrage wurde gesendet. Sobald dein Beitritt freigegeben wurde, kannst du dich mit deiner E-Mail und deinem Passwort anmelden. Frage bei der einladenden Person nach dem Status.</Note></div>;
  return <form onSubmit={submit} className="space-y-4">
    <div><label className="label" htmlFor="join-name">Name</label><input className="input" id="join-name" name="name" autoComplete="name" maxLength={120} required /></div>
    <div><label className="label" htmlFor="join-email">E-Mail</label><input className="input" id="join-email" name="email" type="email" autoComplete="email" maxLength={190} required /></div>
    <div><label className="label" htmlFor="join-phone">Telefon (optional)</label><input className="input" id="join-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} /></div>
    <div><label className="label" htmlFor="join-password">Passwort</label><input className="input" id="join-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /><p className="muted mt-1 text-xs">Mindestens 8 Zeichen.</p></div>
    {error && <div role="alert"><Note tone="danger">{error}</Note></div>}
    <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Wird gesendet …" : "Beitritt anfragen"}</button>
    <p className="muted text-xs">Dein Zugang wird erst nach der Freigabe aktiviert.</p>
  </form>;
}
