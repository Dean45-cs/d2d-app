/*
 * Womit die App startet (Einstellungen -> Bereiche). Steht im Cookie, weil
 * der Server beim Aufruf von "/" (Start vom Home-Bildschirm) weiterleitet.
 */

export const HOME_COOKIE = "cs_home";

export const HOME_TARGETS = {
  auto: null,
  tour: "/tour",
  start: "/start",
  termine: "/termine",
  gebiete: "/gebiete",
  team: "/team",
} as const;

export type HomeChoice = keyof typeof HOME_TARGETS;

export function parseHome(value: string | undefined): HomeChoice {
  return value && value in HOME_TARGETS ? (value as HomeChoice) : "auto";
}
