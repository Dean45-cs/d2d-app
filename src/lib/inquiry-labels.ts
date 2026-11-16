/*
 * Anfragen von der Website - Bezeichnungen ohne Datenbank, damit auch die
 * Oberflaeche im Browser sie kennt. Gespeichert wird in inquiries.ts.
 */

export const INQUIRY_TOPICS = {
  BERATUNG: "Beratung",
  BERATER_PRUEFEN: "Berater prüfen",
  BEWERBUNG: "Bewerbung",
  SONSTIGES: "Sonstiges",
} as const;
export type InquiryTopic = keyof typeof INQUIRY_TOPICS;

export const INQUIRY_STATUS = {
  NEW: "Neu",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  SPAM: "Spam",
} as const;
export type InquiryStatus = keyof typeof INQUIRY_STATUS;

/** Ansichten des Posteingangs: offen = neu und in Bearbeitung. */
export const INQUIRY_VIEWS = ["offen", "erledigt", "spam"] as const;
export type InquiryView = (typeof INQUIRY_VIEWS)[number];

export function isInquiryTopic(value: unknown): value is InquiryTopic {
  return typeof value === "string" && Object.hasOwn(INQUIRY_TOPICS, value);
}

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && Object.hasOwn(INQUIRY_STATUS, value);
}

export function isInquiryView(value: unknown): value is InquiryView {
  return typeof value === "string" && (INQUIRY_VIEWS as readonly string[]).includes(value);
}

/** Was der Posteingang je Anfrage zeigt - ohne die internen Kennwerte. */
export interface InquiryRow {
  id: number;
  topic: InquiryTopic;
  name: string;
  email: string;
  phone: string;
  postal_code: string;
  message: string;
  status: InquiryStatus;
  assigned_user_id: number | null;
  assigned_name: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface InquiryEvent {
  id: number;
  kind: "NOTE" | "STATUS" | "ASSIGN";
  body: string;
  user_id: number | null;
  user_name: string | null;
  created_at: string;
}

export interface InquiryCounts {
  new: number;
  open: number;
  done: number;
  spam: number;
}
