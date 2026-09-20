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
  /** Auf der Karte gezeichnete Flaeche als JSON ([[lat, lng], ...]), sonst "". */
  area_json: string;
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
  /** Mittelpunkt der Strasse, sofern sie aus der Karte uebernommen wurde. */
  lat: number | null;
  lng: number | null;
  created_at: string;
}

/** Ein- oder Mehrfamilienhaus. '' = beim ersten Antippen noch zu waehlen. */
export type BuildingType = "" | "EFH" | "MFH";

/** Eine Hausnummer einer Strasse, so wie sie in OpenStreetMap steht. */
export interface HouseNumber {
  id: number;
  street_id: number;
  number: string;
  /** Wohneinheiten im Haus, 0 = unbekannt. */
  units: number;
  lat: number | null;
  lng: number | null;
  sort_order: number;
  building_type: BuildingType;
  /** Gesetzt, wenn hier ausdruecklich nicht mehr geklingelt werden soll. */
  blocked_at: string | null;
  blocked_by: number | null;
  blocked_note: string;
}

/**
 * Ein Klingelschild in einem Mehrfamilienhaus.
 *
 * Erkannt wird es am Namen, nicht an der ID: nur so kann die App im
 * Treppenhaus ohne Netz eine Klingel anlegen und den Besuch daran haengen.
 */
export interface Doorbell {
  id: number;
  house_number_id: number;
  /** Name auf dem Schild, z. B. "Mueller". */
  label: string;
  /** Etage, z. B. "2. OG" - optional. */
  floor: string;
  sort_order: number;
  created_at: string;
  /** Gesetzt, wenn hier ausdruecklich nicht mehr geklingelt werden soll. */
  blocked_at: string | null;
  blocked_by: number | null;
  blocked_note: string;
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

/** Wo ein Auftrag in der Nachbearbeitung steht. */
export type OrderStatus =
  | "ERFASST"
  | "QUALITY_CALL"
  | "EINGEREICHT"
  | "BESTAETIGT"
  | "STORNIERT"
  | "WIDERRUFEN";

/**
 * Ein an der Tuer aufgenommener Auftrag.
 *
 * Die Felder bilden ab, was fuer einen Energieliefervertrag gebraucht wird:
 * Kunde, Produkt, Zaehler und Verbrauch, bisheriger Anbieter, Wunschtermin -
 * dazu die Nachweise aus dem Gespraech (Unterschrift, Widerrufsbelehrung).
 */
export interface Order {
  id: number;
  team_id: number;
  user_id: number;
  /** Vom Geraet vergeben, damit ein nachgesendeter Auftrag nicht doppelt entsteht. */
  client_ref: string;
  visit_id: number | null;
  territory_id: number | null;
  street_id: number | null;
  street_name: string;
  house_number: string;
  doorbell_label: string;
  postal_code: string;
  city: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  energy_type: "STROM" | "GAS" | "BEIDES";
  tariff: string;
  previous_provider: string;
  meter_strom: string;
  meter_gas: string;
  /** Jahresverbrauch in kWh, 0 = nicht erfasst. */
  usage_strom: number;
  usage_gas: number;
  start_date: string | null;
  note: string;
  /** Unterschrift des Kunden als PNG-Daten-URL. */
  signature: string;
  signed_at: string | null;
  withdrawal_given: number;
  privacy_given: number;
  status: OrderStatus;
  status_note: string;
  status_by: number | null;
  status_at: string | null;
  created_at: string;
}

export interface Visit {
  id: number;
  team_id: number;
  user_id: number;
  territory_id: number | null;
  street_id: number | null;
  house_number: string;
  /** Gesetzt, wenn der Eintrag an einer einzelnen Klingel haengt. */
  doorbell_id: number | null;
  outcome: VisitOutcome;
  reason_id: number | null;
  reason_note: string;
  energy_type: "" | "STROM" | "GAS" | "BEIDES";
  /** Vereinbarter Termin als Ortszeit "2026-09-21 18:00". */
  follow_up_at: string | null;
  /** Gesetzt, sobald der Termin abgearbeitet ist. */
  follow_up_done_at: string | null;
  /** Ansprechpartner fuer den Termin - Name und Rufnummer von der Tuer. */
  contact_name: string;
  contact_phone: string;
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

export const BUILDING_TYPE_LABEL: Record<Exclude<BuildingType, "">, string> = {
  EFH: "Einfamilienhaus",
  MFH: "Mehrfamilienhaus",
};

/** Ein Kontakt zaehlt als "angetroffen", wenn tatsaechlich jemand an der Tuer war. */
export const MET_OUTCOMES: VisitOutcome[] = ["MET_NO_SALE", "APPOINTMENT", "SALE"];
