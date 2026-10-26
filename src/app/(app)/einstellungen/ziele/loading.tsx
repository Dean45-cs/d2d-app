import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingGoalSettings() {
  return <SettingsLoading title="Ziele & Erfolge" groups={[["Tagesziele", 3], ["Nach einem Besuch", 2]]} />;
}
