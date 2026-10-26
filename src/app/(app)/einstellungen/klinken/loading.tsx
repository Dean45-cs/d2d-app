import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingTourSettings() {
  return <SettingsLoading title="Klinken" groups={[["Liste", 1], ["Straßen sortieren", 2], ["Kopf", 3], ["Hinweise", 4]]} />;
}
