"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_RANKS, type RankSetup } from "@/lib/tiers";

/*
 * Wie das Team seine Raenge nennt und welche ein Team haben duerfen - einmal
 * im App-Layout geladen, damit jede Liste die eigenen Namen zeigt.
 */
const RanksContext = createContext<RankSetup>(DEFAULT_RANKS);

export function RanksProvider({ value, children }: { value: RankSetup; children: ReactNode }) {
  return <RanksContext.Provider value={value}>{children}</RanksContext.Provider>;
}

export function useRanks(): RankSetup {
  return useContext(RanksContext);
}
