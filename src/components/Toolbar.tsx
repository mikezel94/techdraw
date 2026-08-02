import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Tool } from '../types';
import { PROJECT_FILE_EXT } from '../lib/projectFile';

const TOOLS: { id: Tool; name: string; title: string }[] = [
  { id: 'select', name: 'Select', title: 'Select & Move (V)' },
  { id: 'pencil', name: 'Pencil', title: 'Freehand draw (P)' },
  { id: 'rectangle', name: 'Rect', title: 'Rectangle (R)' },
  { id: 'ellipse', name: 'Ellipse', title: 'Ellipse (O)' },
  { id: 'line', name: 'Line', title: 'Line (L)' },
  { id: 'arrow', name: 'Arrow', title: 'Arrow (A)' },
  { id: 'dimension', name: 'Dim', title: 'Dimension annotation (D)' },
  { id: 'text', name: 'Text', title: 'Text (T)' },
];

const TOOL_ICONS: Record<Tool, ReactNode> = {
  select: <path d="M4 3l7.07 16.97 2.51-7.39 7.39-2.51L4 3z" />,
  pencil: <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  rectangle: <rect x="3.5" y="6" width="17" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  line: <line x1="5" y1="19" x2="19" y2="5" />,
  arrow: (
    <>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="8 7 17 7 17 16" />
    </>
  ),
  dimension: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="7.5" x2="4" y2="16.5" />
      <line x1="20" y1="7.5" x2="20" y2="16.5" />
    </>
  ),
  text: (
    <>
      <polyline points="5 7 5 4 19 4 19 7" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="9" y1="20" x2="15" y2="20" />
    </>
  ),
};

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export interface PngExportOptions {
  scale: number;
  transparent: boolean;
}

interface ExportMenuProps {
  elementCount: number;
  onExportPng: (opts: PngExportOptions) => void;
  onExportSvg: () => void;
}

function ExportMenu({ elementCount, onExportPng, onExportSvg }: ExportMenuProps) {
  const items: { testId: string; label: string; run: () => void }[] = [
    { testId: 'export-png-2x', label: 'Download PNG (2x)', run: () => onExportPng({ scale: 2, transparent: false }) },
    { testId: 'export-png-1x', label: 'Download PNG (1x)', run: () => onExportPng({ scale: 1, transparent: false }) },
    { testId: 'export-png-transparent', label: 'Download PNG (2x, transparent)', run: () => onExportPng({ scale: 2, transparent: true }) },
    { testId: 'export-svg', label: 'Download SVG', run: () => onExportSvg() },
  ];
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const disabled = elementCount === 0;

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Export drawing"
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="export-button"
      >
        <ToolIcon>
          <path d="M12 3v12" />
          <polyline points="8 11 12 15 16 11" />
          <path d="M5 21h14" />
        </ToolIcon>
      </button>
      {open && (
        <div className="export-menu-items" role="menu">
          {items.map((item) => (
            <button
              key={item.testId}
              type="button"
              role="menuitem"
              data-testid={item.testId}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  elementCount: number;
  onNewDrawing: () => void;
  onSaveProject: () => void;
  onOpenProjectFile: (file: File) => void;
  onExportPng: (opts: PngExportOptions) => void;
  onExportSvg: () => void;
}

export default function Toolbar({
  tool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  elementCount,
  onNewDrawing,
  onSaveProject,
  onOpenProjectFile,
  onExportPng,
  onExportSvg,
}: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={t.id === tool ? 'active' : ''}
          title={t.title}
          aria-label={t.name}
          onClick={() => onToolChange(t.id)}
        >
          <ToolIcon>{TOOL_ICONS[t.id]}</ToolIcon>
        </button>
      ))}
      <div className="divider" />
      <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <ToolIcon>
          <polyline points="9 14 4 9 9 4" />
          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
        </ToolIcon>
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
      >
        <ToolIcon>
          <polyline points="15 14 20 9 15 4" />
          <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
        </ToolIcon>
      </button>
      <div className="divider" />
      <button
        type="button"
        onClick={onNewDrawing}
        title="New drawing (clears canvas and saved copy)"
        aria-label="New drawing"
        data-testid="new-drawing"
      >
        <ToolIcon>
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <polyline points="14 3 14 8 19 8" />
          <line x1="12" y1="12" x2="12" y2="17" />
          <line x1="9.5" y1="14.5" x2="14.5" y2="14.5" />
        </ToolIcon>
      </button>
      <button
        type="button"
        onClick={onSaveProject}
        title="Save project as .tdraw file"
        aria-label="Save project"
        data-testid="save-project"
      >
        <ToolIcon>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </ToolIcon>
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Open a .tdraw project file"
        aria-label="Open project"
        data-testid="open-project"
      >
        <ToolIcon>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </ToolIcon>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`${PROJECT_FILE_EXT},application/json`}
        data-testid="open-project-input"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) onOpenProjectFile(file);
        }}
      />
      <div className="divider" />
      <ExportMenu elementCount={elementCount} onExportPng={onExportPng} onExportSvg={onExportSvg} />
      <div className="divider" />
      <span className="status">
        Elements: <span data-testid="element-count">{elementCount}</span>
      </span>
    </div>
  );
}
