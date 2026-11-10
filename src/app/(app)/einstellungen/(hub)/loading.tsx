import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingSettings() {
  return (
    <SettingsLoading
      title="Einstellungen"
      back={false}
      groups={[["", 6], ["Dieses Gerät", 3], ["Konto", 1]]}
    />
  );
}
