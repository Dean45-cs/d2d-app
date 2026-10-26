import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingAreaSettings() {
  return <SettingsLoading title="Bereiche" groups={[["Reiter und Seitenleiste", 3], ["Beim Öffnen", 4]]} />;
}
