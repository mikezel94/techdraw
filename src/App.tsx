import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Canvas, { bboxOf } from './components/Canvas';
import Toolbar from './components/Toolbar';
import ZoomControls from './components/ZoomControls';
import GridControls from './components/GridControls';
import OnboardingOverlay from './components/OnboardingOverlay';
import HelpModal from './components/HelpModal';
import MobileNotice from './components/MobileNotice';
import type {
  ArrowBinding,
  ArrowElement,
  Element,
  EllipseElement,
  FontScale,
  RectElement,
  TextElement,
  Tool,
} from './types';
import { genId, genGroupId } from './types';
import type { Camera } from './lib/camera';
import { DEFAULT_CAMERA, clampZoom } from './lib/camera';
import { fitLabelFontSize, FONT_SCALES, LABEL_FONT_FAMILY } from './lib/labelFont';
import {
  clearProject,
  hasDismissedMobileNotice,
  hasSeenOnboarding,
  loadProject,
  markMobileNoticeDismissed,
  markOnboardingSeen,
  saveProject,
} from './lib/storage';
import { exportPng, exportSvg } from './lib/export';
import { downloadProject, readProjectFile } from './lib/projectFile';
import { loadExampleDrawing } from './lib/exampleDrawing';
import type { ProjectFile } from './lib/projectFile';
import type { PngExportOptions } from './components/Toolbar';
import type { MeasurementSettings, Unit } from './lib/units';
import { DEFAULT_MEASUREMENT, isUnit, isValidScale } from './lib/units';

const TEXT_FONT = '20px sans-serif';
const TEXT_FONT_SIZE = 20;
const INK_COLOR = '#1e1e1e';
const WHITE_COLOR = '#ffffff';
const SHAPE_COLORS = ['#dc2626', '#d97706', '#16a34a', '#0d9488', '#2563eb', '#7c3aed', '#db2777'];
const EXTEND_GAP = 100;
const AUTOSAVE_DEBOUNCE_MS = 800;
const SAVE_FLASH_MS = 2000;
const DELETE_CONFIRM_THRESHOLD = 10;
const PASTE_OFFSET = 20;
// "A" glyph sizes used on the S/M/L palette buttons.
const FONT_SCALE_BUTTON_SIZES: Record<FontScale, number> = { small: 10, medium: 13, large: 16 };
const MOBILE_NOTICE_MAX_WIDTH = 768;

function translateElement(el: Element, dx: number, dy: number): Element {
  switch (el.type) {
    case 'pencil':
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'rect':
    case 'ellipse':
    case 'text':
      return { ...el, x: el.x + dx, y: el.y + dy };
    case 'line':
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case 'dimension':
      return {
        ...el,
        start: { ...el.start, x: el.start.x + dx, y: el.start.y + dy },
        end: { ...el.end, x: el.end.x + dx, y: el.end.y + dy },
      };
  }
}

// Deep-copies elements for paste/duplicate: fresh ids, an (dx, dy) offset, and
// bindings/groups remapped so relationships inside the copied set survive while
// references to elements left behind are dropped.
function cloneElements(els: Element[], dx: number, dy: number): Element[] {
  const idMap = new Map<string, string>();
  for (const e of els) idMap.set(e.id, genId());
  const groupMap = new Map<string, string>();
  return els.map((orig) => {
    let clone: Element = { ...translateElement(orig, dx, dy), id: idMap.get(orig.id)! };
    if (clone.groupId) {
      let gid = groupMap.get(clone.groupId);
      if (!gid) {
        gid = genGroupId();
        groupMap.set(clone.groupId, gid);
      }
      clone = { ...clone, groupId: gid };
    }
    if (clone.type === 'arrow') {
      const a = { ...clone };
      if (a.startBinding) {
        const target = idMap.get(a.startBinding.elementId);
        if (target) a.startBinding = { elementId: target };
        else delete a.startBinding;
      }
      if (a.endBinding) {
        const target = idMap.get(a.endBinding.elementId);
        if (target) a.endBinding = { elementId: target };
        else delete a.endBinding;
      }
      clone = a;
    }
    if (clone.type === 'dimension') {
      const d = { ...clone };
      if (d.start.binding) {
        const target = idMap.get(d.start.binding.elementId);
        d.start = target
          ? { ...d.start, binding: { elementId: target } }
          : { x: d.start.x, y: d.start.y };
      }
      if (d.end.binding) {
        const target = idMap.get(d.end.binding.elementId);
        d.end = target
          ? { ...d.end, binding: { elementId: target } }
          : { x: d.end.x, y: d.end.y };
      }
      clone = d;
    }
    return clone;
  });
}

