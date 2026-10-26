import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingSettings() {
  return (
    <SettingsLoading
      title="Einstellungen"
      back={false}
      groups={[["", 1], ["Arbeit", 4], ["Mitteilungen", 1], ["Dieses Gerät", 2]]}
    />
  );
}
