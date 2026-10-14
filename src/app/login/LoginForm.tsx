"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";
import { InlineError } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Anmeldung fehlgeschlagen.");
        setBusy(false);
        return;
      }
      // Bis die naechste Seite steht, bleibt der Knopf im Ladezustand.
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Keine Verbindung. Bitte Empfang prüfen.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="list">
        <label className="cell">
          <span className="w-24 shrink-0 text-body">E-Mail</span>
          <input
            id="email"
            className="field field-bare min-w-0 flex-1"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@firma.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="cell pr-1">
          <span className="w-24 shrink-0 text-body">Passwort</span>
          <input
            id="password"
            className="field field-bare min-w-0 flex-1"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Erforderlich"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Passwort verbergen" : "Passwort anzeigen"}
            aria-pressed={reveal}
          >
            {reveal ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
          </button>
        </label>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy && <span className="spin h-4 w-4 rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
        {busy ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  );
}
