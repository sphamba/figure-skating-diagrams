import type { Curvilinear, Curve } from "../curve.js";
import { type AxisRect } from "../curve.js";
import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import type { DynamicGlide } from "../element/stroke.js";
import type { Path } from "../path.js";
import { LENGTH, WIDTH, CORNER_RADIUS } from "../rink.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { createDefaultFootTurn } from "../element/turnTypes.js";
import { Sequence } from "../sequence.js";
import { checkSequenceCurvatures, isStrokeElement } from "./curvatureWarning.js";
import { Vector } from "../vector.js";

const WARNING_TRIANGLE_COLOR = "#c25205";
const WARNING_TRIANGLE_SIZE = 30; // px, side length of the filled warning triangle

export type ControlPointKey = "p0" | "p1" | "p2" | "p3";

const RINK_COLOR = "#ccc";
const RINK_CENTERLINE_COLOR = "#fff";
const RINK_CENTERLINE_WIDTH = 3; // px on screen
const RINK_CENTERLINE_DASH = 10; // dash, px on screen
const RINK_CENTERLINE_GAP = 6; // gap, px on screen
const PATH_WIDTH = 1; // px
const MIN_TRACE_WIDTH = 2; // px
const MIN_BLADE_LENGTH = 25; // px, only effective when zoomed out
const MIN_DRAW_INCREMENT = 2; // px
const ELEMENTS_PATH_COLOR = "#000";
const LABEL_FONT_SIZE = 14; // px
const LABEL_OFFSET = 15; // px
const ELEMENT_DRAW_INCREMENT = 0.02; // m
const NODE_SIZE = 10; // px
const POLYGON_ALPHA = 0.25;
const PICK_RADIUS = 8; // px
const RECT_CLICK_THRESHOLD = 4; // px (max movement still counted as a click)
const ADD_BUTTON_OFFSET = 20; // px, screen distance from the path end to the button center
const ADD_BUTTON_RADIUS = 7; // px
const ADD_BUTTON_LINE_WIDTH = 1.5; // px
const ADD_PLUS_LENGTH = 7; // px
const ADD_BUTTON_HIT_RADIUS = 9; // px, slightly above the drawn radius
const ADD_BUTTON_COLOR = "#d33";
const DELETE_BUTTON_OFFSET = 20; // px, screen distance from the path line to the button center
const DELETE_BUTTON_RADIUS = 7; // px
const DELETE_BUTTON_LINE_WIDTH = 1.5; // px
const DELETE_MINUS_LENGTH = 7; // px
const DELETE_BUTTON_HIT_RADIUS = 9; // px, slightly above the drawn radius
const DELETE_BUTTON_COLOR = "#d33";
const COG_BUTTON_COLOR = "#444";
const COG_LINE_WIDTH = 3.5; // px (thick circle and teeth, thicker than the short teeth are long)
const COG_TEETH_COUNT = 8;
const PROVISIONAL_COLOR = "#1976d2";
const PROVISIONAL_TOTAL_LENGTH = 0.8; // m
const SPLIT_BUTTON_OFFSET = 14; // px, from the curve midpoint
const SELECTION_RECT_FILL = "rgba(100, 149, 237, 0.2)"; // gentle blue fill
const SELECTION_RECT_STROKE = "rgba(100, 149, 237, 0.9)";
const ZOOM_FACTOR = 1.005;

const MIN_ZOOM = 2;
const MAX_ZOOM = 5000;
const CANVAS_SCALE = 20; // canvas units per metre, editor drawing only

type ViewState = {
  center: Vector<2>;
  zoom: number; // pixel per meter
};

export type EditMode = "view" | "path" | "elements";

type ControlPointSelection = {
  curveIndex: number;
  pointKey: ControlPointKey;
};

export class Editor {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2DSized;
  width = 0;
  height = 0;

  sequence: Sequence;
  mode: EditMode = "view";
  scaleElements = true;
  private view: ViewState;
  private overlaySequences: Sequence[] = [];

  private selected = new Set<string>();
  onElementChangeRequest?: (element: Element) => void;
  onSequenceChange?: () => void;
  private sequenceMutated = false;
  private selectedCurves = new Set<number>();
  private selectedElements = new Set<Element>();
  private isPanning = false;
  private isDraggingPoint = false;
  private isDraggingCurve = false;
  private isSelectingRect = false;
  private provisionalElement: Element | null = null;
  private isCreatingProvisional = false;
  private provisionalOriginU = 0;
  private isDraggingElementPoint = false;
  private dragElement: Element | null = null;
  private dragElementPointIsStart = false;
  private isDraggingElementSegment = false;
  private segmentDragItems: Array<{ element: Element; start0: number; end0: number }> = [];
  private segmentDragDeltaMin = -Infinity;
  private segmentDragDeltaMax = Infinity;
  private segmentDragGrabU = 0;
  private dragAnchorCurveIndex = 0;
  private jointMoveSnapshot: {
    jointCurveIndex: number;
    curveStarts: number[];
    curveLengths: number[];
    items: Array<{ element: Element; start: number; end: number }>;
  } | null = null;
  private jointDeletionSnapshot: {
    jointOldIndex: number;
    curveStarts: number[];
    curveLengths: number[];
    items: Array<{ element: Element; start: number; end: number }>;
  } | null = null;
  private rectAddToSelection = false;
  private rectTargetsElements = false;
  private rectDidMove = false;
  private rectStartX = 0;
  private rectStartY = 0;
  private rectEndX = 0;
  private rectEndY = 0;
  private dragOrigin: Vector<2> | null = null;
  private lastDragDelta = new Vector<2>(0, 0);
  private lastPanX = 0;
  private lastPanY = 0;

