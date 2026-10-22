import type { ReactElement } from "react";
import {
  IconBolt,
  IconCalendar,
  IconChart,
  IconChartFill,
  IconCog,
  IconComment,
  IconContacts,
  IconDoor,
  IconDoorFill,
  IconList,
  IconMap,
  IconMapFill,
  IconPersonCircle,
  IconShield,
  IconSparkles,
  IconTrophy,
  IconUserPlus,
  IconUsers,
  IconUsersFill,
} from "./icons";
import type { IconName } from "@/lib/nav";

type IconComponent = (props: { className?: string }) => ReactElement;

/** Zeichen je Navigationspunkt; die Reiter bekommen aktiv die gefuellte Form. */
export const NAV_ICONS: Record<IconName, { line: IconComponent; fill: IconComponent }> = {
  chart: { line: IconChart, fill: IconChartFill },
  door: { line: IconDoor, fill: IconDoorFill },
  map: { line: IconMap, fill: IconMapFill },
  team: { line: IconUsers, fill: IconUsersFill },
  profile: { line: IconPersonCircle, fill: IconPersonCircle },
  calendar: { line: IconCalendar, fill: IconCalendar },
  contacts: { line: IconContacts, fill: IconContacts },
  bolt: { line: IconBolt, fill: IconBolt },
  comment: { line: IconComment, fill: IconComment },
  trophy: { line: IconTrophy, fill: IconTrophy },
  sparkles: { line: IconSparkles, fill: IconSparkles },
  users: { line: IconUsers, fill: IconUsersFill },
  invite: { line: IconUserPlus, fill: IconUserPlus },
  shield: { line: IconShield, fill: IconShield },
  list: { line: IconList, fill: IconList },
  cog: { line: IconCog, fill: IconCog },
};
