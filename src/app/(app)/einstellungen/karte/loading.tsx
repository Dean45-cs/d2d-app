import { SettingsLoading } from "@/components/settings/SettingsLoading";

export default function LoadingMapSettings() {
  return <SettingsLoading title="Karte" groups={[["Ansicht beim Öffnen", 2], ["Darstellung", 1], ["Standort", 1]]} />;
}
