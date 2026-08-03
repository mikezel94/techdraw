export type Unit = 'px' | 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface UnitInfo {
  id: Unit;
  label: string;
  /** Decimal places used by dimension labels for this unit. */
  decimals: number;
}

export const UNITS: UnitInfo[] = [
  { id: 'px', label: 'px — pixels', decimals: 0 },
  { id: 'mm', label: 'mm — millimeters', decimals: 1 },
  { id: 'cm', label: 'cm — centimeters', decimals: 2 },
  { id: 'm', label: 'm — meters', decimals: 2 },
  { id: 'in', label: 'in — inches', decimals: 1 },
  { id: 'ft', label: 'ft — feet', decimals: 2 },
];

export interface MeasurementSettings {
  unit: Unit;
  /** Real-world units represented by one canvas pixel. */
  scale: number;
}

export const DEFAULT_MEASUREMENT: MeasurementSettings = { unit: 'px', scale: 1 };

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && UNITS.some((u) => u.id === value);
}

export function isValidScale(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function unitInfo(unit: Unit): UnitInfo {
  return UNITS.find((u) => u.id === unit) ?? UNITS[0];
}

// Pixels are the canvas reference frame, so their scale is always 1 px/px.
export function effectiveScale(measurement: MeasurementSettings): number {
  return measurement.unit === 'px' ? 1 : measurement.scale;
}

export function formatDistance(distancePx: number, measurement: MeasurementSettings): string {
  const info = unitInfo(measurement.unit);
  const value = distancePx * effectiveScale(measurement);
  return `${value.toFixed(info.decimals)} ${info.id}`;
}

export interface ScaleBarSpec {
  /** Bar length in screen pixels. */
  lengthPx: number;
  label: string;
}

const NICE_STEPS = [1, 2, 5];

// Picks a "nice" reference length (1/2/5 x 10^n units) whose on-screen size
// stays within the target band, so the bar stays readable at any zoom level.
export function scaleBarSpec(
  zoom: number,
  measurement: MeasurementSettings,
  maxScreenPx = 120,
): ScaleBarSpec {
  const scale = effectiveScale(measurement);
  const screenPxPerUnit = zoom / scale;

  let best = 0;
  for (let exp = -9; exp <= 12; exp++) {
    for (const step of NICE_STEPS) {
      const value = step * 10 ** exp;
      if (value * screenPxPerUnit <= maxScreenPx) best = value;
    }
  }
  if (best === 0) best = 10 ** -9;

  // Trim trailing zeros so the bar reads "50 mm", not "50.0 mm".
  const digits = Math.max(unitInfo(measurement.unit).decimals, best < 1 ? 6 : 0);
  const label = `${parseFloat(best.toFixed(digits))} ${measurement.unit}`;
  return { lengthPx: best * screenPxPerUnit, label };
}
