import type { ReactElement } from "react";
import {
  IconBolt,
  IconCalendar,
  IconChart,
  IconCog,
  IconDoor,
  IconFeed,
  IconGrid,
  IconHome,
  IconMap,
  IconTrophy,
  IconUsers,
} from "./icons";
import type { IconName } from "@/lib/nav";

/** Zeichen je Navigationspunkt - ohne "use client", damit Server-Seiten es auch nutzen. */
export const NAV_ICONS: Record<IconName, (props: { className?: string }) => ReactElement> = {
  home: IconHome,
  door: IconDoor,
  map: IconMap,
  bolt: IconBolt,
  chart: IconChart,
  users: IconUsers,
  calendar: IconCalendar,
  cog: IconCog,
  grid: IconGrid,
  feed: IconFeed,
  trophy: IconTrophy,
};
