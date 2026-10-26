"use client";

import { useSyncExternalStore } from "react";
import { IconSparkles } from "./icons";
import { useToast } from "./Toast";
import { Cell, Switch, ToneTile } from "./ui";
import { onXpHintsChange, setXpHints, xpHintsOn } from "@/lib/level-feedback";

/** Der Schalter im Profil unter "Dieses Gerät": XP in den Meldungen nach einem Besuch. */
export function XpHintsCell() {
  const on = useSyncExternalStore(onXpHintsChange, xpHintsOn, () => true);
  const toast = useToast();

  function toggle(next: boolean) {
    setXpHints(next);
    toast(next ? "XP-Hinweise sind an" : "XP-Hinweise sind aus");
  }

  return (
    <li>
      <Cell
        icon={
          <ToneTile tone="brown">
            <IconSparkles className="h-4 w-4" />
          </ToneTile>
        }
        title="XP-Hinweise"
        subtitle="„+100 XP“ in der Meldung nach einem Besuch"
        wrap
        trailing={<Switch checked={on} onChange={toggle} label="XP-Hinweise auf diesem Gerät" />}
      />
    </li>
  );
}
