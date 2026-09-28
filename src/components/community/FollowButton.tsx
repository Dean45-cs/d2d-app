"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconBellCheck, IconPlus } from "@/components/icons";
import { useConfirm } from "@/components/useConfirm";
import { enablePush, pushState, PUSH_HINT, type PushState } from "@/lib/push-client";
import { useToast } from "./Toast";

/**
 * Abonnieren wie bei Twitter - mit dem Unterschied, dass ein Abo hier heisst:
 * jeder Vertrag dieser Person kommt als Push aufs Handy.
 *
 * Ist Push auf dem Geraet noch aus, fragt der Knopf beim Abonnieren gleich
 * mit nach der Erlaubnis. Das muss im selben Tipp passieren - Safari fragt
 * sonst nicht.
 */
export function FollowButton({
  userId,
  name,
  initial,
  size = "md",
  refresh = false,
}: {
  userId: number;
  name: string;
  initial: boolean;
  size?: "sm" | "md";
  /** Seite danach neu laden - im Profil, damit der Zaehler der Abonnenten stimmt. */
  refresh?: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const { show, toast } = useToast();
  const first = name.split(" ")[0];

  async function send(next: boolean): Promise<boolean> {
    const response = await fetch(`/api/follows/${userId}`, { method: next ? "POST" : "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      show(data.error ?? "Das hat nicht geklappt.");
      return false;
    }
    setFollowing(data.following);
    if (refresh) router.refresh();
    return true;
  }

  async function subscribe() {
    setBusy(true);
    try {
      // Erst fragen (noch im Tipp), dann speichern - beides laeuft parallel.
      // Die Frage nach der Erlaubnis muss ohne jedes "await" davor kommen.
      const undecided =
        typeof Notification !== "undefined" && Notification.permission === "default";
      const push: Promise<PushState> = undecided
        ? enablePush()
        : pushState().then((state) => (state === "off" ? enablePush() : state));
      const ok = await send(true);
      const state = await push.catch((): PushState => "off");
      if (!ok) return;
      show(
        state === "on"
          ? `Abonniert – du bekommst Bescheid, wenn ${first} einen Vertrag macht.`
          : `${first} abonniert. ${PUSH_HINT[state] ?? ""}`.trim(),
      );
    } catch {
      show("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    const ok = await confirm({
      title: `Abo von ${first} beenden?`,
      text: `Du bekommst dann keine Nachricht mehr, wenn ${first} einen Vertrag macht.`,
      confirmLabel: "Abo beenden",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await send(false);
    } catch {
      show("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  const sizing = size === "sm" ? "btn-sm" : "";
  return (
    <>
      {following ? (
        <button
          type="button"
          className={`btn btn-ghost btn-pill ${sizing}`}
          onClick={() => void unsubscribe()}
          disabled={busy}
          aria-pressed="true"
        >
          <IconBellCheck className="h-4 w-4" />
          Abonniert
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-primary btn-pill ${sizing}`}
          onClick={() => void subscribe()}
          disabled={busy}
          aria-pressed="false"
        >
          <IconPlus className="h-4 w-4" />
          Abonnieren
        </button>
      )}
      {dialog}
      {toast}
    </>
  );
}
