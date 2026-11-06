/**
 * App-wide state: the take feed, provider status and toasts. Components
 * subscribe with useStore(selector). There is no live socket any more: the
 * provider is polled, because a serverless deployment cannot hold one open.
 */
import { useSyncExternalStore } from 'react';
import { api, type Status, type Take } from './api';

export interface Live {
  takes: Take[];
  status: Status | null;
  toast: { text: string; err?: boolean } | null;
}

let state: Live = { takes: [], status: null, toast: null };
const listeners = new Set<() => void>();
function set(patch: Partial<Live>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => { listeners.delete(l); });
const snap = () => state;

/** Subscribe to the whole state (a stable snapshot) and derive with `sel`. */
export function useStore<T>(sel: (s: Live) => T): T {
  return sel(useSyncExternalStore(subscribe, snap));
}
export const getState = () => state;

let toastTimer: number | undefined;
export function toast(text: string, err = false) {
  set({ toast: { text, err } });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => set({ toast: null }), err ? 7000 : 3500);
}

export async function refreshTakes() {
  try {
    set({ takes: await api.takes(null) });
  } catch {
    /* the provider is unreachable; the status chip shows it */
  }
}

export async function refreshStatus() {
  try {
    set({ status: await api.status() });
  } catch {
    set({ status: { up: false, active: [] } });
  }
}

let started = false;
/** Start polling. Takes every 3 s while a job is live, status every 4 s. */
export function startLive() {
  if (started) return;
  started = true;
  void refreshTakes();
  void refreshStatus();
  setInterval(refreshStatus, 4000);
  setInterval(() => {
    if (state.takes.some(isActive)) void refreshTakes();
  }, 3000);
}

/** Settings JSON of a take, parsed once. */
const parsed = new WeakMap<Take, any>();
export function settingsOf(t: Take): any {
  let s = parsed.get(t);
  if (!s) {
    try { s = JSON.parse(t.settings); } catch { s = {}; }
    parsed.set(t, s);
  }
  return s;
}

export const isImage = (t: Take) => t.kind === 'still';
/** An Object take: a GLB. Kept for older rows; the Object app is gone. */
export const isModel = (t: Take) => t.kind === 'object';
export const isActive = (t: Take) => t.status === 'queued' || t.status === 'rendering';

/**
 * Cross-page hand-off: "Animate" or "Use as reference" on an asset drops
 * refs here, then navigates; the create page takes them on mount.
 */
export interface Ref { token: string; role: 'start' | 'end' | 'ref'; kind: 'image' | 'video'; name: string }
let handoff: { refs: Ref[]; prompt?: string } | null = null;
export function setHandoff(h: { refs: Ref[]; prompt?: string }) { handoff = h; }
export function takeHandoff() { const h = handoff; handoff = null; return h; }

/** Takes that belong in a feed: not cancelled, not internal renders. */
const INTERNAL_APPS = new Set(['preset-thumb', 'reshoot-warp']);
export const inFeed = (t: Take) => t.status !== 'stopped' && !INTERNAL_APPS.has(settingsOf(t).app);
