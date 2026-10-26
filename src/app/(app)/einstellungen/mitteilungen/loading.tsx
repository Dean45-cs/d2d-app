import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingNotificationSettings() {
  return <SettingsLoading title="Mitteilungen" groups={[["Dieses Gerät", 1], ["Push-Nachrichten über", 4], ["In der App", 1]]} />;
}
