import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingAppearance() {
  return <SettingsLoading title="Darstellung" groups={[["", 2], ["Erscheinungsbild", 2], ["Akzentfarbe", 2]]} />;
}
