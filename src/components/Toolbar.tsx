import type { Tool } from '../types';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'select', label: 'Select', title: 'Select & Move (V)' },
  { id: 'pencil', label: 'Pencil', title: 'Freehand draw (P)' },
  { id: 'rectangle', label: 'Rect', title: 'Rectangle (R)' },
  { id: 'ellipse', label: 'Ellipse', title: 'Ellipse (O)' },
  { id: 'line', label: 'Line', title: 'Line (L)' },
  { id: 'arrow', label: 'Arrow', title: 'Arrow (A)' },
  { id: 'dimension', label: 'Dim', title: 'Dimension annotation (D)' },
  { id: 'text', label: 'Text', title: 'Text (T)' },
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
          title={t.title}
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
