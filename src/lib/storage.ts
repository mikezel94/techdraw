import type { Camera } from './camera';
import type { Element } from '../types';

export const STORAGE_KEY = 'techdraw-project';
export const SCHEMA_VERSION = 1;
export const ONBOARDING_KEY = 'techdraw-onboarded';
export const MOBILE_NOTICE_KEY = 'techdraw-mobile-notice-dismissed';

export interface SavedProject {
  version: number;
  savedAt: string;
  elements: Element[];
  camera: Camera;
  gridEnabled: boolean;
  snapEnabled: boolean;
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

export function loadProject(): SavedProject | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedProject | null;
    if (!parsed || typeof parsed !== 'object') return null;
    // No migration path yet: reject anything not at the current version.
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.elements)) return null;
    if (!parsed.camera || typeof parsed.camera.zoom !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProject(data: Omit<SavedProject, 'version' | 'savedAt'>): SaveResult {
  const payload: SavedProject = {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    ...data,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? 'quota' : 'unavailable' };
  }
}

export function clearProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22)
  );
}

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable — the tour will show again on the next visit.
  }
}

export function hasDismissedMobileNotice(): boolean {
  try {
    return localStorage.getItem(MOBILE_NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

export function dismissMobileNotice(): void {
  try {
    localStorage.setItem(MOBILE_NOTICE_KEY, new Date().toISOString());
  } catch {
    // Storage unavailable — the notice will show again on the next visit.
  }
}
