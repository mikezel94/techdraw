import { useEffect, useRef } from 'react';

export const GITHUB_REPO_URL = 'https://github.com/mikezel94/techdraw';

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl / ⌘ + Z', action: 'Undo' },
  { keys: 'Ctrl / ⌘ + Shift + Z  or  Ctrl / ⌘ + Y', action: 'Redo' },
  { keys: 'Ctrl / ⌘ + A', action: 'Select all' },
  { keys: 'Ctrl / ⌘ + C', action: 'Copy selection' },
  { keys: 'Ctrl / ⌘ + V', action: 'Paste' },
  { keys: 'Ctrl / ⌘ + D', action: 'Duplicate selection' },
  { keys: 'Ctrl / ⌘ + G', action: 'Group selection' },
  { keys: 'Ctrl / ⌘ + Shift + G', action: 'Ungroup selection' },
  { keys: 'Delete / Backspace', action: 'Delete selection' },
  { keys: 'Escape', action: 'Clear selection' },
  { keys: '+ / =', action: 'Zoom in' },
  { keys: '-', action: 'Zoom out' },
  { keys: '0', action: 'Reset zoom' },
  { keys: 'Space + drag (or middle-click drag)', action: 'Pan the canvas' },
  { keys: 'Mouse wheel', action: 'Zoom at the cursor' },
];

interface HelpModalProps {
  onClose: () => void;
}

export default function HelpModal({ onClose }: HelpModalProps) {
  // The listener is registered once and reads onClose through a ref: if the
  // effect re-ran on every render, a mid-dispatch re-render (e.g. App's own
  // Escape handler updating state) would detach the listener while the same
  // keydown event is still propagating, and Escape would be skipped.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="modal-backdrop"
      data-testid="help-modal"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Help">
        <div className="modal-header">
          <h2>Help</h2>
          <button
            type="button"
            aria-label="Close help"
            data-testid="help-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <h3>Keyboard shortcuts</h3>
        <table className="shortcut-table">
          <thead>
            <tr>
              <th>Keys</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd>{s.keys}</kbd>
                </td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Tips</h3>
        <ul className="help-tips">
          <li>Double-click a shape to edit its label.</li>
          <li>
            Select a box and use the blue <strong>+</strong> chip to extend it into a connected
            box.
          </li>
          <li>Drag an arrow&apos;s midpoint handle to bend it; double-click to straighten it.</li>
          <li>
            Pick a measurement unit and scale in the bottom-right panel: dimension labels and the
            scale bar show real-world sizes.
          </li>
        </ul>
        <p className="help-links">
          Source, issues and documentation:{' '}
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" data-testid="help-repo-link">
            {GITHUB_REPO_URL}
          </a>
        </p>
      </div>
    </div>
  );
}
