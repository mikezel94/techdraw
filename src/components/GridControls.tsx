interface GridControlsProps {
  gridEnabled: boolean;
  snapEnabled: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
}

export default function GridControls({ gridEnabled, snapEnabled, onToggleGrid, onToggleSnap }: GridControlsProps) {
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
    </div>
  );
}