const measureCtx = document.createElement('canvas').getContext('2d');

function measureText(text: string): { width: number; height: number } {
  if (!measureCtx) {
    return { width: text.length * 10, height: 20 };
  }
  measureCtx.font = TEXT_FONT;
  const metrics = measureCtx.measureText(text);
  const height = (metrics.actualBoundingBoxAscent || 16) + (metrics.actualBoundingBoxDescent || 4);
  return { width: metrics.width, height };
}

export default function App() {
  const [restored] = useState(loadProject);
  const [elements, setElements] = useState<Element[]>(() => restored?.elements ?? []);
  const [draft, setDraft] = useState<Element | null>(null);
  const [tool, setTool] = useState<Tool>('pencil');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<Element[][]>([]);
  const [future, setFuture] = useState<Element[][]>([]);
  const [editing, setEditing] = useState<{
    x: number;
    y: number;
    shapeId?: string;
    isShapeLabel?: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [camera, setCamera] = useState<Camera>(() => restored?.camera ?? DEFAULT_CAMERA);
  const [gridEnabled, setGridEnabled] = useState(() => restored?.gridEnabled ?? true);
  const [snapEnabled, setSnapEnabled] = useState(() => restored?.snapEnabled ?? true);
  const [unit, setUnit] = useState<Unit>(() =>
    restored && isUnit(restored.unit) ? restored.unit : DEFAULT_MEASUREMENT.unit,
  );
  const [scale, setScale] = useState<number>(() =>
    restored && isValidScale(restored.scale) ? restored.scale : DEFAULT_MEASUREMENT.scale,
  );
  const [gridSize] = useState(20);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [extendHover, setExtendHover] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(() => restored?.savedAt ?? null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [title, setTitle] = useState('Untitled');
  const [fileError, setFileError] = useState<string | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding());
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNoticeOpen, setMobileNoticeOpen] = useState(
    () => window.innerWidth < MOBILE_NOTICE_MAX_WIDTH && !hasDismissedMobileNotice(),
  );
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const dragBaseRef = useRef<Element[] | null>(null);
  const dragSelectedRef = useRef<Set<string>>(new Set());
  const textCancelledRef = useRef(false);
  const textReadyRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const [paletteHalfW, setPaletteHalfW] = useState(0);
  const skipFirstSaveRef = useRef(true);
  const clipboardRef = useRef<Element[] | null>(null);

  const pushHistory = (snapshot: Element[]) => {
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  };

  // Selecting or dragging any member of a group pulls in the whole group, so
  // grouped elements always move and select as one unit.
  const expandGroups = (ids: Set<string>): Set<string> => {
    if (ids.size === 0) return ids;
    const groupIds = new Set<string>();
    for (const e of elements) {
      if (ids.has(e.id) && e.groupId) groupIds.add(e.groupId);
    }
    if (groupIds.size === 0) return ids;
    const next = new Set(ids);
    for (const e of elements) {
      if (e.groupId && groupIds.has(e.groupId)) next.add(e.id);
    }
    return next;
  };

  const selectIds = (ids: Set<string>) => {
    setSelectedIds(expandGroups(ids));
  };

  const commitElement = (el: Element) => {
    pushHistory(elements);
    setElements([...elements, el]);
    setDraft(null);
    setExtendHover(false);
    // Tools are one-shot: drop back to select mode with the new element selected.
    setTool('select');
    setSelectedIds(new Set([el.id]));
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([...future, elements]);
    setElements(previous);
    setSelectedIds(new Set());
    setDraft(null);
    setExtendHover(false);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast([...past, elements]);
    setElements(next);
    setSelectedIds(new Set());
    setDraft(null);
    setExtendHover(false);
  };

  // Debounced auto-save: any committed change to the scene, camera, or grid
  // toggles is persisted shortly after the last edit settles.
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (elements.length === 0) {
        clearProject();
        return;
      }
      const result = saveProject({ elements, camera, gridEnabled, snapEnabled, unit, scale });
      if (result.ok) {
        setStorageWarning(null);
        setSaveFlash(true);
      } else {
        setStorageWarning(
          result.reason === 'quota'
            ? 'Storage is full — your changes could not be saved.'
            : 'Local storage is unavailable — your changes will be lost on refresh.',
        );
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [elements, camera, gridEnabled, snapEnabled, unit, scale]);

  useEffect(() => {
    if (!saveFlash) return;
    const timer = setTimeout(() => setSaveFlash(false), SAVE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [saveFlash]);

  const newDrawing = () => {
    if (!window.confirm('Start a new drawing? This clears the canvas and the saved copy.')) return;
    clearProject();
    setPast([]);
    setFuture([]);
    setElements([]);
    setSelectedIds(new Set());
    setDraft(null);
    setEditing(null);
    setCamera(DEFAULT_CAMERA);
    setGridEnabled(true);
    setSnapEnabled(true);
    setUnit(DEFAULT_MEASUREMENT.unit);
    setScale(DEFAULT_MEASUREMENT.scale);
    setTool('pencil');
    setTitle('Untitled');
    setRestoredAt(null);
    setStorageWarning(null);
    setFileError(null);
  };

  const measurement: MeasurementSettings = { unit, scale };

  const handleExportPng = ({ scale: exportScale, transparent }: PngExportOptions) => {
    if (elements.length === 0) return;
    exportPng(elements, exportScale, transparent, measurement);
  };

  const handleExportSvg = () => {
    if (elements.length === 0) return;
    exportSvg(elements, measurement);
  };

  const handleSaveProject = () => {
    downloadProject({ title, elements, camera, gridEnabled, snapEnabled, unit, scale });
  };

  // Replaces the whole scene with a parsed project file. Shared by the Open
  // button and canvas drag-and-drop.
  const applyLoadedProject = (project: ProjectFile) => {
    setPast([]);
    setFuture([]);
    setElements(project.elements);
    setSelectedIds(new Set());
    setDraft(null);
    setEditing(null);
    setCamera(project.camera);
    setGridEnabled(project.gridEnabled);
    setSnapEnabled(project.snapEnabled);
    setUnit(project.unit ?? DEFAULT_MEASUREMENT.unit);
    setScale(project.scale ?? DEFAULT_MEASUREMENT.scale);
    setTool('select');
    setTitle(project.title);
    setRestoredAt(null);
    setStorageWarning(null);
    setFileError(null);
  };

  const openProjectFile = useCallback(async (file: File) => {
    const result = await readProjectFile(file);
    if (result.ok) {
      applyLoadedProject(result.project);
    } else {
      setFileError(`Could not open "${file.name}": ${result.error}`);
    }
  }, []);

  const openProjectFileRef = useRef(openProjectFile);
  openProjectFileRef.current = openProjectFile;

  const loadExample = useCallback(async () => {
    const result = await loadExampleDrawing();
    if (result.ok) {
      applyLoadedProject(result.project);
    } else {
      setFileError(`Could not load the example drawing: ${result.error}`);
    }
  }, []);

  const finishOnboarding = (loadExampleOnFinish: boolean) => {
    markOnboardingSeen();
    setOnboardingOpen(false);
    if (loadExampleOnFinish) void loadExample();
  };

  const dismissMobileNotice = () => {
    markMobileNoticeDismissed();
    setMobileNoticeOpen(false);
  };

  // Drag-and-drop a `.tdraw` file anywhere on the canvas to open it.
  useEffect(() => {
    const isTdraw = (file: File) =>
      file.name.toLowerCase().endsWith('.tdraw') || file.type === 'application/json';
    const onDragOver = (ev: DragEvent) => {
      if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault();
    };
    const onDrop = (ev: DragEvent) => {
      const files = ev.dataTransfer?.files;
      if (!files || files.length === 0) return;
      ev.preventDefault();
      const file = files[0];
      if (!isTdraw(file)) {
        setFileError(`Could not open "${file.name}": not a .tdraw project file.`);
        return;
      }
      void openProjectFileRef.current(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const deleteSelection = () => {
    if (selectedIds.size === 0) return;
    // Dimensions measure their parent shape, so they die with it; arrows only
    // lose the binding on the deleted end and stay on the canvas.
    const dependentDimensionIds = elements
      .filter(
        (e) =>
          e.type === 'dimension' &&
          !selectedIds.has(e.id) &&
          ((e.start.binding && selectedIds.has(e.start.binding.elementId)) ||
            (e.end.binding && selectedIds.has(e.end.binding.elementId))),
      )
      .map((e) => e.id);
    const deletedIds = new Set([...selectedIds, ...dependentDimensionIds]);
    if (
      deletedIds.size > DELETE_CONFIRM_THRESHOLD &&
      !window.confirm(`Delete ${deletedIds.size} elements? You can undo this with Ctrl+Z.`)
    ) {
      return;
    }
    pushHistory(elements);
    setElements(
      elements
        .filter((e) => !deletedIds.has(e.id))
        .map((e) => {
          if (e.type !== 'arrow') return e;
          const cleared = { ...e };
          let changed = false;
          if (cleared.startBinding && deletedIds.has(cleared.startBinding.elementId)) {
            delete cleared.startBinding;
            changed = true;
          }
          if (cleared.endBinding && deletedIds.has(cleared.endBinding.elementId)) {
            delete cleared.endBinding;
            changed = true;
          }
          return changed ? cleared : e;
        }),
    );
    setSelectedIds(new Set());
    setExtendHover(false);
  };

  const copySelection = () => {
    if (selectedIds.size === 0) return;
    clipboardRef.current = elements.filter((e) => selectedIds.has(e.id));
  };

  const pasteClipboard = () => {
    const clip = clipboardRef.current;
    if (!clip || clip.length === 0) return;
    const clones = cloneElements(clip, PASTE_OFFSET, PASTE_OFFSET);
    pushHistory(elements);
    setElements([...elements, ...clones]);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  };

  const duplicateSelection = () => {
    if (selectedIds.size === 0) return;
    const clones = cloneElements(
      elements.filter((e) => selectedIds.has(e.id)),
      PASTE_OFFSET,
      PASTE_OFFSET,
    );
    pushHistory(elements);
    setElements([...elements, ...clones]);
    setSelectedIds(new Set(clones.map((c) => c.id)));
  };

  const groupSelection = () => {
    if (selectedIds.size < 2) return;
    const groupId = genGroupId();
    pushHistory(elements);
    setElements(
      elements.map((e) => (selectedIds.has(e.id) ? { ...e, groupId } : e)),
    );
  };

  const ungroupSelection = () => {
    if (!elements.some((e) => selectedIds.has(e.id) && e.groupId)) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || !e.groupId) return e;
        const cleared = { ...e };
        delete cleared.groupId;
        return cleared;
      }),
    );
  };

  const handleDragStart = (ids: string[]) => {
    dragBaseRef.current = elements;
    dragSelectedRef.current = expandGroups(new Set(ids));
  };

  const handleDragMove = (dx: number, dy: number) => {
    const base = dragBaseRef.current;
    const ids = dragSelectedRef.current;
    if (!base || ids.size === 0) return;
    setElements(
      base.map((e) => {
        if (ids.has(e.id)) {
          const moved = translateElement(e, dx, dy);
          if (moved.type === 'arrow') {
            const detached = { ...moved };
            delete detached.startBinding;
            delete detached.endBinding;
            return detached;
          }
          return moved;
        }
        if (e.type === 'arrow') {
          let a = e;
          if (a.startBinding && ids.has(a.startBinding.elementId)) {
            a = { ...a, x1: a.x1 + dx, y1: a.y1 + dy };
          }
          if (a.endBinding && ids.has(a.endBinding.elementId)) {
            a = { ...a, x2: a.x2 + dx, y2: a.y2 + dy };
          }
          return a;
        }
        return e;
      }),
    );
  };

  const handleEndpointDragMove = (
    id: string,
    end: 'start' | 'end',
    point: { x: number; y: number },
    binding: ArrowBinding | null,
  ) => {
    const base = dragBaseRef.current;
    if (!base) return;
    setElements(
      base.map((e) => {
        if (e.id !== id || e.type !== 'arrow') return e;
        const updated = { ...e };
        if (end === 'start') {
          updated.x1 = point.x;
          updated.y1 = point.y;
          if (binding) updated.startBinding = binding;
          else delete updated.startBinding;
        } else {
          updated.x2 = point.x;
          updated.y2 = point.y;
          if (binding) updated.endBinding = binding;
          else delete updated.endBinding;
        }
        return updated;
      }),
    );
  };

  const handleBendDragMove = (id: string, bend: number) => {
    const base = dragBaseRef.current;
    if (!base) return;
    setElements(
      base.map((e) => (e.id === id && e.type === 'arrow' ? { ...e, bend } : e)),
    );
  };

  const handleBendReset = (id: string) => {
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (e.id !== id || e.type !== 'arrow') return e;
        const cleared = { ...e };
        delete cleared.bend;
        return cleared;
      }),
    );
  };

  const handleDragEnd = (moved: boolean) => {
    if (moved && dragBaseRef.current) {
      pushHistory(dragBaseRef.current);
    }
    dragBaseRef.current = null;
    dragSelectedRef.current = new Set();
  };

  const handleTextPlace = (x: number, y: number) => {
    textCancelledRef.current = false;
    textReadyRef.current = false;
    setEditValue('');
    setEditing({ x, y });
  };

  const handleEditLabel = (shapeId: string, x: number, y: number) => {
    textCancelledRef.current = false;
    textReadyRef.current = false;
    const shape = elements.find((e) => e.id === shapeId);
    setEditValue(shape && 'text' in shape && shape.text ? shape.text : '');
    setEditing({ x, y, shapeId, isShapeLabel: true });
  };

  // Delay focus so the browser's click-sequence focus management
  // (pointerup / click stealing focus back to the canvas) settles first.
  useEffect(() => {
    if (!editing) return;
    const timer = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
      textReadyRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [editing]);

  const commitText = () => {
    if (!editing) return;
    const text = editValue.replace(/\n/g, ' ').trim();
    if (editing.shapeId) {
      if (text.length > 0) {
        pushHistory(elements);
        setElements(
          elements.map((e) => {
            if (e.id !== editing.shapeId) return e;
            if (e.type === 'rect' || e.type === 'ellipse') return { ...e, text };
            if (e.type === 'text') {
              const { width, height } = measureText(text);
              return { ...e, text, width, height };
            }
            return e;
          }),
        );
      } else {
        pushHistory(elements);
        setElements(
          elements
            .map((e) => {
              if (e.id !== editing.shapeId) return e;
              if (e.type === 'rect' || e.type === 'ellipse') {
                const cleared = { ...e };
                delete cleared.text;
                return cleared;
              }
              return e;
            })
            .filter((e) => e.type !== 'text' || e.id !== editing.shapeId),
        );
      }
    } else if (text.length > 0) {
      const { width, height } = measureText(text);
      const el: TextElement = {
        id: genId(),
        type: 'text',
        x: editing.x,
        y: editing.y,
        text,
        width,
        height,
      };
      commitElement(el);
    }
    setTool('select');
    setEditing(null);
  };

  const cancelText = () => {
    textCancelledRef.current = true;
    setTool('select');
    setEditing(null);
  };

  const handleCameraChange = useCallback((cam: Camera) => {
    setCamera(cam);
  }, []);

  const zoomIn = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newZoom = clampZoom(cam.zoom * 1.25);
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
    });
  };

  const zoomOut = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const newZoom = clampZoom(cam.zoom / 1.25);
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx * newZoom, y: cy - wy * newZoom, zoom: newZoom };
    });
  };

  const resetZoom = () => {
    setCamera((cam) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const wx = (cx - cam.x) / cam.zoom;
      const wy = (cy - cam.y) / cam.zoom;
      return { x: cx - wx, y: cy - wy, zoom: 1 };
    });
  };

  // The extend suggestion targets a lone selected box.
  const selectedElement =
    selectedIds.size === 1 ? elements.find((e) => e.id === [...selectedIds][0]) : undefined;
  const extendRect =
    selectedElement && selectedElement.type === 'rect' && !draft && !editing
      ? selectedElement
      : undefined;

  const extendBox = () => {
    const source = extendRect;
    if (!source) return;
    pushHistory(elements);
    const midY = source.y + source.height / 2;
    const next: RectElement = {
      id: genId(),
      type: 'rect',
      x: source.x + source.width + EXTEND_GAP,
      y: source.y,
      width: source.width,
      height: source.height,
      ...(source.color ? { color: source.color } : {}),
      ...(source.fill ? { fill: source.fill } : {}),
      ...(source.textColor ? { textColor: source.textColor } : {}),
    };
    const connector: ArrowElement = {
      id: genId(),
      type: 'arrow',
      x1: source.x + source.width,
      y1: midY,
      x2: next.x,
      y2: midY,
      startBinding: { elementId: source.id },
      endBinding: { elementId: next.id },
    };
    setElements([...elements, next, connector]);
    // Selecting the new box moves the suggestion onto it, so chaining continues.
    setSelectedIds(new Set([next.id]));
    setExtendHover(false);
  };

  const applyColor = (color: string | null) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        if (color) return { ...e, color };
        const cleared = { ...e };
        delete cleared.color;
        return cleared;
      }),
    );
  };

  const applyFill = (fill: string | null) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        if (fill) return { ...e, fill };
        const cleared = { ...e };
        delete cleared.fill;
        return cleared;
      }),
    );
  };

  const applyTextColor = (textColor: string | null) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        if (textColor) return { ...e, textColor };
        const cleared = { ...e };
        delete cleared.textColor;
        return cleared;
      }),
    );
  };

  const applyFontScale = (scale: FontScale) => {
    if (selectedIds.size === 0) return;
    pushHistory(elements);
    setElements(
      elements.map((e) => {
        if (!selectedIds.has(e.id) || (e.type !== 'rect' && e.type !== 'ellipse')) return e;
        return { ...e, fontScale: scale };
      }),
    );
  };

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT')
      ) {
        return;
      }

      if (ev.code === 'Space') {
        ev.preventDefault();
        setSpaceHeld(true);
        return;
      }

      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (mod && ev.key.toLowerCase() === 'a') {
        ev.preventDefault();
        setSelectedIds(new Set(elements.map((e) => e.id)));
      } else if (mod && ev.key.toLowerCase() === 'c') {
        ev.preventDefault();
        copySelection();
      } else if (mod && ev.key.toLowerCase() === 'v') {
        ev.preventDefault();
        pasteClipboard();
      } else if (mod && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        duplicateSelection();
      } else if (mod && ev.key.toLowerCase() === 'g') {
        ev.preventDefault();
        if (ev.shiftKey) ungroupSelection();
        else groupSelection();
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        deleteSelection();
      } else if (ev.key === 'Escape') {
        // Guard the state update: a no-op setState here would still trigger a
        // re-render mid keydown-dispatch, which can detach other components'
        // window keydown listeners before this event finishes propagating.
        if (selectedIds.size > 0) setSelectedIds(new Set());
      } else if (ev.key === '=' || ev.key === '+') {
        zoomIn();
      } else if (ev.key === '-') {
        zoomOut();
      } else if (ev.key === '0') {
        resetZoom();
      }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') {
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // Convert editing position (world) to screen for the textarea overlay
  const editingScreen = editing
    ? { x: editing.x * camera.zoom + camera.x, y: editing.y * camera.zoom + camera.y }
    : null;

  // The label editor mirrors the exact size the canvas will render, so what
  // you see while typing is what you get after committing.
  const editingShape =
    editing && editing.shapeId ? elements.find((e) => e.id === editing.shapeId) : undefined;
  let textareaStyle: CSSProperties = { left: editingScreen?.x, top: editingScreen?.y };
  if (editingShape && (editingShape.type === 'rect' || editingShape.type === 'ellipse')) {
    const size = fitLabelFontSize(
      editValue || 'Text',
      editingShape.width,
      editingShape.height,
      editingShape.fontScale,
      editingShape.type === 'ellipse',
    );
    textareaStyle = {
      ...textareaStyle,
      fontSize: size * camera.zoom,
      width: editingShape.width * camera.zoom,
      minWidth: 0,
      fontFamily: LABEL_FONT_FAMILY,
    };
  } else {
    textareaStyle = { ...textareaStyle, fontSize: TEXT_FONT_SIZE * camera.zoom };
  }

  // Floating palette above the selection: color/font controls when everything
  // selected is a shape, plus a delete action for any selection.
  const selectedElements = elements.filter((e) => selectedIds.has(e.id));
  const colorableSelected = selectedElements.filter(
    (e): e is RectElement | EllipseElement => e.type === 'rect' || e.type === 'ellipse',
  );
  const allColorable =
    selectedElements.length > 0 && colorableSelected.length === selectedElements.length;
  const paletteVisible = !editing && selectedElements.length > 0;
  let paletteBox: { x: number; y: number; w: number; h: number } | null = null;
  if (paletteVisible) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of selectedElements) {
      const b = bboxOf(e, elements);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    paletteBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  const selectedColors = new Set(colorableSelected.map((e) => e.color ?? null));
  const currentColor = selectedColors.size === 1 ? [...selectedColors][0] : undefined;
  const selectedFills = new Set(colorableSelected.map((e) => e.fill ?? null));
  const currentFill = selectedFills.size === 1 ? [...selectedFills][0] : undefined;
  const selectedTextColors = new Set(colorableSelected.map((e) => e.textColor ?? null));
  const currentTextColor = selectedTextColors.size === 1 ? [...selectedTextColors][0] : undefined;
  const selectedScales = new Set(colorableSelected.map((e) => e.fontScale ?? 'medium'));
  const currentScale = selectedScales.size === 1 ? [...selectedScales][0] : undefined;
  let paletteScreen: { left: number; top: number; below: boolean } | null = null;
  if (paletteBox) {
    const topEdge = paletteBox.y * camera.zoom + camera.y;
    const below = topEdge < 64;
    // Keep the (centered) palette inside the viewport when the selection
    // sits near a screen edge — otherwise its swatches clip off-screen.
    const centerX = (paletteBox.x + paletteBox.w / 2) * camera.zoom + camera.x;
    const margin = 8;
    const left = Math.max(
      paletteHalfW + margin,
      Math.min(centerX, window.innerWidth - paletteHalfW - margin),
    );
    paletteScreen = {
      left,
      top: below ? (paletteBox.y + paletteBox.h) * camera.zoom + camera.y + 12 : topEdge - 12,
      below,
    };
  }

  // Measure the palette so its centered position can be clamped to the viewport.
  useLayoutEffect(() => {
    if (!paletteVisible) {
      setPaletteHalfW(0);
      return;
    }
    const el = paletteRef.current;
    if (el) setPaletteHalfW(el.offsetWidth / 2);
  }, [paletteVisible, allColorable]);

  // Screen positions for the "extend to next box" suggestion
  const chipVisible = !!extendRect;
  const chipScreen =
    chipVisible && extendRect
      ? {
          left: (extendRect.x + extendRect.width) * camera.zoom + camera.x + 20,
          top: (extendRect.y + extendRect.height / 2) * camera.zoom + camera.y,
        }
      : null;
  const extendPreview =
    chipVisible && extendHover && extendRect
      ? {
          x: extendRect.x + extendRect.width + EXTEND_GAP,
          y: extendRect.y,
          width: extendRect.width,
          height: extendRect.height,
          fromX: extendRect.x + extendRect.width,
          fromY: extendRect.y + extendRect.height / 2,
          toX: extendRect.x + extendRect.width + EXTEND_GAP,
          toY: extendRect.y + extendRect.height / 2,
        }
      : null;

  return (
    <>
      <Canvas
        elements={elements}
        draft={draft}
        tool={tool}
        selectedIds={selectedIds}
        camera={camera}
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        gridSize={gridSize}
        spaceHeld={spaceHeld}
        extendPreview={extendPreview}
        measurement={measurement}
        onDraftChange={setDraft}
        onCommit={commitElement}
        onSelect={selectIds}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onEndpointDragMove={handleEndpointDragMove}
        onBendDragMove={handleBendDragMove}
        onBendReset={handleBendReset}
        onTextPlace={handleTextPlace}
        onEditLabel={handleEditLabel}
        onCameraChange={handleCameraChange}
      />
      <Toolbar
        tool={tool}
        onToolChange={(t) => {
          setTool(t);
          setSelectedIds(new Set());
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        elementCount={elements.length}
        onNewDrawing={newDrawing}
        onSaveProject={handleSaveProject}
        onOpenProjectFile={(file) => void openProjectFile(file)}
        onLoadExample={() => void loadExample()}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
      />
      <ZoomControls
        zoom={camera.zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
      />
      <GridControls
        gridEnabled={gridEnabled}
        snapEnabled={snapEnabled}
        unit={unit}
        scale={scale}
        onToggleGrid={() => setGridEnabled((v) => !v)}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        onUnitChange={setUnit}
        onScaleChange={setScale}
        onOpenHelp={() => setHelpOpen(true)}
      />
      <div
        className={`save-indicator${saveFlash ? ' visible' : ''}`}
        data-testid="save-indicator"
        role="status"
      >
        ✓ Saved
      </div>
      {storageWarning && (
        <div className="storage-warning" data-testid="storage-warning" role="alert">
          <span>{storageWarning}</span>
          <button type="button" aria-label="Dismiss warning" onClick={() => setStorageWarning(null)}>
            ×
          </button>
        </div>
      )}
      {fileError && (
        <div className="file-error" data-testid="file-error" role="alert">
          <span>{fileError}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setFileError(null)}>
            ×
          </button>
        </div>
      )}
      {restoredAt && (
        <div className="restore-toast" data-testid="restore-toast" role="status">
          <span>Restored your drawing from {new Date(restoredAt).toLocaleString()}.</span>
          <button type="button" aria-label="Dismiss" onClick={() => setRestoredAt(null)}>
            ×
          </button>
        </div>
      )}
      {paletteVisible && paletteScreen && (
        <div
          ref={paletteRef}
          className={`color-palette${paletteScreen.below ? ' below' : ''}`}
          data-testid="color-palette"
          style={{ left: paletteScreen.left, top: paletteScreen.top }}
        >
          {allColorable && (
            <>
          <button
            type="button"
            className={`color-swatch${currentColor === null ? ' active' : ''}`}
            data-color="ink"
            style={{ background: INK_COLOR }}
            title="Ink (default)"
            onClick={() => applyColor(null)}
          />
          {SHAPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${currentColor === c ? ' active' : ''}`}
              data-color={c}
              style={{ background: c }}
              title={c}
              onClick={() => applyColor(c)}
            />
          ))}
          <div className="palette-divider" />
          <button
            type="button"
            className={`color-swatch fill-swatch-none${currentFill === null ? ' active' : ''}`}
            data-fill="none"
            title="No fill"
            onClick={() => applyFill(null)}
          />
          {SHAPE_COLORS.map((c) => (
            <button
              key={`fill-${c}`}
              type="button"
              className={`color-swatch${currentFill === c ? ' active' : ''}`}
              data-fill={c}
              style={{ background: c }}
              title={`Fill ${c}`}
              onClick={() => applyFill(c)}
            />
          ))}
          <div className="palette-divider" />
          <button
            type="button"
            className={`color-swatch text-swatch-auto${currentTextColor === null ? ' active' : ''}`}
            data-text-color="auto"
            title="Label: auto (match border)"
            onClick={() => applyTextColor(null)}
          >
            <span>A</span>
          </button>
          <button
            type="button"
            className={`color-swatch${currentTextColor === WHITE_COLOR ? ' active' : ''}`}
            data-text-color={WHITE_COLOR}
            style={{ background: WHITE_COLOR }}
            title="White label"
            onClick={() => applyTextColor(WHITE_COLOR)}
          />
          {SHAPE_COLORS.map((c) => (
            <button
              key={`text-${c}`}
              type="button"
              className={`color-swatch${currentTextColor === c ? ' active' : ''}`}
              data-text-color={c}
              style={{ background: c }}
              title={`Label ${c}`}
              onClick={() => applyTextColor(c)}
            />
          ))}
          <div className="palette-divider" />
          {FONT_SCALES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`font-scale${currentScale === s.id ? ' active' : ''}`}
              data-testid={`font-scale-${s.id}`}
              title={s.title}
              aria-label={s.title}
              onClick={() => applyFontScale(s.id)}
            >
              <span style={{ fontSize: FONT_SCALE_BUTTON_SIZES[s.id] }}>A</span>
            </button>
          ))}
            </>
          )}
          {allColorable && <div className="palette-divider" />}
          <button
            type="button"
            className="palette-delete"
            data-testid="delete-selection"
            title="Delete selection (Del)"
            aria-label="Delete"
            onClick={deleteSelection}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </div>
      )}
      {chipScreen && (
        <button
          type="button"
          className="extend-chip"
          data-testid="extend-chip"
          style={{ left: chipScreen.left, top: chipScreen.top }}
          title="Extend: add a connected box"
          onMouseEnter={() => setExtendHover(true)}
          onMouseLeave={() => setExtendHover(false)}
          onClick={extendBox}
        >
          +
        </button>
      )}
      {editingScreen && editing && (
        <textarea
          ref={textareaRef}
          className={`text-input${editing.isShapeLabel ? ' text-input-centered' : ''}`}
          style={textareaStyle}
          rows={1}
          value={editValue}
          onChange={(e) => setEditValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          onBlur={() => {
            if (!textReadyRef.current) {
              // Focus was stolen by the click sequence before we could
              // establish it — reclaim instead of committing empty text.
              setTimeout(() => textareaRef.current?.focus(), 0);
              return;
            }
            if (textCancelledRef.current) {
              textCancelledRef.current = false;
              return;
            }
            commitText();
          }}
        />
      )}
      {helpOpen && <HelpModal onClose={closeHelp} />}
      {onboardingOpen && <OnboardingOverlay onFinish={finishOnboarding} />}
      {mobileNoticeOpen && <MobileNotice onDismiss={dismissMobileNotice} />}
    </>
  );
}
