import { createVisitRequestId, enqueue, remove } from "./offline-queue";

export interface LocalSaleDraft {
  draft_key: string;
  label: string;
  created_at: string;
  ownerUserId: number;
  status: "OPEN" | "CONFIRMED" | "ABORTED";
  payload: Record<string, unknown>;
  synced?: boolean;
}

const KEY = "d2d_sale_drafts_v1";
export const SALE_DRAFT_EVENT = "d2d-sale-drafts";

function readAll(): LocalSaleDraft[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function localSaleDrafts(userId: number): LocalSaleDraft[] {
  return readAll().filter((item) => item?.ownerUserId === userId);
}

/** Wirft, wenn der Geraetespeicher voll oder gesperrt ist - der Aufrufer meldet das. */
export function storeSaleDrafts(userId: number, drafts: LocalSaleDraft[]) {
  const others = readAll().filter((item) => item?.ownerUserId !== userId);
  localStorage.setItem(KEY, JSON.stringify([...others, ...drafts]));
  window.dispatchEvent(new Event(SALE_DRAFT_EVENT));
}

export function beginSaleDraft(userId: number, payload: Record<string, unknown>, label: string): LocalSaleDraft {
  const drafts = localSaleDrafts(userId);
  const existing = drafts.find((item) => item.status === "OPEN" && item.payload.streetId === payload.streetId
    && item.payload.houseNumber === payload.houseNumber && item.payload.doorbellLabel === payload.doorbellLabel);
  if (existing && existing.payload.energyType === payload.energyType) return existing;
  // Anderes Produkt an derselben Tuer: der alte Auftrag gilt nicht mehr - sonst
  // zaehlte beim Bestaetigen das zuerst getippte Produkt.
  const kept = existing
    ? drafts.map((item): LocalSaleDraft => (item.draft_key === existing.draft_key ? { ...item, status: "ABORTED" } : item))
    : drafts;
  const draft: LocalSaleDraft = { draft_key: createVisitRequestId(), label, created_at: new Date().toISOString(),
    ownerUserId: userId, status: "OPEN", payload };
  storeSaleDrafts(userId, [draft, ...kept]);
  const queued: string[] = [];
  try {
    queued.push(enqueue(`Auftrag begonnen · ${label}`, { ...payload, draftKey: draft.draft_key, action: "OPEN" },
      { url: "/api/sale-drafts", ownerUserId: userId }).localId);
    if (existing) {
      queued.push(enqueue(`Auftrag geändert · ${existing.label}`, { draftKey: existing.draft_key, action: "ABORT" },
        { url: "/api/sale-drafts", ownerUserId: userId }).localId);
    }
  } catch (error) {
    queued.forEach((localId) => remove(localId));
    storeSaleDrafts(userId, drafts);
    throw error;
  }
  window.dispatchEvent(new Event(SALE_DRAFT_EVENT));
  return draft;
}
