interface GridControlsProps {
  gridEnabled: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onOpenHelp: () => void;
}

export default function GridControls({
  gridEnabled,
  snapEnabled,
  onToggleGrid,
  onToggleSnap,
  onOpenHelp,
}: GridControlsProps) {
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
