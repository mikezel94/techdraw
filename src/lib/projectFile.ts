import type { Camera } from './camera';
import type { Element } from '../types';
import type { Unit } from './units';
import { isUnit, isValidScale } from './units';

declare const __APP_VERSION__: string;

// Magic marker so we can tell a `.tdraw` file apart from arbitrary JSON.
export const PROJECT_FORMAT = 'techdraw';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXT = '.tdraw';

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  title: string;
  createdAt: string;
  modifiedAt: string;
  appVersion: string;
  elements: Element[];
  camera: Camera;
  gridEnabled: boolean;
  snapEnabled: boolean;
  /** Absent in files written before measurement units existed. */
  unit?: Unit;
  scale?: number;
}

export interface ProjectState {
  title: string;
  elements: Element[];
  camera: Camera;
  gridEnabled: boolean;
  snapEnabled: boolean;
  unit: Unit;
  scale: number;
}

export type ParseResult = { ok: true; project: ProjectFile } | { ok: false; error: string };

const ELEMENT_TYPES = new Set([
  'pencil',
  'rect',
  'ellipse',
  'line',
  'arrow',
  'text',
  'dimension',
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPoint(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    isFiniteNumber((v as { x?: unknown }).x) &&
    isFiniteNumber((v as { y?: unknown }).y)
  );
}

// Per-type structural check so a malformed element fails with a clear message
// instead of crashing the renderer mid-draw.
function validateElement(el: unknown, index: number): string | null {
  if (typeof el !== 'object' || el === null) return `Element ${index} is not an object.`;
  const e = el as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) return `Element ${index} is missing an id.`;
  if (!ELEMENT_TYPES.has(e.type as string)) {
    return `Element ${index} has unknown type "${String(e.type)}".`;
  }
  switch (e.type) {
    case 'pencil':
      if (!Array.isArray(e.points) || !e.points.every(isPoint)) {
        return `Element ${index} (pencil) has invalid points.`;
      }
      break;
    case 'rect':
    case 'ellipse':
      if (
        !isFiniteNumber(e.x) ||
        !isFiniteNumber(e.y) ||
        !isFiniteNumber(e.width) ||
        !isFiniteNumber(e.height)
      ) {
        return `Element ${index} (${e.type}) has invalid geometry.`;
      }
      break;
    case 'line':
    case 'arrow':
      if (
        !isFiniteNumber(e.x1) ||
        !isFiniteNumber(e.y1) ||
        !isFiniteNumber(e.x2) ||
        !isFiniteNumber(e.y2)
      ) {
        return `Element ${index} (${e.type}) has invalid endpoints.`;
      }
      break;
    case 'text':
      if (!isFiniteNumber(e.x) || !isFiniteNumber(e.y) || typeof e.text !== 'string') {
        return `Element ${index} (text) is invalid.`;
      }
      break;
    case 'dimension':
      if (!isPoint(e.start) || !isPoint(e.end) || !isFiniteNumber(e.offset)) {
        return `Element ${index} (dimension) is invalid.`;
      }
      break;
  }
  return null;
}

export function serializeProject(state: ProjectState, createdAt?: string): string {
  const now = new Date().toISOString();
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_FILE_VERSION,
    title: state.title,
    createdAt: createdAt ?? now,
    modifiedAt: now,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    elements: state.elements,
    camera: state.camera,
    gridEnabled: state.gridEnabled,
    snapEnabled: state.snapEnabled,
    unit: state.unit,
    scale: state.scale,
  };
  return JSON.stringify(file, null, 2);
}

export function parseProject(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'File is not a techdraw project.' };
  }
  const p = data as Record<string, unknown>;
  if (p.format !== PROJECT_FORMAT) {
    return { ok: false, error: 'File is not a techdraw project.' };
  }
  if (p.version !== PROJECT_FILE_VERSION) {
    return {
      ok: false,
      error: `Unsupported file version ${String(p.version)} (this app supports version ${PROJECT_FILE_VERSION}).`,
    };
  }
  if (!Array.isArray(p.elements)) {
    return { ok: false, error: 'Project is missing its elements.' };
  }
  for (let i = 0; i < p.elements.length; i++) {
    const problem = validateElement(p.elements[i], i);
    if (problem) return { ok: false, error: problem };
  }
  const cam = p.camera as Record<string, unknown> | undefined;
  if (
    !cam ||
    !isFiniteNumber(cam.x) ||
    !isFiniteNumber(cam.y) ||
    !isFiniteNumber(cam.zoom) ||
    cam.zoom <= 0
  ) {
    return { ok: false, error: 'Project has an invalid viewport.' };
  }
  if (p.unit !== undefined && !isUnit(p.unit)) {
    return { ok: false, error: `Project has an unknown measurement unit "${String(p.unit)}".` };
  }
  if (p.scale !== undefined && !isValidScale(p.scale)) {
    return { ok: false, error: 'Project has an invalid drawing scale.' };
  }
  return { ok: true, project: data as ProjectFile };
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function sanitizeTitle(title: string): string {
  const trimmed = title.trim();
  const base = trimmed.length > 0 ? trimmed : `techdraw-${timestamp()}`;
  // Strip characters that are unsafe or meaningless in a filename.
  return base.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || `techdraw-${timestamp()}`;
}

export function downloadProject(state: ProjectState): void {
  const json = serializeProject(state);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeTitle(state.title)}${PROJECT_FILE_EXT}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readProjectFile(file: File): Promise<ParseResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: 'Could not read the file.' };
  }
  return parseProject(text);
}
