interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export default function ZoomControls({ zoom, onZoomIn, onZoomOut, onResetZoom }: ZoomControlsProps) {
  return (
    <div className="zoom-controls">
      <button type="button" onClick={onZoomOut} title="Zoom out (-)" aria-label="Zoom out">
        −
      </button>
      <button
        type="button"
        className="zoom-level"
        onClick={onResetZoom}
        title="Reset zoom (0)"
        aria-label="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} title="Zoom in (+)" aria-label="Zoom in">
        +
      </button>
    </div>
  );
}
