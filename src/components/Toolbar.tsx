import type { Tool } from '../types';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pencil', label: 'Pencil' },
  { id: 'rectangle', label: 'Rect' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'line', label: 'Line' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'text', label: 'Text' },
];

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  elementCount: number;
}

export default function Toolbar({
  tool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  elementCount,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === tool ? 'active' : ''}
          onClick={() => onToolChange(t.id)}
        >
          {t.label}
        </button>
      ))}
      <div className="divider" />
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
      <div className="divider" />
      <span className="status">
        Elements: <span data-testid="element-count">{elementCount}</span>
      </span>
    </div>
  );
}
