"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconBell, IconCalendar, IconCheckCircle, IconComment, IconHistory, IconUserPlus, IconVibrate } from "@/components/icons";
import { PUSH_BANNER_KEY, PushRows } from "@/components/community/PushToggle";
import { useToast } from "@/components/Toast";
import { ListLabel, PageHeader } from "@/components/ui";
import { PrefChoice, PrefSwitch, SettingIcon, SwitchRow } from "@/components/settings/controls";
import { canVibrate } from "@/lib/preferences";
import type { PushKind } from "@/lib/push-kinds";

const KIND_ROWS: Array<{ kind: PushKind; title: string; subtitle: string; icon: ReactNode }> = [
  {
    kind: "sale",
    title: "Abschlüsse",
    subtitle: "Wenn jemand, den du abonniert hast, einen Vertrag macht",
    icon: <SettingIcon tone="teal"><IconCheckCircle /></SettingIcon>,
  },
  {
    kind: "comment",
    title: "Kommentare",
    subtitle: "Zu deinen Beiträgen und Abschlüssen",
    icon: <SettingIcon tone="blue"><IconComment /></SettingIcon>,
  },
  {
    kind: "follow",
    title: "Neue Abonnenten",
    subtitle: "Wenn dich jemand abonniert",
    icon: <SettingIcon tone="purple"><IconUserPlus /></SettingIcon>,
  },
  {
    kind: "reminder",
    title: "Terminerinnerungen",
    subtitle: "15 Minuten vor einem Termin – ohne Namen und Adresse auf dem Sperrbildschirm",
    icon: <SettingIcon tone="indigo"><IconCalendar /></SettingIcon>,
  },
];

/**
 * Mitteilungen: Push auf diesem Geraet, worueber Push kommt (fuer alle
 * eigenen Geraete, auf dem Server) und wie sich die App selbst meldet.
 */
export function NotificationSettings({ initialKinds }: { initialKinds: Record<PushKind, boolean> }) {
  const toast = useToast();
  const [kinds, setKinds] = useState(initialKinds);
  const [busy, setBusy] = useState<PushKind | null>(null);
  const [banner, setBanner] = useState(true);
  const [vibration, setVibration] = useState(false);

  useEffect(() => {
    try {
      setBanner(window.localStorage.getItem(PUSH_BANNER_KEY) !== "hidden");
    } catch {
      setBanner(true);
    }
    setVibration(canVibrate());
  }, []);

  async function toggleKind(kind: PushKind, on: boolean) {
    const before = kinds;
    setKinds({ ...kinds, [kind]: on });
    setBusy(kind);
    try {
      const response = await fetch("/api/push/kinds", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kinds: { [kind]: on } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Nicht gespeichert");
      setKinds(data.kinds);
    } catch (error) {
      setKinds(before);
      toast(error instanceof TypeError ? "Ohne Verbindung nicht möglich" : error instanceof Error ? error.message : "Nicht gespeichert");
    } finally {
      setBusy(null);
    }
  }

  function toggleBanner(on: boolean) {
    setBanner(on);
    try {
      if (on) window.localStorage.removeItem(PUSH_BANNER_KEY);
      else window.localStorage.setItem(PUSH_BANNER_KEY, "hidden");
    } catch {
      // Ohne Speicher erscheint der Hinweis eben wieder.
    }
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Mitteilungen" back={{ href: "/einstellungen", label: "Einstellungen" }} />

      <ListLabel>Dieses Gerät</ListLabel>
      <ul className="list list-icons">
        <PushRows />
      </ul>

      <ListLabel>Push-Nachrichten über</ListLabel>
      <ul className="list list-icons">
        {KIND_ROWS.map((row) => (
          <SwitchRow
            key={row.kind}
            title={row.title}
            subtitle={row.subtitle}
            icon={row.icon}
            checked={kinds[row.kind]}
            onChange={(on) => void toggleKind(row.kind, on)}
            disabled={busy === row.kind}
          />
        ))}
      </ul>
      <p className="list-footer">Gilt für alle deine Geräte, auf denen Push an ist.</p>

      <ListLabel>In der App</ListLabel>
      <ul className="list list-icons">
        <SwitchRow
          title="Push-Hinweis im Feed"
          subtitle="Leiser Hinweis oben im Feed, solange Push aus ist"
          icon={<SettingIcon tone="magenta"><IconBell /></SettingIcon>}
          checked={banner}
          onChange={toggleBanner}
        />
        {vibration && (
          <PrefSwitch
            name="vibrate"
            title="Vibration"
            subtitle="Kurzes Summen beim Erfassen einer Tür"
            icon={<SettingIcon tone="slate"><IconVibrate /></SettingIcon>}
          />
        )}
      </ul>

      <ListLabel>Meldungen anzeigen</ListLabel>
      <ul className="list" role="radiogroup" aria-label="Meldungen anzeigen">
        <PrefChoice
          name="toastSpeed"
          label="Meldungen anzeigen"
          choices={[
            { value: "short", label: "Kurz", subtitle: "Verschwinden schnell wieder" },
            { value: "normal", label: "Normal" },
            { value: "long", label: "Lang", subtitle: "Mehr Zeit für „Rückgängig“" },
          ]}
        />
      </ul>
      <p className="list-footer">
        <IconHistory className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        „Rückgängig“ bleibt auch danach unter Klinken › „Heute“ erreichbar.
      </p>
    </div>
  );
}