  private onWheel = (event: WheelEvent) => this.handleWheel(event);
  private onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private onMouseUp = () => this.handleMouseUp();
  private onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private onContextMenu = (event: MouseEvent) => event.preventDefault();
  private onWindowResize = () => this.resize();
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, sequence: Sequence) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2DSized;
    this.sequence = sequence;

    const ResizeObserverCtor = typeof ResizeObserver !== "undefined" ? ResizeObserver : null;
    if (ResizeObserverCtor) {
      this.resizeObserver = new ResizeObserverCtor(() => this.resize());
      this.resizeObserver.observe(canvas);
    }

    this.view = {
      center: new Vector<2>(0, 0),
      zoom: 100,
    };

    this.resize();
    this.view.zoom = Math.min(canvas.clientWidth / WIDTH, canvas.clientHeight / LENGTH);

    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("resize", this.onWindowResize);

    this.draw();
  }

  destroy() {
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("resize", this.onWindowResize);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  setSequence(sequence: Sequence) {
    this.sequence = sequence;
    this.sequenceMutated = false;
    this.jointMoveSnapshot = null;
    this.jointDeletionSnapshot = null;
    this.selected.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElement = null;
    this.draw();
  }

  clearSelection() {
    this.selected.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElement = null;
  }

  replaceSelectedElement(oldElement: Element, newElement: Element) {
    if (this.selectedElements.delete(oldElement)) {
      this.selectedElements.add(newElement);
    }
  }

  addOverlaySequence(sequence: Sequence) {
    this.overlaySequences.push(sequence);
    this.draw();
  }

  getSequence(): Sequence {
    return this.sequence;
  }

  addSegmentEnd() {
    this.sequence.path.addCurveEnd();
    this.notifySequenceChange();
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.transformContext();
    this.drawRink();
    if (this.mode !== "view") {
      this.drawPath();
      for (const sequence of this.overlaySequences) {
        this.drawPath(sequence);
      }
    }
    this.drawSelectedCurves();
    if (this.mode === "path") {
      this.drawControlHandles();
      this.drawAddButton();
      this.drawSplitButtons();
      this.drawDeleteButton();
    } else if (this.mode === "elements") {
      this.drawElements();
    } else {
      this.drawTraces();
    }
    if (this.mode === "path" || this.mode === "elements") {
      this.drawCurvatureWarnings();
    }
    this.drawElementLabels();
    this.drawStartLabels();
    ctx.restore();
    this.drawSelectionRectangle();
  }

  private drawTraces() {
    const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
    const minBladeLength = this.scaleElements ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    this.drawMetres(() =>
      this.sequence.drawTraces(
        this.ctx,
        minTraceWidth,
        minBladeLength,
        MIN_DRAW_INCREMENT / this.view.zoom,
        this.getTraceViewport(minBladeLength),
      ),
    );
  }

  private getTraceViewport(minBladeLength?: number): AxisRect {
    const margin = minBladeLength === undefined ? bladeLength : Math.max(bladeLength, minBladeLength);
    const halfWidth = this.width / 2 / this.view.zoom;
    const halfHeight = this.height / 2 / this.view.zoom;
    return {
      minX: this.view.center.x - halfWidth - margin,
      maxX: this.view.center.x + halfWidth + margin,
      minY: this.view.center.y - halfHeight - margin,
      maxY: this.view.center.y + halfHeight + margin,
    };
  }

  private transformContext() {
    const ctx = this.ctx;
    let translation = new Vector<2>(ctx.width / 2, -ctx.height / 2);
    translation = translation.times(1 / this.view.zoom).minus(this.view.center);

    ctx.save();
    ctx.scale(this.view.zoom / CANVAS_SCALE, this.view.zoom / CANVAS_SCALE);
    ctx.translate(translation.x * CANVAS_SCALE, -translation.y * CANVAS_SCALE);
  }

  private drawMetres(draw: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(CANVAS_SCALE, CANVAS_SCALE);
    draw();
    ctx.restore();
  }

  private drawRink() {
    const ctx = this.ctx;
    const width = (WIDTH - 2 * CORNER_RADIUS) * CANVAS_SCALE;
    const height = (LENGTH - 2 * CORNER_RADIUS) * CANVAS_SCALE;

    ctx.lineWidth = 2 * CORNER_RADIUS * CANVAS_SCALE;
    ctx.lineJoin = "round";
    ctx.fillStyle = RINK_COLOR;
    ctx.strokeStyle = RINK_COLOR;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeRect(-width / 2, -height / 2, width, height);

    // White dotted center lines crossing the rink horizontally and vertically.
    // drawMetres cancels the CANVAS_SCALE factor, so both the width and the dash
    // pattern divided by zoom stay constant in px on screen at any zoom level.
    // Each line starts at the rink center and is stroked separately, shifted by
    // half a dash, so the pattern is mirrored around the rink center rather
    // than starting with a full dash at the rink border.
    this.drawMetres(() => {
      ctx.strokeStyle = RINK_CENTERLINE_COLOR;
      ctx.lineWidth = RINK_CENTERLINE_WIDTH / this.view.zoom;
      ctx.lineCap = "butt";
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([RINK_CENTERLINE_DASH / this.view.zoom, RINK_CENTERLINE_GAP / this.view.zoom]);
      }
      const ends: Array<[number, number]> = [
        [-WIDTH / 2, 0],
        [WIDTH / 2, 0],
        [0, -LENGTH / 2],
        [0, LENGTH / 2],
      ];
      for (const [endX, endY] of ends) {
        ctx.lineDashOffset = RINK_CENTERLINE_DASH / 2 / this.view.zoom;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.lineDashOffset = 0;
      if (typeof ctx.setLineDash === "function") {
        ctx.setLineDash([]);
      }
    });
  }

  private drawPath(sequence: Sequence = this.sequence) {
    if (sequence.path.curves.length == 0) {
      return;
    }
    const pathWidth = PATH_WIDTH / this.view.zoom;
    const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
    const minBladeLength =
      this.scaleElements && this.mode !== "elements" ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    const pathColor = this.mode === "elements" ? ELEMENTS_PATH_COLOR : undefined;
    const minDrawIncrement = MIN_DRAW_INCREMENT / this.view.zoom;
    const viewport = this.getTraceViewport(minBladeLength);
    if (this.mode === "path" && !pathColor) {
      this.drawMetres(() => sequence.drawPath(this.ctx, pathWidth, 0 as PathCoordinate, undefined, pathColor));
      this.ctx.globalAlpha = 0.3;
      this.drawMetres(() =>
        sequence.drawFootTraces(
          this.ctx,
          0 as PathCoordinate,
          undefined,
          minTraceWidth,
          minBladeLength,
          minDrawIncrement,
          viewport,
        ),
      );
      this.ctx.globalAlpha = 1;
    } else if (this.mode === "elements") {
      this.ctx.globalAlpha = 0.5;
      this.drawMetres(() => sequence.drawPath(this.ctx, pathWidth, 0 as PathCoordinate, undefined, pathColor));
      this.ctx.globalAlpha = 1;
      this.drawMetres(() =>
        sequence.drawFootTraces(
          this.ctx,
          0 as PathCoordinate,
          undefined,
          minTraceWidth,
          minBladeLength,
          minDrawIncrement,
          viewport,
        ),
      );
    } else {
      this.drawMetres(() =>
        sequence.draw(
          this.ctx,
          pathWidth,
          0 as PathCoordinate,
          undefined,
          pathColor,
          minTraceWidth,
          minBladeLength,
          minDrawIncrement,
          viewport,
        ),
      );
    }
  }

  private drawSelectedCurves() {
    if (this.selectedCurves.size == 0) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "#d33";
    ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const curveIndex of this.selectedCurves) {
      const curve = this.sequence.path.curves[curveIndex];
      if (!curve) continue;
      this.drawMetres(() => curve.draw(ctx));
    }
  }

  private drawElements() {
    if (this.sequence.path.curves.length === 0) {
      return;
    }
    if (this.sequence.elements.length === 0 && !this.provisionalElement) {
      return;
    }
    const ctx = this.ctx;
    const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;

    for (const element of this.sequence.elements) {
      const selected = this.selectedElements.has(element);

      ctx.strokeStyle = selected ? "#d33" : "#000";
      ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
      this.drawElementSpan(element);

      ctx.fillStyle = selected ? "#d33" : "#444";
      for (const u of this.getDisplayedSpan(element)) {
        const point = this.sequence.path.getPosition(u as PathCoordinate);
        ctx.beginPath();
        ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    if (this.provisionalElement) {
      const element = this.provisionalElement;

      ctx.strokeStyle = PROVISIONAL_COLOR;
      ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
      this.drawElementSpan(element);

      ctx.fillStyle = PROVISIONAL_COLOR;
      for (const u of this.getDisplayedSpan(element)) {
        const point = this.sequence.path.getPosition(u as PathCoordinate);
        ctx.beginPath();
        ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    this.drawElementDeleteButton();
    this.drawElementCogButton();
    this.drawProvisionalAddButton();
  }

  private getDisplayedSpan(element: Element): [PathCoordinate, PathCoordinate] {
    const minBladeLength =
      this.scaleElements && this.mode !== "elements" ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    const scales = this.sequence.getSpanScales(minBladeLength);
    const factor = scales.get(element) ?? 1;
    const [start, end] = factor === 1 ? [element.start, element.end] : element.scaleAboutMiddle(factor);
    const pathLength = this.sequence.path.length;
    const clamp = (u: number) => Math.max(0, Math.min(pathLength, u));
    return [
      clamp(Math.min(start as number, end as number)) as PathCoordinate,
      clamp(Math.max(start as number, end as number)) as PathCoordinate,
    ];
  }

  private drawElementSpan(element: Element) {
    const [start, end] = this.getDisplayedSpan(element);
    this.drawMetres(() => this.sequence.path.drawRange(this.ctx, start, end));
  }

  private getLabelFrame(path: Path, u: PathCoordinate): { point: Vector<2>; tangent: Vector<2>; curvature: number } {
    const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(u);
    const point = curve.getPosition(curvilinear);
    const tangent = curve.getDerivative(curvilinear).normalized();
    const curvature = curve.getCurvature(curvilinear);
    return { point, tangent, curvature };
  }

  private getElementLabelGeometry(element: Element): { point: Vector<2>; outside: Vector<2> } | null {
    const path = this.sequence.path;
    if (path.curves.length === 0) return null;
    const anchorU = isStrokeElement(element) ? this.getStrokeLabelAnchor(element) : this.getSpanMidpoint(element);
    const { point, tangent, curvature } = this.getLabelFrame(path, anchorU);
    const sign = curvature > 0 ? -1 : 1;
    const outside = tangent.getOrthogonal().times(sign);
    return { point, outside };
  }

  private getSpanMidpoint(element: Element): PathCoordinate {
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    return ((lo + hi) / 2) as PathCoordinate;
  }

  private getStrokeLabelAnchor(element: DynamicGlide): PathCoordinate {
    const path = this.sequence.path;
    const strokeEnd = Math.max(element.start as number, element.end as number);
    const next = this.nextElementAfter(element);
    const nextStart = next ? Math.min(next.start as number, next.end as number) : path.length;
    const anchor = Math.max(0, Math.min(path.length, (strokeEnd + nextStart) / 2));
    return anchor as PathCoordinate;
  }

  private nextElementAfter(element: Element): Element | null {
    const sorted = [...this.sequence.elements].sort((a, b) => (a.start as number) - (b.start as number));
    const index = sorted.indexOf(element);
    if (index === -1) return null;
    return sorted[index + 1] ?? null;
  }

  private getStartLabelGeometry(sequence: Sequence): { point: Vector<2>; outside: Vector<2> } | null {
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const { point, tangent } = this.getLabelFrame(path, 0 as PathCoordinate);
    const outside = tangent.times(-1); // behind the path beginning, opposite to the travel direction
    return { point, outside };
  }

  private ellipseSupport(ux: number, uy: number, a: number, b: number): number {
    return 1 / Math.hypot(ux / a, uy / b);
  }

  private drawCurvatureWarnings() {
    const checks = checkSequenceCurvatures(this.sequence);
    for (const check of checks) {
      if (!check.invalid) continue;
      this.drawWarningTriangle(check.point, WARNING_TRIANGLE_COLOR);
    }
  }

  private drawWarningTriangle(world: Vector<2>, color: string) {
    const ctx = this.ctx;
    const cx = world.x * CANVAS_SCALE;
    const cy = -world.y * CANVAS_SCALE;
    const radius = (WARNING_TRIANGLE_SIZE / Math.sqrt(3) / 2) * (CANVAS_SCALE / this.view.zoom);

    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3; // first vertex points down
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawElementLabels() {
    if (this.sequence.path.curves.length === 0) return;

    for (const element of this.sequence.elements) {
      const geometry = this.getElementLabelGeometry(element);
      if (!geometry) continue;
      this.drawShiftedLabel(element.shortName, geometry.point, geometry.outside);
    }
  }

  private drawShiftedLabel(text: string, point: Vector<2>, outside: Vector<2>) {
    const ctx = this.ctx;
    const offset = (LABEL_OFFSET * CANVAS_SCALE) / this.view.zoom; // px -> canvas units

    ctx.font = `${(LABEL_FONT_SIZE * CANVAS_SCALE) / this.view.zoom}px sans-serif`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(text);
    const a = metrics.width / 2;
    const b = ((metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0)) / 2;
    if (a === 0 && b === 0) return;

    const support = this.ellipseSupport(Math.abs(outside.x), Math.abs(outside.y), a, b);
    const total = offset + support;
    const labelX = point.x * CANVAS_SCALE + outside.x * total;
    const labelY = point.y * CANVAS_SCALE + outside.y * total;

    ctx.fillText(text, labelX, -labelY);
  }

  private drawStartLabels() {
    this.drawStartLabel(this.sequence);
    for (const sequence of this.overlaySequences) {
      this.drawStartLabel(sequence);
    }
  }

  private drawStartLabel(sequence: Sequence) {
    const geometry = this.getStartLabelGeometry(sequence);
    if (!geometry) return;
    this.drawShiftedLabel("start", geometry.point, geometry.outside);
  }

  private getElementPoints(element: Element): Vector<2>[] {
    const path = this.sequence.path;
    const [start, end] = this.getDisplayedSpan(element);
    const span = (end as number) - (start as number);
    const step = Math.min(ELEMENT_DRAW_INCREMENT, span / 4) || ELEMENT_DRAW_INCREMENT;
    const points: Vector<2>[] = [];
    for (let u = start as number; u <= (end as number); u += step) {
      points.push(path.getPosition(u as PathCoordinate));
    }
    return points;
  }

  private selectElement(element: Element, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedElements.has(element)) this.selectedElements.delete(element);
      else this.selectedElements.add(element);
    } else if (!this.selectedElements.has(element)) {
      this.selectedElements = new Set([element]);
    }
  }

  private pickElementControlPoint(screenX: number, screenY: number): { element: Element; isStart: boolean } | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    let best: { element: Element; isStart: boolean } | null = null;
    let bestDistance = Infinity;

    const elements = this.provisionalElement
      ? [...this.sequence.elements, this.provisionalElement]
      : this.sequence.elements;
    for (const element of elements) {
      const points = this.getElementPoints(element);
      if (points.length === 0) continue;
      const endpoints: Array<[boolean, Vector<2>]> = [
        [true, points[0]!],
        [false, points[points.length - 1]!],
      ];
      for (const [isStart, point] of endpoints) {
        const distance = point.minus(cursor).length();
        if (distance <= tolerance && distance <= bestDistance) {
          bestDistance = distance;
          best = { element, isStart };
        }
      }
    }
    return best;
  }

  private snapElementPointToPath(element: Element, isStart: boolean, cursor: Vector<2>): PathCoordinate | null {
    const path = this.sequence.path;
    const curves = path.curves;
    if (curves.length === 0) return null;

    const u = this.snapCursorToPathAnywhere(cursor);
    if (u == null) return null;

    let clamped = Math.max(0, Math.min(path.length, u));
    const other = (isStart ? element.end : element.start) as number;
    clamped = isStart ? Math.min(clamped, other) : Math.max(clamped, other);
    const bounds = this.neighbourBoundsAroundSpan(element.start as number, element.end as number, element);
    clamped = isStart ? Math.max(clamped, bounds.left) : Math.min(clamped, bounds.right);
    return clamped as PathCoordinate;
  }

  private neighbourBoundsAroundSpan(
    start: number,
    end: number,
    exclude: Element | Set<Element> | null,
  ): { left: number; right: number } {
    const path = this.sequence.path;
    let left = 0;
    let right = path.length;
    for (const other of this.sequence.elements) {
      if (other === exclude || (exclude instanceof Set && exclude.has(other))) continue;
      const os = Math.min(other.start as number, other.end as number);
      const oe = Math.max(other.start as number, other.end as number);
      if (oe <= start) left = Math.max(left, oe);
      else if (os >= end) right = Math.min(right, os);
    }
    return { left, right };
  }

  private snapCursorToPathNearCurve(anchorCurveIndex: number, cursor: Vector<2>): PathCoordinate | null {
    const curves = this.sequence.path.curves;
    if (curves.length === 0) return null;

    const lo = Math.max(0, anchorCurveIndex - 1);
    const hi = Math.min(curves.length - 1, anchorCurveIndex + 1);

    let bestIndex = anchorCurveIndex;
    let bestT = 0;
    let bestDistance = Infinity;
    for (let i = lo; i <= hi; i++) {
      const { t, distance } = curves[i]!.getClosestPoint(cursor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        bestT = t;
      }
    }

    return this.uniformCoordinateAt(curves, bestIndex, bestT) as PathCoordinate;
  }

  private snapCursorToPathAnywhere(cursor: Vector<2>): PathCoordinate | null {
    const curves = this.sequence.path.curves;
    if (curves.length === 0) return null;

    let bestIndex = 0;
    let bestT = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < curves.length; i++) {
      const { t, distance } = curves[i]!.getClosestPoint(cursor);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        bestT = t;
      }
    }

    return this.uniformCoordinateAt(curves, bestIndex, bestT) as PathCoordinate;
  }

  private startElementSegmentDrag(element: Element, screenX: number, screenY: number) {
    const path = this.sequence.path;
    const curves = path.curves;
    if (curves.length === 0) return;

    const cursor = this.screenToWorld(screenX, screenY);
    const anchorIndex = this.curveIndexAt(curves, element.start as number);
    const grabbedU = this.snapCursorToPathNearCurve(anchorIndex, cursor);
    if (grabbedU == null) return;

    const startU = element.start as number;
    const endU = element.end as number;
    const lo = Math.min(startU, endU);
    const hi = Math.max(startU, endU);
    const clampedGrab = Math.min(Math.max(grabbedU as number, lo), hi);

    this.isDraggingElementSegment = true;
    this.dragElement = element;
    this.segmentDragGrabU = clampedGrab;
    this.dragAnchorCurveIndex = anchorIndex;

    const moving = new Set<Element>([element]);
    if (!this.isProvisionalElement(element) && this.selectedElements.has(element) && this.selectedElements.size > 1) {
      for (const selected of this.selectedElements) moving.add(selected);
    }

    this.segmentDragItems = [];
    let dMin = -Infinity;
    let dMax = Infinity;
    for (const moved of moving) {
      const s0 = Math.min(moved.start as number, moved.end as number);
      const e0 = Math.max(moved.start as number, moved.end as number);
      this.segmentDragItems.push({ element: moved, start0: s0, end0: e0 });
      const bounds = this.neighbourBoundsAroundSpan(s0, e0, moving);
      dMin = Math.max(dMin, -path.arcLengthBetween(bounds.left as PathCoordinate, s0 as PathCoordinate));
      dMax = Math.min(dMax, path.arcLengthBetween(e0 as PathCoordinate, bounds.right as PathCoordinate));
    }
    this.segmentDragDeltaMin = dMin;
    this.segmentDragDeltaMax = dMax;
  }

  private curveIndexAt(curves: Curve[], u: number): number {
    if (curves.length === 0) return 0;
    if (u <= 0) return 0;
    if (u >= this.sequence.path.length) return curves.length - 1;
    const [curve] = this.sequence.path.getCurveAndCurvilinearCoord(u as PathCoordinate);
    const index = curves.indexOf(curve);
    return index >= 0 ? index : 0;
  }

  private uniformCoordinateAt(curves: Curve[], curveIndex: number, s: number): number {
    let u = 0;
    for (let i = 0; i < curveIndex; i++) u += curves[i]!.length;
    u += this.uniformWithinCurve(curves[curveIndex]!, s);
    return u;
  }

  private uniformWithinCurve(curve: Curve, s: number): number {
    return curve.getUniformCoordFromCurvilinear(s as Curvilinear);
  }

  private pickElement(screenX: number, screenY: number): Element | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    let best: Element | null = null;
    let bestDistance = Infinity;

    const elements = this.provisionalElement
      ? [...this.sequence.elements, this.provisionalElement]
      : this.sequence.elements;
    for (const element of elements) {
      const points = this.getElementPoints(element);
      if (points.length === 0) continue;

      for (const point of [points[0], points[points.length - 1]]) {
        if (!point) continue;
        const distance = point.minus(cursor).length();
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          best = element;
        }
      }

      for (let i = 0; i < points.length - 1; i++) {
        const distance = distanceToSegment(cursor, points[i]!, points[i + 1]!);
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          best = element;
        }
      }
    }
    return best;
  }

  private drawControlHandles() {
    const ctx = this.ctx;
    const curves = this.sequence.path.curves;

    curves.forEach((curve, curveIndex) => {
      const points = [curve.p0, curve.p1, curve.p2, curve.p3];
      const showP1 = this.isHandleVisible(curveIndex, "p1");
      const showP2 = this.isHandleVisible(curveIndex, "p2");

      ctx.strokeStyle = `rgba(0, 0, 0, ${POLYGON_ALPHA})`;
      ctx.lineWidth = (1 * CANVAS_SCALE) / this.view.zoom;
      if (showP1) this.drawGuide(points[0]!, points[1]!);
      if (showP2) this.drawGuide(points[2]!, points[3]!);

      const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
      points.forEach((point, index) => {
        const pointKey = keys[index]!;
        if ((pointKey === "p1" && !showP1) || (pointKey === "p2" && !showP2)) return;

        const isSelected = this.selected.has(this.keyOf(curveIndex, pointKey));
        const size = ((isSelected ? NODE_SIZE * 1.5 : NODE_SIZE) * CANVAS_SCALE) / this.view.zoom;

        ctx.fillStyle = index === 0 || index === 3 ? "#444" : "#888";
        ctx.beginPath();
        ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, size / 2, 0, 2 * Math.PI);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = "#d33";
          ctx.lineWidth = (2 * CANVAS_SCALE) / this.view.zoom;
          ctx.stroke();
        }
      });
    });
  }

  private drawGuide(a: Vector<2>, b: Vector<2>) {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x * CANVAS_SCALE, -a.y * CANVAS_SCALE);
    this.ctx.lineTo(b.x * CANVAS_SCALE, -b.y * CANVAS_SCALE);
    this.ctx.stroke();
  }

  private getAddButtonPosition(): Vector<2> {
    const curves = this.sequence.path.curves;
    if (curves.length == 0) return new Vector<2>(0, 0);

    const lastCurve = curves[curves.length - 1]!;
    const end = lastCurve.p3;
    const dir = lastCurve.getDerivative(1 as Curvilinear).normalized();
    const offset = ADD_BUTTON_OFFSET / this.view.zoom; // px -> m
    return end.plus(dir.times(offset));
  }

  private drawPlusInCircle(world: Vector<2>) {
    this.drawPlusInCircleWithColor(world, ADD_BUTTON_COLOR);
  }

  private drawPlusInCircleWithColor(world: Vector<2>, color: string) {
    const ctx = this.ctx;
    const cx = world.x * CANVAS_SCALE;
    const cy = -world.y * CANVAS_SCALE;

    const radius = (ADD_BUTTON_RADIUS * CANVAS_SCALE) / this.view.zoom;
    const halfPlus = ((ADD_PLUS_LENGTH / 2) * CANVAS_SCALE) / this.view.zoom;

    ctx.strokeStyle = color;
    ctx.lineWidth = (ADD_BUTTON_LINE_WIDTH * CANVAS_SCALE) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - halfPlus, cy);
    ctx.lineTo(cx + halfPlus, cy);
    ctx.moveTo(cx, cy - halfPlus);
    ctx.lineTo(cx, cy + halfPlus);
    ctx.stroke();
  }

  private drawAddButton() {
    this.drawPlusInCircle(this.getAddButtonPosition());
  }

  private hitAddButton(screenX: number, screenY: number): boolean {
    const [iconX, iconY] = this.worldToScreen(this.getAddButtonPosition());
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS;
  }

  private getRemovablePoint(): { point: Vector<2>; dir: Vector<2>; isStart: boolean; isEnd: boolean } | null {
    if (this.selected.size !== 1 || this.selectedCurves.size > 0) return null;
    const curves = this.sequence.path.curves;
    if (curves.length === 0) return null;
    const [ciStr, pkStr] = [...this.selected][0]!.split(":");
    const curveIndex = Number(ciStr);
    const pointKey = pkStr as ControlPointKey;
    const curve = curves[curveIndex];
    if (!curve) return null;

    if (pointKey === "p0" && curveIndex === 0 && curves.length > 1) {
      return { point: curve.p0, dir: curve.getDerivative(0 as Curvilinear).normalized(), isStart: true, isEnd: false };
    }
    if (pointKey === "p3" && curveIndex === curves.length - 1 && curves.length > 1) {
      return { point: curve.p3, dir: curve.getDerivative(1 as Curvilinear).normalized(), isStart: false, isEnd: true };
    }
    if (pointKey === "p0" && curveIndex > 0) {
      return { point: curve.p0, dir: curve.getDerivative(0 as Curvilinear).normalized(), isStart: false, isEnd: false };
    }
    if (pointKey === "p3" && curveIndex < curves.length - 1) {
      return {
        point: curve.p3,
        dir: curves[curveIndex + 1]!.getDerivative(0 as Curvilinear).normalized(),
        isStart: false,
        isEnd: false,
      };
    }
    return null;
  }

  private getDeleteButtonPosition(): Vector<2> | null {
    const removable = this.getRemovablePoint();
    if (!removable) return null;
    const perp = removable.dir.getOrthogonal();
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return removable.point.plus(perp.times(offset));
  }

  private drawMinusInCircle(world: Vector<2>) {
    const ctx = this.ctx;
    const cx = world.x * CANVAS_SCALE;
    const cy = -world.y * CANVAS_SCALE;

    const radius = (DELETE_BUTTON_RADIUS * CANVAS_SCALE) / this.view.zoom;
    const halfMinus = ((DELETE_MINUS_LENGTH / 2) * CANVAS_SCALE) / this.view.zoom;

    ctx.strokeStyle = DELETE_BUTTON_COLOR;
    ctx.lineWidth = (DELETE_BUTTON_LINE_WIDTH * CANVAS_SCALE) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - halfMinus, cy);
    ctx.lineTo(cx + halfMinus, cy);
    ctx.stroke();
  }

  private drawDeleteButton() {
    const center = this.getDeleteButtonPosition();
    if (!center) return;
    this.drawMinusInCircle(center);
  }

  private getElementDeleteButtonElement(): Element | null {
    if (this.selectedElements.size !== 1) return null;
    return [...this.selectedElements][0]!;
  }

  private getElementActionButtonGeometry(): { point: Vector<2>; perp: Vector<2> } | null {
    if (this.selectedElements.size !== 1 || this.sequence.path.curves.length === 0) {
      return null;
    }
    const element = [...this.selectedElements][0]!;
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    const midU = ((lo + hi) / 2) as PathCoordinate;
    const [curve, curvilinear] = this.sequence.path.getCurveAndCurvilinearCoord(midU);
    const point = curve.getPosition(curvilinear);
    const perp = curve.getDerivative(curvilinear).normalized().getOrthogonal();
    return { point, perp };
  }

  private getElementDeleteButtonPosition(): Vector<2> | null {
    const geometry = this.getElementActionButtonGeometry();
    if (!geometry) return null;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return geometry.point.plus(geometry.perp.times(offset));
  }

  private drawElementDeleteButton() {
    const center = this.getElementDeleteButtonPosition();
    if (!center) return;
    this.drawMinusInCircle(center);
  }

  private getElementCogButtonPosition(): Vector<2> | null {
    const geometry = this.getElementActionButtonGeometry();
    if (!geometry) return null;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return geometry.point.plus(geometry.perp.times(-offset));
  }

  private drawCogInCircle(world: Vector<2>) {
    const ctx = this.ctx;
    const cx = world.x * CANVAS_SCALE;
    const cy = -world.y * CANVAS_SCALE;

    const outerRadius = (DELETE_BUTTON_RADIUS * CANVAS_SCALE) / this.view.zoom;
    const circleRadius = outerRadius * 0.62;

    ctx.strokeStyle = COG_BUTTON_COLOR;
    ctx.lineWidth = (COG_LINE_WIDTH * CANVAS_SCALE) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.arc(cx, cy, circleRadius, 0, 2 * Math.PI);
    ctx.stroke();

    for (let i = 0; i < COG_TEETH_COUNT; i++) {
      const angle = (i / COG_TEETH_COUNT) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * circleRadius, cy + Math.sin(angle) * circleRadius);
      ctx.lineTo(cx + Math.cos(angle) * outerRadius, cy + Math.sin(angle) * outerRadius);
      ctx.stroke();
    }
  }

  private drawElementCogButton() {
    const center = this.getElementCogButtonPosition();
    if (!center) return;
    this.drawCogInCircle(center);
  }

  private isProvisionalElement(element: Element): boolean {
    return element === this.provisionalElement;
  }

  private startProvisionalCreation(u: number) {
    this.placeProvisionalElement(u);
    this.isCreatingProvisional = true;
    this.provisionalOriginU = u;
  }

  private updateProvisionalCreation(cursor: Vector<2>) {
    if (this.sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(cursor);
    if (u == null) return;
    const origin = this.provisionalOriginU;
    if (Math.abs(u - origin) < 1e-9) {
      this.placeProvisionalElement(origin);
      return;
    }
    this.setProvisionalSpan(Math.min(origin, u), Math.max(origin, u), origin);
  }

  private placeProvisionalElement(u: number) {
    const half = PROVISIONAL_TOTAL_LENGTH / 2;
    this.setProvisionalSpan(u - half, u + half);
  }

  private setProvisionalSpan(start: number, end: number, anchor?: number) {
    const path = this.sequence.path;
    if (path.curves.length === 0) return;
    const clampedStart = Math.max(0, start) as PathCoordinate;
    const clampedEnd = Math.min(path.length, end) as PathCoordinate;
    const mid = anchor ?? ((clampedStart as number) + (clampedEnd as number)) / 2;
    let left = 0;
    let right = path.length;
    for (const other of this.sequence.elements) {
      const os = Math.min(other.start as number, other.end as number);
      const oe = Math.max(other.start as number, other.end as number);
      if (oe <= mid) left = Math.max(left, oe);
      else right = Math.min(right, os);
    }
    const lo = Math.max(clampedStart as number, left);
    const hi = Math.min(clampedEnd as number, right);
    const finalStart = Math.max(lo, Math.min(hi, lo)) as PathCoordinate;
    if (!this.provisionalElement) {
      this.provisionalElement = createDefaultFootTurn(finalStart, hi as PathCoordinate);
    } else {
      this.provisionalElement.start = finalStart;
      this.provisionalElement.end = hi as PathCoordinate;
    }
    this.selectedElements.clear();
    this.selectedCurves.clear();
    this.selected.clear();
    this.draw();
  }

  private pickPathCoordinate(screenX: number, screenY: number): number | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    const hit = this.sequence.path.pickCurve(cursor, tolerance);
    if (!hit) return null;
    const { t } = hit.curve.getClosestPoint(cursor);
    return this.uniformCoordinateAt(this.sequence.path.curves, hit.curveIndex, t);
  }

  private getProvisionalAddButtonPosition(): Vector<2> | null {
    const element = this.provisionalElement;
    if (!element || this.sequence.path.curves.length === 0) return null;
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    const midU = ((lo + hi) / 2) as PathCoordinate;
    const [curve, curvilinear] = this.sequence.path.getCurveAndCurvilinearCoord(midU);
    const point = curve.getPosition(curvilinear);
    const perp = curve.getDerivative(curvilinear).normalized().getOrthogonal();
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return point.plus(perp.times(-offset));
  }

  private drawProvisionalAddButton() {
    if (!this.provisionalElement) return;
    const center = this.getProvisionalAddButtonPosition();
    if (!center) return;
    this.drawPlusInCircleWithColor(center, PROVISIONAL_COLOR);
  }

  private hitProvisionalAddButton(screenX: number, screenY: number): boolean {
    const center = this.getProvisionalAddButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS;
  }

  private addProvisionalElement() {
    const element = this.provisionalElement;
    if (!element) return;
    this.provisionalElement = null;
    this.sequence.addElement(element);
    this.notifySequenceChange();
    if (this.onElementChangeRequest) this.onElementChangeRequest(element);
    this.draw();
  }

  private hitElementCogButton(screenX: number, screenY: number): boolean {
    const center = this.getElementCogButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  private hitElementDeleteButton(screenX: number, screenY: number): boolean {
    const center = this.getElementDeleteButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  private hitDeleteButton(screenX: number, screenY: number): boolean {
    const center = this.getDeleteButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  private getSplitButtonData(): { curveIndex: number; center: Vector<2> }[] {
    const curves = this.sequence.path.curves;
    const result: { curveIndex: number; center: Vector<2> }[] = [];
    for (const curveIndex of this.selectedCurves) {
      const curve = curves[curveIndex];
      if (!curve) continue;
      const mid = curve.getHalfLengthCoordinate();
      const point = curve.getPosition(mid);
      const dir = curve.getDerivative(mid).normalized();
      const perp = dir.getOrthogonal();
      const offset = SPLIT_BUTTON_OFFSET / this.view.zoom; // px -> m
      result.push({ curveIndex, center: point.plus(perp.times(offset)) });
    }
    return result;
  }

  private drawSplitButtons() {
    for (const { center } of this.getSplitButtonData()) {
      this.drawPlusInCircle(center);
    }
  }

  private hitSplitButton(screenX: number, screenY: number): number | null {
    for (const { curveIndex, center } of this.getSplitButtonData()) {
      const [iconX, iconY] = this.worldToScreen(center);
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS) return curveIndex;
    }
    return null;
  }

  private isHandleVisible(curveIndex: number, pointKey: ControlPointKey): boolean {
    if (pointKey !== "p1" && pointKey !== "p2") return true;
    if (this.selected.size === 0) return false;
    const curveCount = this.sequence.path.curves.length;
    const has = (ci: number, pk: ControlPointKey) => this.selected.has(this.keyOf(ci, pk));

    if (pointKey === "p1") {
      if (has(curveIndex, "p0") || has(curveIndex, "p1")) return true;
      if (curveIndex > 0 && (has(curveIndex - 1, "p3") || has(curveIndex - 1, "p2"))) return true;
      return false;
    }
    if (has(curveIndex, "p3") || has(curveIndex, "p2")) return true;
    if (curveIndex < curveCount - 1 && (has(curveIndex + 1, "p0") || has(curveIndex + 1, "p1"))) return true;
    return false;
  }

  private keyOf(curveIndex: number, pointKey: ControlPointKey): string {
    return `${curveIndex}:${pointKey}`;
  }

  private drawSelectionRectangle() {
    if (!this.isSelectingRect) return;
    const ctx = this.ctx;
    const x = Math.min(this.rectStartX, this.rectEndX);
    const y = Math.min(this.rectStartY, this.rectEndY);
    const w = Math.abs(this.rectEndX - this.rectStartX);
    const h = Math.abs(this.rectEndY - this.rectStartY);
    ctx.fillStyle = SELECTION_RECT_FILL;
    ctx.strokeStyle = SELECTION_RECT_STROKE;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }

  private pickControlPoint(screenX: number, screenY: number): ControlPointSelection | null {
    const curves = this.sequence.path.curves;
    const cursor = this.screenToWorld(screenX, screenY);
    const pickRadius = PICK_RADIUS / this.view.zoom;
    const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];

    let best: ControlPointSelection | null = null;
    let bestDistance = Infinity;

    curves.forEach((curve, curveIndex) => {
      keys.forEach((pointKey) => {
        if ((pointKey === "p1" || pointKey === "p2") && !this.isHandleVisible(curveIndex, pointKey)) {
          return;
        }
        const distance = curve[pointKey].minus(cursor).length();
        if (distance <= pickRadius && distance < bestDistance) {
          bestDistance = distance;
          best = { curveIndex, pointKey };
        }
      });
    });

    return best;
  }

  private pickCurve(screenX: number, screenY: number): number | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    const result = this.sequence.path.pickCurve(cursor, tolerance);
    return result ? result.curveIndex : null;
  }

  private handleCurveSelection(curveIndex: number, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedCurves.has(curveIndex)) this.selectedCurves.delete(curveIndex);
      else this.selectedCurves.add(curveIndex);
    } else if (!this.selectedCurves.has(curveIndex)) {
      this.selectedCurves = new Set([curveIndex]);
    }
    if (this.selectedCurves.size > 0) this.selected.clear();
  }

  private screenToWorld(screenX: number, screenY: number): Vector<2> {
    return new Vector<2>(
      this.view.center.x + (screenX - this.width / 2) / this.view.zoom,
      this.view.center.y - (screenY - this.height / 2) / this.view.zoom,
    );
  }

  private worldToScreen(world: Vector<2>): [number, number] {
    return [
      this.width / 2 + (world.x - this.view.center.x) * this.view.zoom,
      this.height / 2 - (world.y - this.view.center.y) * this.view.zoom,
    ];
  }

  private screenPosition(event: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private updateElementKeyframes(element: Element) {
    if (this.isProvisionalElement(element)) return;
    this.sequence.updateElementKeyframes(element);
  }

  private notifySequenceChange() {
    if (this.onSequenceChange) this.onSequenceChange();
  }

  private handleWheel(event: WheelEvent) {
    event.preventDefault();
    const [screenX, screenY] = this.screenPosition(event);
    const worldBefore = this.screenToWorld(screenX, screenY);

    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * Math.pow(ZOOM_FACTOR, -event.deltaY)));

    this.view.center = new Vector<2>(
      worldBefore.x - (screenX - this.width / 2) / this.view.zoom,
      worldBefore.y + (screenY - this.height / 2) / this.view.zoom,
    );

    this.draw();
  }

  private handleMouseDown(event: MouseEvent) {
    event.preventDefault();

    if (event.button === 2) {
      this.isPanning = true;
      const [screenX, screenY] = this.screenPosition(event);
      this.lastPanX = screenX;
      this.lastPanY = screenY;
      return;
    }

    if (event.button === 0) {
      const [screenX, screenY] = this.screenPosition(event);

      if (this.mode === "view") return;

      if (this.mode !== "path") {
        if (this.hitProvisionalAddButton(screenX, screenY)) {
          this.addProvisionalElement();
          return;
        }
        if (this.hitElementCogButton(screenX, screenY) && this.onElementChangeRequest) {
          const element = this.getElementDeleteButtonElement();
          if (element) this.onElementChangeRequest(element);
          return;
        }
        if (this.hitElementDeleteButton(screenX, screenY)) {
          const element = this.getElementDeleteButtonElement();
          if (element) {
            this.sequence.removeElement(element);
            this.selectedElements.delete(element);
            this.notifySequenceChange();
            this.draw();
          }
          return;
        }
        const element = this.pickElement(screenX, screenY);
        if (element) {
          if (!this.isProvisionalElement(element)) this.provisionalElement = null;
          if (!this.isProvisionalElement(element)) this.selectElement(element, event.ctrlKey);
          const pointHit = this.pickElementControlPoint(screenX, screenY);
          if (pointHit?.element === element) {
            this.isDraggingElementPoint = true;
            this.dragElement = element;
            this.dragElementPointIsStart = pointHit.isStart;
          } else {
            this.startElementSegmentDrag(element, screenX, screenY);
          }
        } else {
          const u = this.pickPathCoordinate(screenX, screenY);
          if (u != null) {
            this.startProvisionalCreation(u);
          } else {
            this.isSelectingRect = true;
            this.rectDidMove = false;
            this.rectTargetsElements = true;
            this.rectAddToSelection = event.ctrlKey;
            this.rectStartX = screenX;
            this.rectStartY = screenY;
            this.rectEndX = screenX;
            this.rectEndY = screenY;
          }
          this.draw();
          return;
        }
        this.draw();
        return;
      }

      if (this.hitDeleteButton(screenX, screenY)) {
        const removable = this.getRemovablePoint();
        if (removable) {
          if (removable.isStart) {
            this.sequence.path.removeStartCurve();
          } else if (removable.isEnd) {
            this.sequence.path.removeEndCurve();
          } else {
            const [curveBefore] = this.sequence.path.getCurvesAroundPoint(removable.point);
            this.jointDeletionSnapshot = this.makeJointDeletionSnapshot(this.sequence.path.curves.indexOf(curveBefore));
            this.sequence.path.removePoint(removable.point);
            this.remapElementsAfterCurveRemoval();
          }
          this.selected.clear();
          this.notifySequenceChange();
          this.draw();
        }
        return;
      }
      if (this.hitAddButton(screenX, screenY)) {
        this.addSegmentEnd();
        return;
      }
      const splitCurveIndex = this.hitSplitButton(screenX, screenY);
      if (splitCurveIndex != null) {
        const curve = this.sequence.path.curves[splitCurveIndex];
        if (curve) {
          const mid = curve.getHalfLengthCoordinate();
          this.sequence.path.cut(splitCurveIndex, mid);
          const newSelected = new Set<number>();
          for (const idx of this.selectedCurves) {
            if (idx < splitCurveIndex) newSelected.add(idx);
            else if (idx > splitCurveIndex) newSelected.add(idx + 1);
          }
          newSelected.add(splitCurveIndex);
          newSelected.add(splitCurveIndex + 1);
          this.selectedCurves = newSelected;
          this.notifySequenceChange();
          this.draw();
        }
        return;
      }
      const picked = this.pickControlPoint(screenX, screenY);
      if (picked) {
        const key = this.keyOf(picked.curveIndex, picked.pointKey);
        if (event.ctrlKey) {
          if (this.selected.has(key)) this.selected.delete(key);
          else this.selected.add(key);
        } else if (!this.selected.has(key)) {
          this.selected = new Set([key]);
        }
        if (this.selected.size > 0) this.selectedCurves.clear();
        if (this.selected.has(key)) {
          this.isDraggingPoint = true;
          this.dragOrigin = this.sequence.path.curves[picked.curveIndex]?.[picked.pointKey].copy() ?? null;
          this.lastDragDelta = new Vector<2>(0, 0);
          this.jointMoveSnapshot =
            picked.pointKey === "p0" || picked.pointKey === "p3"
              ? this.makeJointMoveSnapshot(picked.curveIndex, picked.pointKey)
              : null;
        }
      } else {
        const curveIndex = this.pickCurve(screenX, screenY);
        if (curveIndex != null) {
          this.handleCurveSelection(curveIndex, event.ctrlKey);
          if (this.selectedCurves.has(curveIndex)) {
            this.isDraggingCurve = true;
            this.dragOrigin = this.screenToWorld(screenX, screenY);
            this.lastDragDelta = new Vector<2>(0, 0);
          }
        } else {
          this.isSelectingRect = true;
          this.rectDidMove = false;
          this.rectTargetsElements = false;
          this.rectAddToSelection = event.ctrlKey;
          this.rectStartX = screenX;
          this.rectStartY = screenY;
          this.rectEndX = screenX;
          this.rectEndY = screenY;
          if (!event.ctrlKey) this.selected.clear();
          this.selectedCurves.clear();
        }
      }
      this.draw();
    }
  }

  private handleMouseMove(event: MouseEvent) {
    if (this.isPanning) {
      const [screenX, screenY] = this.screenPosition(event);
      const deltaX = screenX - this.lastPanX;
      const deltaY = screenY - this.lastPanY;
      this.lastPanX = screenX;
      this.lastPanY = screenY;

      this.view.center = this.view.center.plus(new Vector<2>(-deltaX, deltaY).times(1 / this.view.zoom));
      this.draw();
      return;
    }

    if (this.isSelectingRect) {
      const [screenX, screenY] = this.screenPosition(event);
      if (
        Math.abs(screenX - this.rectStartX) > RECT_CLICK_THRESHOLD ||
        Math.abs(screenY - this.rectStartY) > RECT_CLICK_THRESHOLD
      ) {
        this.rectDidMove = true;
      }
      this.rectEndX = screenX;
      this.rectEndY = screenY;
      this.draw();
      return;
    }

    if (this.isCreatingProvisional) {
      const [screenX, screenY] = this.screenPosition(event);
      this.updateProvisionalCreation(this.screenToWorld(screenX, screenY));
      return;
    }

    if (this.isDraggingElementPoint) {
      const [screenX, screenY] = this.screenPosition(event);
      if (!this.dragElement) return;
      const world = this.screenToWorld(screenX, screenY);
      const u = this.snapElementPointToPath(this.dragElement, this.dragElementPointIsStart, world);
      if (u != null) {
        if (this.dragElementPointIsStart) this.dragElement.start = u;
        else this.dragElement.end = u;
        this.updateElementKeyframes(this.dragElement);
        this.sequenceMutated = true;
      }
      this.draw();
      return;
    }

    if (this.isDraggingElementSegment) {
      const [screenX, screenY] = this.screenPosition(event);
      const world = this.screenToWorld(screenX, screenY);
      const path = this.sequence.path;
      const currentGrab = this.snapCursorToPathAnywhere(world);
      if (currentGrab != null) {
        const delta =
          (currentGrab as number) >= this.segmentDragGrabU
            ? path.arcLengthBetween(this.segmentDragGrabU as PathCoordinate, currentGrab as PathCoordinate)
            : -path.arcLengthBetween(currentGrab as PathCoordinate, this.segmentDragGrabU as PathCoordinate);
        const clamped = Math.min(Math.max(delta, this.segmentDragDeltaMin), this.segmentDragDeltaMax);
        for (const item of this.segmentDragItems) {
          item.element.start = path.moveAlongByArcLength(item.start0 as PathCoordinate, clamped);
          item.element.end = path.moveAlongByArcLength(item.end0 as PathCoordinate, clamped);
          this.updateElementKeyframes(item.element);
        }
        this.sequenceMutated = true;
      }
      this.draw();
      return;
    }

    if (this.isDraggingCurve) {
      const [screenX, screenY] = this.screenPosition(event);
      if (!this.dragOrigin) return;
      const world = this.screenToWorld(screenX, screenY);
      const delta = world.minus(this.dragOrigin);
      const change = delta.minus(this.lastDragDelta);
      this.lastDragDelta = delta;
      this.translateSelectedCurves(change);
      return;
    }

    if (this.isDraggingPoint) {
      const [screenX, screenY] = this.screenPosition(event);
      if (this.selected.size === 1) {
        const [ciStr, pkStr] = [...this.selected][0]!.split(":");
        const curveIndex = Number(ciStr);
        const pointKey = pkStr as ControlPointKey;
        const curve = this.sequence.path.curves[curveIndex];
        const point = curve?.[pointKey];
        if (!curve || !point) return;

        const world = this.screenToWorld(screenX, screenY);
        const delta = world.minus(point);
        point.x = world.x;
        point.y = world.y;
        this.alignNeighbors(curveIndex, pointKey, delta);
        this.sequence.path.updateLength();
        if (pointKey === "p0" || pointKey === "p3") this.remapElementsAfterJointMove();
        this.sequenceMutated = true;
        this.draw();
      } else if (this.dragOrigin) {
        const world = this.screenToWorld(screenX, screenY);
        const delta = world.minus(this.dragOrigin);
        const change = delta.minus(this.lastDragDelta);
        this.lastDragDelta = delta;
        this.translateGroup(change);
      }
    }
  }

  private translateGroup(delta: Vector<2>) {
    const curves = this.sequence.path.curves;

    const moveKeys = new Set<string>();
    for (const key of this.selected) moveKeys.add(key);
    for (const key of this.selected) {
      const [ciStr, pkStr] = key.split(":");
      const curveIndex = Number(ciStr);
      const pointKey = pkStr as ControlPointKey;
      if (pointKey === "p0") {
        moveKeys.add(this.keyOf(curveIndex, "p1"));
        if (curveIndex > 0) moveKeys.add(this.keyOf(curveIndex - 1, "p2"));
      } else if (pointKey === "p3") {
        moveKeys.add(this.keyOf(curveIndex, "p2"));
        if (curveIndex < curves.length - 1) moveKeys.add(this.keyOf(curveIndex + 1, "p1"));
      }
    }

    const moved = new Set<Vector<2>>();
    for (const key of moveKeys) {
      const point = curves[Number(key.split(":")[0])]?.[key.split(":")[1] as ControlPointKey];
      if (point) moved.add(point);
    }
    for (const point of moved) {
      point.x += delta.x;
      point.y += delta.y;
    }

    this.sequence.path.updateLength();
    this.sequenceMutated = true;
    this.draw();
  }

  private translateSelectedCurves(delta: Vector<2>) {
    const curves = this.sequence.path.curves;

    const moved = new Set<Vector<2>>();
    for (const curveIndex of this.selectedCurves) {
      const curve = curves[curveIndex];
      if (!curve) continue;
      moved.add(curve.p0);
      moved.add(curve.p1);
      moved.add(curve.p2);
      moved.add(curve.p3);
      if (curveIndex > 0) moved.add(curves[curveIndex - 1]!.p2);
      if (curveIndex < curves.length - 1) moved.add(curves[curveIndex + 1]!.p1);
    }

    for (const point of moved) {
      point.x += delta.x;
      point.y += delta.y;
    }

    this.sequence.path.updateLength();
    this.sequenceMutated = true;
    this.draw();
  }

  private finishSelectionRectangle() {
    if (this.rectTargetsElements) {
      this.finishElementSelectionRectangle();
      return;
    }
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const curves = this.sequence.path.curves;
    const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
    const hits: string[] = [];
    curves.forEach((curve, curveIndex) => {
      keys.forEach((pointKey) => {
        if ((pointKey === "p1" || pointKey === "p2") && !this.isHandleVisible(curveIndex, pointKey)) return;
        const [screenX, screenY] = this.worldToScreen(curve[pointKey]);
        if (screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1) {
          hits.push(this.keyOf(curveIndex, pointKey));
        }
      });
    });

    if (this.rectAddToSelection) {
      for (const hit of hits) this.selected.add(hit);
    } else {
      this.selected = new Set(hits);
    }
    this.selectedCurves.clear();
  }

  private finishElementSelectionRectangle() {
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const hits = new Set<Element>();
    if (this.rectAddToSelection) for (const element of this.selectedElements) hits.add(element);
    for (const element of this.sequence.elements) {
      const inside = this.getElementPoints(element).some((point) => {
        const [screenX, screenY] = this.worldToScreen(point);
        return screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1;
      });
      if (inside) hits.add(element);
    }
    this.selectedElements = hits;
    this.selected.clear();
    this.selectedCurves.clear();
  }

  private selectAll() {
    const curves = this.sequence.path.curves;
    const keys: ControlPointKey[] = ["p0", "p3"];
    curves.forEach((curve, curveIndex) => {
      keys.forEach((pointKey) => {
        this.selected.add(this.keyOf(curveIndex, pointKey));
      });
    });
    this.selectedCurves.clear();
    this.draw();
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (this.mode === "path" && event.ctrlKey && (event.key === "a" || event.key === "A")) {
      event.preventDefault();
      this.selectAll();
    }
  }

  private makeJointMoveSnapshot(curveIndex: number, pointKey: "p0" | "p3") {
    const curves = this.sequence.path.curves;
    const jointCurveIndex = pointKey === "p3" ? curveIndex : curveIndex - 1;
    if (jointCurveIndex < 0 && curves.length === 0) return null;

    const curveStarts: number[] = [];
    const curveLengths: number[] = [];
    let cumulated = 0;
    for (const curve of curves) {
      curveStarts.push(cumulated);
      curveLengths.push(curve.length);
      cumulated += curve.length;
    }

    const items: Array<{ element: Element; start: number; end: number }> = [];
    const elements =
      this.provisionalElement != null ? [...this.sequence.elements, this.provisionalElement] : this.sequence.elements;
    for (const element of elements) {
      items.push({ element, start: element.start as number, end: element.end as number });
    }
    return { jointCurveIndex, curveStarts, curveLengths, items };
  }

  private remapElementsAfterJointMove() {
    const snapshot = this.jointMoveSnapshot;
    if (!snapshot) return;

    const newCurveStarts: number[] = [];
    const newCurveLengths: number[] = [];
    let cumulated = 0;
    for (const curve of this.sequence.path.curves) {
      newCurveStarts.push(cumulated);
      newCurveLengths.push(curve.length);
      cumulated += curve.length;
    }

    for (const item of snapshot.items) {
      item.element.start = remapUniformAtJoint(
        item.start,
        snapshot.curveStarts,
        snapshot.curveLengths,
        newCurveStarts,
        newCurveLengths,
      ) as PathCoordinate;
      item.element.end = remapUniformAtJoint(
        item.end,
        snapshot.curveStarts,
        snapshot.curveLengths,
        newCurveStarts,
        newCurveLengths,
      ) as PathCoordinate;
      this.updateElementKeyframes(item.element);
    }
  }

  private axisTables(): { curveStarts: number[]; curveLengths: number[] } {
    const curveStarts: number[] = [];
    const curveLengths: number[] = [];
    let cumulated = 0;
    for (const curve of this.sequence.path.curves) {
      curveStarts.push(cumulated);
      curveLengths.push(curve.length);
      cumulated += curve.length;
    }
    return { curveStarts, curveLengths };
  }

  private makeJointDeletionSnapshot(jointOldIndex: number) {
    const { curveStarts, curveLengths } = this.axisTables();

    const items: Array<{ element: Element; start: number; end: number }> = [];
    const elements =
      this.provisionalElement != null ? [...this.sequence.elements, this.provisionalElement] : this.sequence.elements;
    for (const element of elements) {
      items.push({ element, start: element.start as number, end: element.end as number });
    }
    return { jointOldIndex, curveStarts, curveLengths, items };
  }

  private remapElementsAfterCurveRemoval() {
    const snapshot = this.jointDeletionSnapshot;
    if (!snapshot) return;

    const { curveStarts, curveLengths } = this.axisTables();

    for (const item of snapshot.items) {
      item.element.start = remapUniformAtRemoval(
        item.start,
        snapshot.curveStarts,
        snapshot.curveLengths,
        curveStarts,
        curveLengths,
        snapshot.jointOldIndex,
        2,
      ) as PathCoordinate;
      item.element.end = remapUniformAtRemoval(
        item.end,
        snapshot.curveStarts,
        snapshot.curveLengths,
        curveStarts,
        curveLengths,
        snapshot.jointOldIndex,
        2,
      ) as PathCoordinate;
      this.updateElementKeyframes(item.element);
    }
    this.jointDeletionSnapshot = null;
  }

  private alignNeighbors(curveIndex: number, pointKey: ControlPointKey, delta: Vector<2>) {
    const curves = this.sequence.path.curves;
    const curve = curves[curveIndex];
    if (!curve) return;

    if (pointKey === "p0" || pointKey === "p3") {
      if (pointKey === "p0") curve.p1 = curve.p1.plus(delta);
      else curve.p2 = curve.p2.plus(delta);

      if (pointKey === "p0" && curveIndex > 0) {
        curves[curveIndex - 1]!.p2 = curves[curveIndex - 1]!.p2.plus(delta);
      } else if (pointKey === "p3" && curveIndex < curves.length - 1) {
        curves[curveIndex + 1]!.p1 = curves[curveIndex + 1]!.p1.plus(delta);
      }
    } else if (pointKey === "p1" && curveIndex > 0) {
      curves[curveIndex - 1]!.alignEnd(curve, curve.p1.minus(curve.p0).length());
    } else if (pointKey === "p2" && curveIndex < curves.length - 1) {
      curves[curveIndex + 1]!.alignStart(curve, curve.p2.minus(curve.p3).length());
    }
  }

  private handleMouseUp() {
    if (this.isSelectingRect) {
      if (this.rectDidMove) {
        this.finishSelectionRectangle();
      } else if (this.rectTargetsElements) {
        this.provisionalElement = null;
        this.selectedElements.clear();
      }
      this.isSelectingRect = false;
    }
    this.isPanning = false;
    this.isDraggingPoint = false;
    this.isDraggingCurve = false;
    this.isDraggingElementPoint = false;
    this.isDraggingElementSegment = false;
    this.isCreatingProvisional = false;
    this.jointMoveSnapshot = null;
    this.dragElement = null;
    this.dragOrigin = null;
    this.lastDragDelta = new Vector<2>(0, 0);
    if (this.sequenceMutated) {
      this.sequenceMutated = false;
      this.notifySequenceChange();
      this.draw();
    } else {
      this.draw();
    }
  }

  private resize() {
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.ctx.width = this.canvas.clientWidth;
    this.ctx.height = this.canvas.clientHeight;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.draw();
  }
}

