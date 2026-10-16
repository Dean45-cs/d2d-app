"use client";

import { useEffect } from "react";
import { pushState, syncPush } from "@/lib/push-client";

/**
 * Ordnet das Geraet fuer Push der angemeldeten Person zu, sobald die App
 * offen ist. Beim Abmelden wird das Geraet abgemeldet (forgetPushDevice) -
 * ohne diesen Schritt kaemen nach dem naechsten Anmelden keine
 * Terminerinnerungen mehr, bis jemand zufaellig Team oder Profil oeffnet. Und
 * nach einer abgelaufenen Sitzung bekaeme sonst der Vorbesitzer des Handys
 * weiter die Nachrichten.
 */
export function PushSync({ userId }: { userId: number }) {
  useEffect(() => {
    void pushState()
      .then((state) => (state === "on" ? syncPush() : undefined))
      .catch(() => undefined);
  }, [userId]);
  return null;
}
