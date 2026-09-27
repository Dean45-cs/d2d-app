"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconEye, IconEyeOff } from "@/components/icons";
import { Note } from "@/components/ui";

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
      setError("Keine Verbindung zum Server. Bitte prüfe deinen Empfang.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          className="input"
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
      </div>
      <div>
        <label className="label" htmlFor="password">
          Passwort
        </label>
        <div className="relative">
          <input
            id="password"
            className="input pr-12"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="icon-btn absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Passwort verbergen" : "Passwort anzeigen"}
            aria-pressed={reveal}
          >
            {reveal ? <IconEyeOff className="h-[18px] w-[18px]" /> : <IconEye className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert">
          <Note tone="danger">{error}</Note>
        </div>
      )}

      <button className="btn btn-primary btn-lg w-full" disabled={busy}>
        {busy && <Spinner />}
        {busy ? "Anmelden …" : "Anmelden"}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
