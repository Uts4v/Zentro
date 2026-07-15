// lib/shift-worker.ts
// Simple localStorage-based session for shift workers.
// No Supabase auth — just worker_id + merchant_id + name in localStorage.

const SHIFT_WORKER_KEY = "zentro_shift_worker";

export interface ShiftWorkerSession {
  worker_id: string;
  merchant_id: string;
  name: string;
}

export function getShiftWorker(): ShiftWorkerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SHIFT_WORKER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShiftWorkerSession;
  } catch {
    return null;
  }
}

export function setShiftWorker(session: ShiftWorkerSession): void {
  localStorage.setItem(SHIFT_WORKER_KEY, JSON.stringify(session));
}

export function clearShiftWorker(): void {
  localStorage.removeItem(SHIFT_WORKER_KEY);
}
