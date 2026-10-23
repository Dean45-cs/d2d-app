"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Cell, InlineError, ToneTile } from "@/components/ui";
import { IconEye, IconEyeOff, IconKey } from "@/components/icons";
import { fetchWithTimeout } from "@/lib/offline-queue";
import { syncPush } from "@/lib/push-client";

const MIN_LENGTH = 8;

/** "Passwort ändern" im Profil - das Startpasswort der Leitung durch ein eigenes ersetzen. */
export function PasswordCell() {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <Cell
        onClick={() => setOpen(true)}
        chevron
        icon={
          <ToneTile tone="slate">
            <IconKey className="h-4 w-4" />
          </ToneTile>
        }
        title="Passwort ändern"
      />
      {open && <PasswordSheet onClose={() => setOpen(false)} />}
    </li>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next.length < MIN_LENGTH) {
      setError(`Das neue Passwort braucht mindestens ${MIN_LENGTH} Zeichen.`);
      return;
    }
    if (next !== repeat) {
      setError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/auth/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Das Passwort ließ sich nicht ändern.");
        setBusy(false);
        return;
      }
    } catch {
      setError("Keine Verbindung. Bitte Empfang prüfen.");
      setBusy(false);
      return;
    }
    // Der Server hat alle Push-Anmeldungen des Kontos geloescht - dieses Geraet gleich wieder anmelden.
    void syncPush().catch(() => undefined);
    toast("Passwort geändert – andere Geräte sind abgemeldet");
    onClose();
  }

  const type = reveal ? "text" : "password";
  return (
    <Sheet
      title="Passwort ändern"
      subtitle="Danach bist du auf allen anderen Geräten abgemeldet."
      onClose={onClose}
      footer={
        <div className="space-y-3">
          {error && <InlineError>{error}</InlineError>}
          <button type="submit" form="own-password" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? "Speichern …" : "Passwort ändern"}
          </button>
        </div>
      }
    >
      <form id="own-password" onSubmit={submit}>
        <div className="list">
          <label className="cell pr-1">
            <span className="w-28 shrink-0 text-body">Bisher</span>
            <input
              className="field field-bare min-w-0 flex-1"
              type={type}
              autoComplete="current-password"
              placeholder="Erforderlich"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoFocus
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Passwörter verbergen" : "Passwörter anzeigen"}
              aria-pressed={reveal}
            >
              {reveal ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
            </button>
          </label>
          <label className="cell">
            <span className="w-28 shrink-0 text-body">Neu</span>
            <input
              className="field field-bare min-w-0 flex-1"
              type={type}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              placeholder={`Mind. ${MIN_LENGTH} Zeichen`}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </label>
          <label className="cell">
            <span className="w-28 shrink-0 text-body">Wiederholen</span>
            <input
              className="field field-bare min-w-0 flex-1"
              type={type}
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              placeholder="Neues Passwort"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              required
            />
          </label>
        </div>
      </form>
    </Sheet>
  );
}
