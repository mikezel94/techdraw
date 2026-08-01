export interface Point {
  x: number;
  y: number;
}

interface BaseElement {
  id: string;
}

export interface PencilElement extends BaseElement {
  type: 'pencil';
  points: Point[];
}

export interface RectElement extends BaseElement {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineElement extends BaseElement {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowBinding {
  elementId: string;
}

export interface ArrowElement extends BaseElement {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  startBinding?: ArrowBinding;
  endBinding?: ArrowBinding;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
}

export type Element =
  | PencilElement
  | RectElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | TextElement;

export type Tool = 'select' | 'pencil' | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'text';

let idCounter = 0;

export function genId(): string {
  idCounter += 1;
  return `el-${idCounter}`;
}
