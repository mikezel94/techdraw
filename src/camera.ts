import type { Point } from './types';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10;

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export function screenToWorld(cam: Camera, sx: number, sy: number): Point {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

export function worldToScreen(cam: Camera, wx: number, wy: number): Point {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

export function zoomAtPoint(cam: Camera, screenX: number, screenY: number, newZoom: number): Camera {
  const z = clampZoom(newZoom);
  const world = screenToWorld(cam, screenX, screenY);
  return {
    x: screenX - world.x * z,
    y: screenY - world.y * z,
    zoom: z,
  };
}

export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(p: Point, gridSize: number): Point {
  return { x: snapToGrid(p.x, gridSize), y: snapToGrid(p.y, gridSize) };
}

export function getGridStep(gridSize: number, zoom: number): number {
  let step = gridSize;
  while (step * zoom < 8) step *= 5;
  while (step * zoom > 200) step /= 5;
  return step;
}
