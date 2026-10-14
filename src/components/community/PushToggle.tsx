"use client";

import { useEffect, useState } from "react";
import { IconBell, IconX } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { Cell, Switch } from "@/components/ui";
import {
  disablePush,
  enablePush,
  pushState,
  syncPush,
  PUSH_HINT,
  type PushState,
} from "@/lib/push-client";

function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const show = useToast();

  useEffect(() => {
    let alive = true;
    void pushState()
      .then((next) => {
        if (alive) setState(next);
        if (next === "on") void syncPush();
      })
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      const next = on ? await enablePush() : await disablePush();
      setState(next);
      if (on && next !== "on") show(PUSH_HINT[next]);
      else show(on ? "Push ist an" : "Push ist aus");
    } catch (error) {
      show(error instanceof Error ? error.message : "Push ließ sich nicht einschalten");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      show(response.ok ? "Probe ist unterwegs" : (data.error ?? "Senden fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  }

  return { state, busy, toggle, test };
}

/**
 * Push-Nachrichten auf diesem Geraet als Zeilen einer Liste - fuer das
 * Profil: Schalter, und wenn an, eine Probe-Nachricht.
 */
export function PushRows() {
  const { state, busy, toggle, test } = usePush();
  if (state === null) return null;
  const available = state === "on" || state === "off";
  return (
    <>
      <li>
        <Cell
          icon={
            <span className="glyph">
              <IconBell className="h-4 w-4" />
            </span>
          }
          title="Push-Nachrichten"
          subtitle={available ? undefined : PUSH_HINT[state]}
          trailing={
            available ? (
              <Switch
                checked={state === "on"}
                onChange={(on) => void toggle(on)}
                label="Push-Nachrichten auf diesem Gerät"
                disabled={busy}
              />
            ) : undefined
          }
        />
      </li>
      {state === "on" && (
        <li>
          <Cell onClick={() => void test()} disabled={busy} title="Probe senden" tone="accent" className="pl-[60px]" />
        </li>
      )}
    </>
  );
}

/**
 * Leiser Hinweis oben im Feed - nur solange Push aus ist und sich
 * einschalten liesse. Einmal weggetippt, bleibt er weg.
 */
export function PushBanner() {
  const { state, busy, toggle } = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("d2d-push-banner") === "hidden");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("d2d-push-banner", "hidden");
    } catch {
      // Ohne Speicher erscheint der Hinweis eben wieder.
    }
  }

  if (state === null || dismissed || (state !== "off" && state !== "ios-install")) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface py-2 pl-4 pr-2">
      <span className="glyph">
        <IconBell className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 py-2">
        <span className="block text-subhead font-semibold">Abschlüsse als Push</span>
        {state === "ios-install" && <span className="block text-footnote text-muted">{PUSH_HINT[state]}</span>}
      </span>
      {state === "off" && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void toggle(true)} disabled={busy}>
          Einschalten
        </button>
      )}
      <button type="button" className="icon-btn" onClick={dismiss} aria-label="Hinweis ausblenden">
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}
