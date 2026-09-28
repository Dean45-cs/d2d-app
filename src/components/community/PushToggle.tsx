"use client";

import { useEffect, useState } from "react";
import { IconBell } from "@/components/icons";
import { Switch } from "@/components/ui";
import {
  disablePush,
  enablePush,
  pushState,
  syncPush,
  PUSH_HINT,
  type PushState,
} from "@/lib/push-client";
import { useToast } from "./Toast";

/**
 * Schalter fuer Push-Nachrichten auf diesem Geraet.
 *
 * "card" steht im eigenen Profil, "banner" oben im Feed - der Banner zeigt
 * sich nur, solange Push aus ist und sich einschalten liesse.
 */
export function PushToggle({ variant = "card" }: { variant?: "card" | "banner" }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { show, toast } = useToast();

  useEffect(() => {
    let alive = true;
    void pushState()
      .then((next) => {
        if (alive) setState(next);
        if (next === "on") void syncPush();
      })
      .catch(() => alive && setState("unsupported"));
    try {
      setDismissed(localStorage.getItem("d2d-push-banner") === "hidden");
    } catch {
      // Ohne Speicher erscheint der Hinweis eben wieder.
    }
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
    } catch (error) {
      show(error instanceof Error ? error.message : "Push ließ sich nicht einschalten.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      show(response.ok ? "Probe-Nachricht ist unterwegs." : (data.error ?? "Senden fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem("d2d-push-banner", "hidden");
    } catch {
      // egal
    }
  }

  if (state === null) return null;

  if (variant === "banner") {
    if (dismissed || (state !== "off" && state !== "ios-install")) return null;
    return (
      <div
        className="card mb-4 flex items-start gap-3 p-3.5"
        style={{ background: "color-mix(in srgb, var(--brand-500) 7%, var(--card))" }}
      >
        <span className="tile-icon h-9 w-9 shrink-0 text-white" style={{ background: "var(--brand-500)" }}>
          <IconBell className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Keinen Vertrag mehr verpassen</p>
          <p className="muted mt-0.5 text-[12.5px] leading-snug">{PUSH_HINT[state]}</p>
          <div className="mt-2.5 flex gap-2">
            {state === "off" && (
              <button
                type="button"
                className="btn btn-primary btn-sm btn-pill"
                onClick={() => void toggle(true)}
                disabled={busy}
              >
                Push einschalten
              </button>
            )}
            <button type="button" className="btn btn-plain btn-sm btn-pill" onClick={dismiss}>
              Später
            </button>
          </div>
        </div>
        {toast}
      </div>
    );
  }

  const available = state === "on" || state === "off";
  return (
    <div className="list">
      <div className="list-row">
        <span className="tile-icon h-8 w-8 text-white" style={{ background: "var(--brand-500)", borderRadius: 9 }}>
          <IconBell className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Push-Nachrichten</span>
          <span className="muted block text-[12.5px] leading-snug">{PUSH_HINT[state]}</span>
        </span>
        {available && (
          <Switch
            checked={state === "on"}
            onChange={(on) => void toggle(on)}
            label="Push-Nachrichten auf diesem Gerät"
            disabled={busy}
          />
        )}
      </div>
      {state === "on" && (
        <button type="button" className="list-row text-[14px] font-medium text-tint" onClick={() => void test()} disabled={busy}>
          Probe-Nachricht senden
        </button>
      )}
      {toast}
    </div>
  );
}