export function remapUniformAtJoint(
  oldU: number,
  oldCurveStarts: number[],
  oldCurveLengths: number[],
  newCurveStarts: number[],
  newCurveLengths: number[],
): number {
  const oldCount = oldCurveStarts.length;
  const newCount = newCurveStarts.length;
  if (oldCount === 0 || newCount === 0) return 0;

  const newTotal = newCurveStarts[newCount - 1]! + (newCurveLengths[newCount - 1] ?? 0);

  let index = 0;
  for (let i = 0; i < oldCount; i++) {
    if (oldU >= oldCurveStarts[i]!) index = i;
  }

  const oldLen = oldCurveLengths[index] ?? 0;
  const ratio = oldLen > 0 ? (oldU - oldCurveStarts[index]!) / oldLen : 0;

  const clampedIndex = Math.min(index, newCount - 1);
  const newStart = newCurveStarts[clampedIndex] ?? 0;
  const newLen = newCurveLengths[clampedIndex] ?? 0;
  return Math.max(0, Math.min(newTotal, newStart + ratio * newLen));
}

export function remapUniformAtRemoval(
  oldU: number,
  oldCurveStarts: number[],
  oldCurveLengths: number[],
  newCurveStarts: number[],
  newCurveLengths: number[],
  mergedOldIndex: number,
  mergedOldCount: number,
): number {
  const oldCount = oldCurveStarts.length;
  const newCount = newCurveStarts.length;
  if (oldCount === 0 || newCount === 0) return 0;

  const newTotal = newCurveStarts[newCount - 1]! + (newCurveLengths[newCount - 1] ?? 0);

  let index = 0;
  for (let i = 0; i < oldCount; i++) {
    if (oldU >= oldCurveStarts[i]!) index = i;
  }

  const onMerged = index >= mergedOldIndex && index < mergedOldIndex + mergedOldCount;
  const baseStart = onMerged ? oldCurveStarts[mergedOldIndex]! : oldCurveStarts[index]!;
  let baseLength = 0;
  if (onMerged) {
    for (let i = 0; i < mergedOldCount; i++) baseLength += oldCurveLengths[mergedOldIndex + i] ?? 0;
  } else {
    baseLength = oldCurveLengths[index] ?? 0;
  }
  const ratio = baseLength > 0 ? (oldU - baseStart) / baseLength : 0;

  const newCurveIndex = index < mergedOldIndex ? index : onMerged ? mergedOldIndex : index - (mergedOldCount - 1);
  const clampedIndex = Math.min(newCurveIndex, newCount - 1);
  const newStart = newCurveStarts[clampedIndex] ?? 0;
  const newLen = newCurveLengths[clampedIndex] ?? 0;
  return Math.max(0, Math.min(newTotal, newStart + ratio * newLen));
}

function distanceToSegment(p: Vector<2>, a: Vector<2>, b: Vector<2>): number {
  const ab = b.minus(a);
  const lengthSquared = ab.lengthSquared();
  if (lengthSquared === 0) {
    return p.minus(a).length();
  }
  let t = p.minus(a).dot(ab) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return p.minus(a.plus(ab.times(t))).length();
}
