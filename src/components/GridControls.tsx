import { useEffect, useState } from 'react';
import type { Unit } from '../lib/units';
import { UNITS, isValidScale } from '../lib/units';

interface GridControlsProps {
  gridEnabled: boolean;
  snapEnabled: boolean;
  unit: Unit;
  scale: number;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onUnitChange: (unit: Unit) => void;
  onScaleChange: (scale: number) => void;
  onOpenHelp: () => void;
}

export default function GridControls({
  gridEnabled,
  snapEnabled,
  unit,
  scale,
  onToggleGrid,
  onToggleSnap,
  onUnitChange,
  onScaleChange,
  onOpenHelp,
}: GridControlsProps) {
  // Free-typing a number ("", "0.") must not fight the controlled value, so
  // the input keeps a draft and only forwards valid numbers upward.
  const [scaleDraft, setScaleDraft] = useState(() => String(scale));
  useEffect(() => {
    setScaleDraft(String(scale));
  }, [scale]);

  return (
    <div className="grid-controls">
      <button
        type="button"
        className={gridEnabled ? 'active' : ''}
        onClick={onToggleGrid}
        title="Toggle grid"
      >
        Grid
      </button>
      <button
        type="button"
        className={snapEnabled ? 'active' : ''}
        onClick={onToggleSnap}
        title="Toggle snap to grid"
      >
        Snap
      </button>
      <div className="grid-controls-divider" />
      <select
        data-testid="unit-select"
        aria-label="Measurement unit"
        title="Measurement unit"
        value={unit}
        onChange={(e) => onUnitChange(e.currentTarget.value as Unit)}
      >
        {UNITS.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
      <label className="scale-input" title="Real-world units per canvas pixel">
        <span>1 px =</span>
        <input
          data-testid="scale-input"
          type="number"
          min="0"
          step="any"
          value={scaleDraft}
          disabled={unit === 'px'}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            setScaleDraft(raw);
            const parsed = Number(raw);
            if (isValidScale(parsed)) onScaleChange(parsed);
          }}
          onBlur={() => {
            const parsed = Number(scaleDraft);
            if (!isValidScale(parsed)) setScaleDraft(String(scale));
          }}
        />
        <span>{unit}</span>
      </label>
      <div className="grid-controls-divider" />
      <button
        type="button"
        className="help-button"
        onClick={onOpenHelp}
        title="Help & keyboard shortcuts"
        aria-label="Help"
        data-testid="help-button"
      >
        ?
      </button>
    </div>
  );
}
