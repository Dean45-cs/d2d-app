export type Role = "LEADER" | "MEMBER";

export type VisitOutcome = "NOT_HOME" | "MET_NO_SALE" | "APPOINTMENT" | "SALE";

export type TerritoryStatus = "OPEN" | "ACTIVE" | "DONE" | "PAUSED";

export interface User {
  id: number;
  team_id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  active: number;
  created_at: string;
}

export interface Territory {
  id: number;
  team_id: number;
  name: string;
  city: string;
  postal_code: string;
  assigned_user_id: number | null;
  status: TerritoryStatus;
  note: string;
  due_date: string | null;
  created_at: string;
}

export interface Street {
  id: number;
  territory_id: number;
  name: string;
  house_numbers: string;
  units: number;
  status: "OPEN" | "ACTIVE" | "DONE";
  sort_order: number;
  created_at: string;
}

export interface RejectionReason {
  id: number;
  team_id: number;
  code: string;
  label: string;
  emoji: string;
  hint: string;
  sort_order: number;
  active: number;
}

export interface Visit {
  id: number;
  team_id: number;
  user_id: number;
  territory_id: number | null;
  street_id: number | null;
  house_number: string;
  outcome: VisitOutcome;
  reason_id: number | null;
  reason_note: string;
  energy_type: "" | "STROM" | "GAS" | "BEIDES";
  follow_up_at: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface EnergyPrice {
  id: number;
  postal_code: string;
  city: string;
  state: string;
  provider: string;
  lat: number;
  lng: number;
  strom_ct_kwh: number | null;
  strom_base_eur: number | null;
  gas_ct_kwh: number | null;
  gas_base_eur: number | null;
  households: number;
  source: string;
  is_demo: number;
  valid_from: string | null;
  updated_at: string;
}

export const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  NOT_HOME: "Nicht angetroffen",
  MET_NO_SALE: "Angetroffen – kein Abschluss",
  APPOINTMENT: "Termin vereinbart",
  SALE: "Abschluss",
};

/** Ein Kontakt zaehlt als "angetroffen", wenn tatsaechlich jemand an der Tuer war. */
export const MET_OUTCOMES: VisitOutcome[] = ["MET_NO_SALE", "APPOINTMENT", "SALE"];
