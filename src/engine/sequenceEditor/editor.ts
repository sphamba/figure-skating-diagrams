import type { Curvilinear, Curve } from "../curve.js";
import { type AxisRect } from "../curve.js";
import { bladeLength } from "../constants.js";
import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element/element.js";
import type { DynamicGlide } from "../element/stroke.js";
import type { Path } from "../path.js";
import { LENGTH, WIDTH, CORNER_RADIUS } from "../rink.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { createDefaultFootTurn, isJumpType } from "../element/turnTypes.js";
import { TimingKeyframe } from "../keyframe.js";
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
const MIN_MARK_SIZE = 12; // px minimum toe-pick mark diameter when zoomed out
const MIN_DRAW_INCREMENT = 2; // px
const ELEMENTS_PATH_COLOR = "#000";
const LABEL_FONT_SIZE = 14; // px
const LABEL_OFFSET = 15; // px
const LABEL_FONT_SIZE_SMALL = 12; // px
const CHANGE_EDGE_LABEL = "CE";
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
export const PROVISIONAL_TOTAL_LENGTH = 0.8; // m
export const DEFAULT_START_ELEMENT_LENGTH = 0.4; // m, total span of the default starting element
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

export type EditMode = "view" | "path" | "elements" | "timing";

export type ControlPointSelection = {
  sequence: Sequence;
  curveIndex: number;
  pointKey: ControlPointKey;
};

type JointMoveSnapshot = {
  sequence: Sequence;
  jointCurveIndex: number;
  curveStarts: number[];
  curveLengths: number[];
  items: Array<{ element: Element; start: number; end: number }>;
  timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }>;
};

type JointDeletionSnapshot = {
  sequence: Sequence;
  jointOldIndex: number;
  curveStarts: number[];
  curveLengths: number[];
  items: Array<{ element: Element; start: number; end: number }>;
  timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }>;
};

export class Editor {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2DSized;
  width = 0;
  height = 0;

  sequences: Sequence[] = [];
  mode: EditMode = "view";
  scaleElements = true;
  private view: ViewState;

  private selectedPoints = new Map<Sequence, Set<string>>();
  onElementChangeRequest?: (element: Element) => void;
  onSequenceChange?: () => void;
  private sequenceMutated = false;
  private selectedCurves = new Map<Sequence, Set<number>>();
  private selectedElements = new Set<Element>();
  private isPanning = false;
  private isDraggingPoint = false;
  private isDraggingCurve = false;
  private isSelectingRect = false;
  private provisionalElements = new Map<Sequence, Element>();
  private creatingSequence: Sequence | null = null;
  private isCreatingProvisional = false;
  private provisionalOriginU = 0;
  private provisionalTimingKeyframes = new Map<Sequence, TimingKeyframe>();
  private selectedTimingKeyframes = new Set<TimingKeyframe>();
  private isCreatingProvisionalTiming = false;
  private timingCreatingSequence: Sequence | null = null;
  private timingDragGrabU = 0;
  private timingDragDeltaMin = -Infinity;
  private timingDragDeltaMax = Infinity;
  private isDraggingTimingPoint = false;
  private draggingTimingKeyframe: TimingKeyframe | null = null;
  private dragTimingSequence: Sequence | null = null;
  private dragTimingItems: Array<{
    keyframe: TimingKeyframe;
    sequence: Sequence;
    u0: number;
    left: number;
    right: number;
  }> = [];
  private isDraggingElementPoint = false;
  private dragElement: Element | null = null;
  private dragElementPointIsStart = false;
  private dragSequence: Sequence | null = null;
  private isDraggingElementSegment = false;
  private segmentDragItems: Array<{ element: Element; start0: number; end0: number }> = [];
  private segmentDragDeltaMin = -Infinity;
  private segmentDragDeltaMax = Infinity;
  private segmentDragGrabU = 0;
  private jointMoveSnapshot: JointMoveSnapshot | null = null;
  private jointDeletionSnapshot: JointDeletionSnapshot | null = null;
  private rectAddToSelection = false;
  private rectTargetsElements = false;
  private rectTargetsTiming = false;
  private rectDidMove = false;
  private rectStartX = 0;
  private rectStartY = 0;
  private rectEndX = 0;
  private rectEndY = 0;
  private dragOrigin: Vector<2> | null = null;
  private lastDragDelta = new Vector<2>(0, 0);
  private lastPanX = 0;
  private lastPanY = 0;
  private touchMode: "none" | "one" | "two" = "none";
  private lastPinchDist = 0;
  private lastPinchMidX = 0;
  private lastPinchMidY = 0;
  private drawScheduled = false;
  private drawFrameHandle: number | null = null;

  private onWheel = (event: WheelEvent) => this.handleWheel(event);
  private onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private onMouseMove = (event: MouseEvent) => this.handleMove(...this.screenPosition(event));
  private onMouseUp = () => this.handleMouseUp();
  private onTouchStart = (event: TouchEvent) => this.handleTouchStart(event);
  private onTouchMove = (event: TouchEvent) => this.handleTouchMove(event);
  private onTouchEnd = (event: TouchEvent) => this.handleTouchEnd(event);
  private onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private onContextMenu = (event: MouseEvent) => event.preventDefault();
  private onWindowResize = () => this.resize();
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, sequences: Sequence[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2DSized;
    this.sequences = sequences;

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
    canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    canvas.addEventListener("touchend", this.onTouchEnd);
    canvas.addEventListener("touchcancel", this.onTouchEnd);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("resize", this.onWindowResize);

    this.draw();
  }

  destroy() {
    if (this.drawFrameHandle !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.drawFrameHandle);
      this.drawFrameHandle = null;
    }
    this.drawScheduled = false;
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.canvas.removeEventListener("touchcancel", this.onTouchEnd);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("resize", this.onWindowResize);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  setSequences(sequences: Sequence[]) {
    this.sequences = sequences;
    this.sequenceMutated = false;
    this.jointMoveSnapshot = null;
    this.jointDeletionSnapshot = null;
    this.selectedPoints.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElements.clear();
    this.creatingSequence = null;
    this.isCreatingProvisional = false;
    this.dragSequence = null;
    this.dragElement = null;
    this.touchMode = "none";
    this.provisionalTimingKeyframes.clear();
    this.selectedTimingKeyframes.clear();
    this.isCreatingProvisionalTiming = false;
    this.timingCreatingSequence = null;
    this.dragTimingItems = [];
    this.draggingTimingKeyframe = null;
    this.dragTimingSequence = null;
    this.draw();
  }

  getSequences(): Sequence[] {
    return this.sequences;
  }

  getSequenceOfElement(element: Element): Sequence | null {
    for (const sequence of this.sequences) {
      if (sequence.elements.includes(element)) return sequence;
    }
    for (const [sequence, provisional] of this.provisionalElements) {
      if (provisional === element) return sequence;
    }
    return null;
  }

  getSelectedPointsFor(sequence: Sequence): Set<string> {
    let selected = this.selectedPoints.get(sequence);
    if (!selected) {
      selected = new Set<string>();
      this.selectedPoints.set(sequence, selected);
    }
    return selected;
  }

  getSelectedCurvesFor(sequence: Sequence): Set<number> {
    let selected = this.selectedCurves.get(sequence);
    if (!selected) {
      selected = new Set<number>();
      this.selectedCurves.set(sequence, selected);
    }
    return selected;
  }

  clearSelection() {
    this.selectedPoints.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.selectedTimingKeyframes.clear();
    this.provisionalElements.clear();
    this.provisionalTimingKeyframes.clear();
    this.creatingSequence = null;
    this.isCreatingProvisional = false;
    this.timingCreatingSequence = null;
    this.isCreatingProvisionalTiming = false;
  }

  replaceSelectedElement(oldElement: Element, newElement: Element) {
    if (this.selectedElements.delete(oldElement)) {
      this.selectedElements.add(newElement);
    }
  }

  replaceElementOf(oldElement: Element, newElement: Element): Sequence | null {
    const sequence = this.getSequenceOfElement(oldElement);
    if (!sequence) return null;
    sequence.replaceElement(oldElement, newElement);
    this.replaceSelectedElement(oldElement, newElement);
    return sequence;
  }

  addSegmentEnd(sequence: Sequence) {
    sequence.path.addCurveEnd();
    this.notifySequenceChange();
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.transformContext();
    this.drawRink();
    if (this.mode !== "view") {
      for (const sequence of this.sequences) {
        this.drawPath(sequence);
      }
    }
    this.drawSelectedCurves();
    if (this.mode === "path") {
      for (const sequence of this.sequences) {
        this.drawControlHandles(sequence);
      }
      this.drawAddButtons();
      this.drawSplitButtons();
      this.drawDeleteButtons();
    } else if (this.mode === "elements") {
      this.drawElements();
    } else if (this.mode === "view") {
      this.drawTraces();
      this.drawTimingBeatLabels();
    } else if (this.mode === "timing") {
      this.drawTimingElements();
      this.drawTimingKeyframes();
      this.drawTimingButtons();
      this.drawTimingTimeLabels();
      this.drawTimingBeatLabels();
    }
    if (this.mode === "path" || this.mode === "elements") {
      this.drawCurvatureWarnings();
    }
    for (const sequence of this.sequences) {
      this.drawElementLabels(sequence);
    }
    this.drawInflectionLabels();
    this.drawStartLabels();
    ctx.restore();
    this.drawSelectionRectangle();
  }

  requestDraw() {
    if (typeof requestAnimationFrame !== "function") {
      this.draw();
      return;
    }
    if (this.drawScheduled) return;
    this.drawScheduled = true;
    this.drawFrameHandle = requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.drawFrameHandle = null;
      this.draw();
    });
  }

  private drawTraces() {
    const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
    const minBladeLength = this.scaleElements ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    const minMarkSize = MIN_MARK_SIZE / this.view.zoom;
    const minDrawIncrement = MIN_DRAW_INCREMENT / this.view.zoom;
    const viewport = this.getTraceViewport(minBladeLength);
    for (const sequence of this.sequences) {
      this.drawMetres(() =>
        sequence.drawTraces(this.ctx, minTraceWidth, minBladeLength, minMarkSize, minDrawIncrement, viewport),
      );
    }
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

  private drawPath(sequence: Sequence) {
    if (sequence.path.curves.length == 0) {
      return;
    }
    const pathWidth = PATH_WIDTH / this.view.zoom;
    const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
    const minBladeLength =
      this.scaleElements && this.mode !== "elements" ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    const minMarkSize = MIN_MARK_SIZE / this.view.zoom;
    const pathColor = this.mode === "elements" ? ELEMENTS_PATH_COLOR : undefined;
    const minDrawIncrement = MIN_DRAW_INCREMENT / this.view.zoom;
    const viewport = this.getTraceViewport(minBladeLength);
    if ((this.mode === "path" || this.mode === "timing") && !pathColor) {
      this.drawMetres(() => sequence.drawPath(this.ctx, pathWidth, 0 as PathCoordinate, undefined, pathColor));
      this.ctx.globalAlpha = 0.3;
      this.drawMetres(() =>
        sequence.drawFootTraces(
          this.ctx,
          0 as PathCoordinate,
          undefined,
          minTraceWidth,
          minBladeLength,
          minMarkSize,
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
          minMarkSize,
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
          minMarkSize,
          minDrawIncrement,
          viewport,
        ),
      );
    }
  }

  private sortedTimingKeyframes(sequence: Sequence): TimingKeyframe[] {
    return [...sequence.keyframes.time].sort((a, b) => (a.pathCoordinate as number) - (b.pathCoordinate as number));
  }

  private drawTimingKeyframes() {
    const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      for (const keyframe of this.sortedTimingKeyframes(sequence)) {
        const point = sequence.path.getPosition(keyframe.pathCoordinate);
        this.ctx.fillStyle = this.selectedTimingKeyframes.has(keyframe) ? "#d33" : "#444";
        this.ctx.beginPath();
        this.ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        this.ctx.fill();
      }
      const provisional = this.provisionalTimingKeyframes.get(sequence);
      if (provisional) {
        const point = sequence.path.getPosition(provisional.pathCoordinate);
        this.ctx.fillStyle = PROVISIONAL_COLOR;
        this.ctx.beginPath();
        this.ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    }
  }

  private getTimingKeyframeGeometry(
    sequence: Sequence,
    keyframe: TimingKeyframe,
  ): { point: Vector<2>; outside: Vector<2> } | null {
    if (sequence.path.curves.length === 0) return null;
    return this.getLabelGeometryInside(sequence.path, keyframe.pathCoordinate);
  }

  private drawTimingButtons() {
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom;
    for (const [sequence, provisional] of this.provisionalTimingKeyframes) {
      const geometry = this.getTimingKeyframeGeometry(sequence, provisional);
      if (!geometry) continue;
      this.drawPlusInCircleWithColor(geometry.point.plus(geometry.outside.times(offset)), PROVISIONAL_COLOR);
    }
    const selected = this.getSingleSelectedTimingKeyframe();
    if (!selected) return;
    const sequence = this.getSequenceOfTimingKeyframe(selected);
    const geometry = sequence ? this.getTimingKeyframeGeometry(sequence, selected) : null;
    if (!geometry) return;
    this.drawMinusInCircle(geometry.point.plus(geometry.outside.times(offset)));
    this.drawCogInCircle(geometry.point.plus(geometry.outside.times(-offset)));
  }

  private hitTimingButton(keyframe: TimingKeyframe, side: 1 | -1, screenX: number, screenY: number): boolean {
    const owner = this.getSequenceOfTimingKeyframe(keyframe);
    if (!owner) return false;
    const geometry = this.getTimingKeyframeGeometry(owner, keyframe);
    if (!geometry) return false;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom;
    const [iconX, iconY] = this.worldToScreen(geometry.point.plus(geometry.outside.times(offset * side)));
    return Math.hypot(screenX - iconX, screenY - iconY) <= DELETE_BUTTON_HIT_RADIUS;
  }

  private hitProvisionalTimingPlus(screenX: number, screenY: number): TimingKeyframe | null {
    for (const [sequence, provisional] of this.provisionalTimingKeyframes) {
      if (sequence.path.curves.length === 0) continue;
      if (this.hitTimingButton(provisional, 1, screenX, screenY)) return provisional;
    }
    return null;
  }

  private getSingleSelectedTimingKeyframe(): TimingKeyframe | null {
    if (this.selectedTimingKeyframes.size !== 1) return null;
    const selected = [...this.selectedTimingKeyframes][0]!;
    return this.isProvisionalTiming(selected) ? null : selected;
  }

  private hitTimingCogButton(screenX: number, screenY: number): TimingKeyframe | null {
    const selected = this.getSingleSelectedTimingKeyframe();
    if (!selected) return null;
    return this.hitTimingButton(selected, -1, screenX, screenY) ? selected : null;
  }

  private hitTimingMinusButton(screenX: number, screenY: number): TimingKeyframe | null {
    const selected = this.getSingleSelectedTimingKeyframe();
    if (!selected) return null;
    return this.hitTimingButton(selected, 1, screenX, screenY) ? selected : null;
  }

  private getLabelGeometryInside(path: Path, u: PathCoordinate): { point: Vector<2>; outside: Vector<2> } {
    const { point, tangent, curvature } = this.getLabelFrame(path, u);
    // Same frame as getLabelGeometryAt with the flipped sign: inside the curvature.
    const inside = tangent.getOrthogonal().times(curvature > 0 ? 1 : -1);
    return { point, outside: inside };
  }

  private drawTimingTimeLabels() {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      for (const keyframe of this.sortedTimingKeyframes(sequence)) {
        if (keyframe.kind !== "time") continue;
        const geometry = this.getLabelGeometryInside(sequence.path, keyframe.pathCoordinate);
        this.drawWhiteRectLabel(formatTimingLabel(keyframe.value), geometry.point, geometry.outside);
      }
    }
  }

  private drawTimingBeatLabels() {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      const sorted = this.sortedTimingKeyframes(sequence);
      for (let index = 1; index < sorted.length; index++) {
        const keyframe = sorted[index];
        if (!keyframe || keyframe.kind !== "beats") continue;
        const previous = sorted[index - 1];
        if (!previous) continue;
        const mid = (((previous.pathCoordinate as number) + keyframe.pathCoordinate) as number) / 2;
        const geometry = this.getLabelGeometryInside(sequence.path, mid as PathCoordinate);
        this.drawWhiteCircleLabel(String(Math.round(keyframe.value)), geometry.point, geometry.outside);
      }
    }
  }

  private drawWhiteRectLabel(text: string, point: Vector<2>, inside: Vector<2>, fontSize = LABEL_FONT_SIZE_SMALL) {
    const ctx = this.ctx;
    const offset = (LABEL_OFFSET * CANVAS_SCALE) / this.view.zoom;
    ctx.font = `${(fontSize * CANVAS_SCALE) / this.view.zoom}px sans-serif`;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const height = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
    if (width === 0 && height === 0) return;
    const pad = (3 * CANVAS_SCALE) / this.view.zoom;
    const a = (width + 2 * pad) / 2;
    const b = (height + 2 * pad) / 2;
    const total = offset + this.ellipseSupport(Math.abs(inside.x), Math.abs(inside.y), a, b);
    const cx = point.x * CANVAS_SCALE + inside.x * total;
    const cy = -(point.y * CANVAS_SCALE + inside.y * total);
    ctx.fillStyle = "white";
    ctx.fillRect(cx - a, cy - b, width + 2 * pad, height + 2 * pad);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
  }

  private drawWhiteCircleLabel(text: string, point: Vector<2>, inside: Vector<2>, fontSize = LABEL_FONT_SIZE_SMALL) {
    const ctx = this.ctx;
    const offset = (LABEL_OFFSET * CANVAS_SCALE) / this.view.zoom;
    ctx.font = `${(fontSize * CANVAS_SCALE) / this.view.zoom}px sans-serif`;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const height = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
    if (width === 0 && height === 0) return;
    const pad = (2 * CANVAS_SCALE) / this.view.zoom;
    const radius = Math.max(Math.hypot(width, height) / 2 + pad, (10 * CANVAS_SCALE) / this.view.zoom);
    const total = offset + radius;
    const cx = point.x * CANVAS_SCALE + inside.x * total;
    const cy = -(point.y * CANVAS_SCALE + inside.y * total);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy);
  }

  private timingNeighbourBoundsAround(
    sequence: Sequence,
    u: number,
    exclude: ReadonlySet<TimingKeyframe>,
  ): { left: number; right: number } {
    let left = 0;
    let right = sequence.path.length;
    for (const other of sequence.keyframes.time) {
      if (exclude.has(other)) continue;
      const otherU = other.pathCoordinate as number;
      if (otherU <= u) left = Math.max(left, otherU);
      else right = Math.min(right, otherU);
    }
    return { left, right };
  }

  private pickTimingKeyframe(screenX: number, screenY: number): TimingKeyframe | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    let best: TimingKeyframe | null = null;
    let bestDistance = Infinity;
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      const candidates = [...sequence.keyframes.time];
      const provisional = this.provisionalTimingKeyframes.get(sequence);
      if (provisional) candidates.push(provisional);
      for (const candidate of candidates) {
        const distance = sequence.path.getPosition(candidate.pathCoordinate).minus(cursor).length();
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          best = candidate;
        }
      }
    }
    return best;
  }

  private selectTimingKeyframe(keyframe: TimingKeyframe, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedTimingKeyframes.has(keyframe)) this.selectedTimingKeyframes.delete(keyframe);
      else this.selectedTimingKeyframes.add(keyframe);
    } else if (!this.selectedTimingKeyframes.has(keyframe)) {
      this.selectedTimingKeyframes = new Set([keyframe]);
    }
  }

  private startProvisionalTimingCreation(sequence: Sequence, u: number) {
    this.provisionalTimingKeyframes.set(sequence, this.makeProvisionalTimingKeyframe(sequence, u));
    this.isCreatingProvisionalTiming = true;
    this.timingCreatingSequence = sequence;
  }

  private makeProvisionalTimingKeyframe(sequence: Sequence, u: number): TimingKeyframe {
    const previous = [...sequence.keyframes.time]
      .sort((a, b) => a.pathCoordinate - b.pathCoordinate)
      .filter((keyframe) => keyframe.pathCoordinate < u)
      .pop();
    if (!previous) return new TimingKeyframe(u as PathCoordinate, "beats", 4);
    return new TimingKeyframe(u as PathCoordinate, previous.kind, previous.value);
  }

  private updateProvisionalTimingCreation(cursor: Vector<2>) {
    const sequence = this.timingCreatingSequence;
    if (!sequence) return;
    const provisional = this.provisionalTimingKeyframes.get(sequence);
    if (!provisional || sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return;
    const bounds = this.timingNeighbourBoundsAround(sequence, u, new Set([provisional]));
    provisional.pathCoordinate = Math.min(Math.max(u, bounds.left), bounds.right) as PathCoordinate;
    this.requestDraw();
  }

  private removeTimingKeyframe(keyframe: TimingKeyframe) {
    const sequence = this.getSequenceOfTimingKeyframe(keyframe);
    if (!sequence) return;
    sequence.keyframes.time = sequence.keyframes.time.filter((candidate) => candidate !== keyframe);
    this.selectedTimingKeyframes.delete(keyframe);
    this.notifySequenceChange();
    this.draw();
  }

  private startTimingDrag(keyframe: TimingKeyframe, screenX: number, screenY: number) {
    const sequence = this.getSequenceOfTimingKeyframe(keyframe);
    if (!sequence || sequence.path.curves.length === 0) return;

    this.isDraggingTimingPoint = true;
    this.draggingTimingKeyframe = keyframe;
    this.dragTimingSequence = sequence;
    this.dragTimingItems = [];
    this.timingDragDeltaMin = -Infinity;
    this.timingDragDeltaMax = Infinity;

    let moving = new Set<TimingKeyframe>([keyframe]);
    if (!this.isProvisionalTiming(keyframe)) {
      if (this.selectedTimingKeyframes.has(keyframe) && this.selectedTimingKeyframes.size > 1) {
        moving = new Set(this.selectedTimingKeyframes);
      }
    }

    let deltaMin = -Infinity;
    let deltaMax = Infinity;
    for (const moved of moving) {
      const owner = this.getSequenceOfTimingKeyframe(moved);
      if (!owner) continue;
      const u0 = moved.pathCoordinate as number;
      const bounds = this.timingNeighbourBoundsAround(owner, u0, moving);
      this.dragTimingItems.push({ keyframe: moved, sequence: owner, u0, left: bounds.left, right: bounds.right });
      deltaMin = Math.max(deltaMin, bounds.left - u0);
      deltaMax = Math.min(deltaMax, bounds.right - u0);
    }
    this.timingDragDeltaMin = deltaMin;
    this.timingDragDeltaMax = deltaMax;

    const cursor = this.screenToWorld(screenX, screenY);
    const grab = this.snapCursorToPathAnywhere(sequence, cursor);
    this.timingDragGrabU = grab ?? (keyframe.pathCoordinate as number);
  }

  private drawSelectedCurves() {
    if (this.selectedCurves.size == 0) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "#d33";
    ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [sequence, curveIndices] of this.selectedCurves) {
      for (const curveIndex of curveIndices) {
        const curve = sequence.path.curves[curveIndex];
        if (!curve) continue;
        this.drawMetres(() => curve.draw(ctx));
      }
    }
  }

  private drawElements() {
    const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;
    let drewElements = false;

    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      for (const element of sequence.elements) {
        drewElements = true;
        const selected = this.selectedElements.has(element);

        this.ctx.strokeStyle = selected ? "#d33" : "#000";
        this.ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
        this.drawElementSpan(sequence, element);

        this.ctx.fillStyle = selected ? "#d33" : "#444";
        for (const u of this.getDisplayedSpan(sequence, element)) {
          const point = sequence.path.getPosition(u as PathCoordinate);
          this.ctx.beginPath();
          this.ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
          this.ctx.fill();
        }
      }
    }

    for (const [sequence, element] of this.provisionalElements) {
      if (sequence.path.curves.length === 0) continue;
      drewElements = true;

      this.ctx.strokeStyle = PROVISIONAL_COLOR;
      this.ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
      this.drawElementSpan(sequence, element);

      this.ctx.fillStyle = PROVISIONAL_COLOR;
      for (const u of this.getDisplayedSpan(sequence, element)) {
        const point = sequence.path.getPosition(u as PathCoordinate);
        this.ctx.beginPath();
        this.ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    }

    if (!drewElements) return;

    this.drawElementDeleteButton();
    this.drawElementCogButton();
    this.drawProvisionalPlusButtons();
  }

  private drawTimingElements() {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      this.ctx.strokeStyle = "#000";
      this.ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
      for (const element of sequence.elements) {
        this.drawElementSpan(sequence, element);
      }
    }
  }

  private getDisplayedSpan(sequence: Sequence, element: Element): [PathCoordinate, PathCoordinate] {
    const minBladeLength =
      this.scaleElements && this.mode !== "elements" && this.mode !== "timing"
        ? MIN_BLADE_LENGTH / this.view.zoom
        : undefined;
    const scales = sequence.getSpanScales(minBladeLength);
    const factor = scales.get(element) ?? 1;
    const [start, end] = factor === 1 ? [element.start, element.end] : element.scaleAboutMiddle(factor);
    const pathLength = sequence.path.length;
    const clamp = (u: number) => Math.max(0, Math.min(pathLength, u));
    return [
      clamp(Math.min(start as number, end as number)) as PathCoordinate,
      clamp(Math.max(start as number, end as number)) as PathCoordinate,
    ];
  }

  private drawElementSpan(sequence: Sequence, element: Element) {
    const [start, end] = this.getDisplayedSpan(sequence, element);
    this.drawMetres(() => sequence.path.drawRange(this.ctx, start, end));
  }

  private getLabelFrame(path: Path, u: PathCoordinate): { point: Vector<2>; tangent: Vector<2>; curvature: number } {
    const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(u);
    const point = curve.getPosition(curvilinear);
    const tangent = curve.getDerivative(curvilinear).normalized();
    const curvature = curve.getCurvature(curvilinear);
    return { point, tangent, curvature };
  }

  private getElementLabelGeometry(
    sequence: Sequence,
    element: Element,
  ): { point: Vector<2>; outside: Vector<2> } | null {
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const anchorU = isStrokeElement(element)
      ? this.getStrokeLabelAnchor(sequence, element)
      : this.getSpanMidpoint(element);
    return this.getLabelGeometryAt(path, anchorU);
  }

  private getLabelGeometryAt(path: Path, u: PathCoordinate): { point: Vector<2>; outside: Vector<2> } {
    const { point, tangent, curvature } = this.getLabelFrame(path, u);
    const sign = curvature > 0 ? -1 : 1;
    const outside = tangent.getOrthogonal().times(sign);
    return { point, outside };
  }

  private getSpanMidpoint(element: Element): PathCoordinate {
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    return ((lo + hi) / 2) as PathCoordinate;
  }

  private getStrokeLabelAnchor(sequence: Sequence, element: DynamicGlide): PathCoordinate {
    const path = sequence.path;
    const strokeEnd = Math.max(element.start as number, element.end as number);
    const next = this.nextElementAfter(sequence, element);
    const nextStart = next ? Math.min(next.start as number, next.end as number) : path.length;
    const anchor = Math.max(0, Math.min(path.length, (strokeEnd + nextStart) / 2));
    return anchor as PathCoordinate;
  }

  private nextElementAfter(sequence: Sequence, element: Element): Element | null {
    const sorted = [...sequence.elements].sort((a, b) => (a.start as number) - (b.start as number));
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
    for (const sequence of this.sequences) {
      const checks = checkSequenceCurvatures(sequence);
      for (const check of checks) {
        if (!check.invalid) continue;
        this.drawWarningTriangle(check.point, WARNING_TRIANGLE_COLOR);
      }
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

  private drawElementLabels(sequence: Sequence) {
    if (sequence.path.curves.length === 0) return;

    for (const element of sequence.elements) {
      const geometry = this.getElementLabelGeometry(sequence, element);
      if (!geometry) continue;
      if (isJumpType(element.type)) {
        if (this.mode !== "view") {
          this.drawShiftedLabel(element.shortName, geometry.point, geometry.outside);
        } else {
          this.drawCenteredLabel(element.shortName, geometry.point);
        }
      } else {
        this.drawShiftedLabel(element.shortName, geometry.point, geometry.outside);
      }
      if (isStrokeElement(element) && element.crossed) {
        const text = this.crossedLabel(sequence, element);
        if (text) {
          const crossedGeometry = this.getLabelGeometryAt(sequence.path, this.getSpanMidpoint(element));
          this.drawShiftedLabel(text, crossedGeometry.point, crossedGeometry.outside.times(-1), LABEL_FONT_SIZE_SMALL);
        }
      }
    }
  }

  private crossedLabel(sequence: Sequence, element: DynamicGlide): string | null {
    const backward = !element.forward;
    if (element.crossedBack) {
      return backward && this.hasStrokeCurvatureSignChange(sequence, element) ? "XS" : "XB";
    }
    if (backward) return "XF";
    return this.hasStrokeCurvatureSignChange(sequence, element) ? "XS" : null;
  }

  private hasStrokeCurvatureSignChange(sequence: Sequence, element: DynamicGlide): boolean {
    const path = sequence.path;
    const [startCurve, startU] = path.getCurveAndCurvilinearCoord(element.start);
    const [endCurve, endU] = path.getCurveAndCurvilinearCoord(element.end);
    return startCurve.getCurvature(startU) * endCurve.getCurvature(endU) < 0;
  }

  private drawCenteredLabel(text: string, point: Vector<2>, fontSize = LABEL_FONT_SIZE) {
    const ctx = this.ctx;
    ctx.font = `${(fontSize * CANVAS_SCALE) / this.view.zoom}px sans-serif`;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE);
  }

  private drawShiftedLabel(text: string, point: Vector<2>, outside: Vector<2>, fontSize = LABEL_FONT_SIZE) {
    const ctx = this.ctx;
    const offset = (LABEL_OFFSET * CANVAS_SCALE) / this.view.zoom; // px -> canvas units

    ctx.font = `${(fontSize * CANVAS_SCALE) / this.view.zoom}px sans-serif`;
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
    for (const sequence of this.sequences) {
      this.drawStartLabel(sequence);
    }
  }

  private drawStartLabel(sequence: Sequence) {
    const geometry = this.getStartLabelGeometry(sequence);
    if (!geometry) return;
    this.drawShiftedLabel("start", geometry.point, geometry.outside);
  }

  private drawInflectionLabels() {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      for (const u of [
        ...this.getUncoveredInflectionCoordinates(sequence),
        ...this.getUncoveredJointEdgeChangeCoordinates(sequence),
      ]) {
        const geometry = this.getLabelGeometryAt(sequence.path, u);
        this.drawShiftedLabel(CHANGE_EDGE_LABEL, geometry.point, geometry.outside, LABEL_FONT_SIZE_SMALL);
      }
    }
  }

  private getUncoveredInflectionCoordinates(sequence: Sequence): PathCoordinate[] {
    const curves = sequence.path.curves;
    const pathCoordinates: PathCoordinate[] = [];
    curves.forEach((curve, curveIndex) => {
      for (const inflection of curve.getInflections()) {
        // Convert the inflection parameter to a uniform path coordinate so it can
        // be compared against the real element spans, not the visual scaling.
        const u = this.uniformCoordinateAt(curves, curveIndex, inflection) as PathCoordinate;
        if (!this.isInsideElementSpan(sequence, u)) pathCoordinates.push(u);
      }
    });
    return pathCoordinates;
  }

  private getUncoveredJointEdgeChangeCoordinates(sequence: Sequence): PathCoordinate[] {
    const curves = sequence.path.curves;
    const pathCoordinates: PathCoordinate[] = [];
    for (let i = 0; i + 1 < curves.length; i++) {
      const before = curves[i]!.getCurvature(1 as Curvilinear);
      const after = curves[i + 1]!.getCurvature(0 as Curvilinear);
      if (before * after >= 0) continue; // zero curvature counts as no sign change
      const u = this.uniformCoordinateAt(curves, i, 1 as Curvilinear) as PathCoordinate;
      if (!this.isInsideElementSpan(sequence, u)) pathCoordinates.push(u);
    }
    return pathCoordinates;
  }

  private isInsideElementSpan(sequence: Sequence, u: PathCoordinate): boolean {
    return sequence.elements.some((element) => {
      const lo = Math.min(element.start as number, element.end as number);
      const hi = Math.max(element.start as number, element.end as number);
      return (u as number) >= lo && (u as number) <= hi;
    });
  }

  private getElementPoints(element: Element): Vector<2>[] {
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return [];
    const path = sequence.path;
    const [start, end] = this.getDisplayedSpan(sequence, element);
    const span = (end as number) - (start as number);
    const step = Math.min(ELEMENT_DRAW_INCREMENT, span / 4) || ELEMENT_DRAW_INCREMENT;
    const points: Vector<2>[] = [];
    for (let u = start as number; u <= (end as number); u += step) {
      points.push(path.getPosition(u as PathCoordinate));
    }
    return points;
  }

  private selectableElements(sequence: Sequence): Element[] {
    const provisional = this.provisionalElements.get(sequence);
    const elements = [...sequence.elements];
    if (provisional) elements.push(provisional);
    return elements;
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

    for (const sequence of this.sequences) {
      for (const element of this.selectableElements(sequence)) {
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
    }
    return best;
  }

  private snapElementPointToPath(element: Element, isStart: boolean, cursor: Vector<2>): PathCoordinate | null {
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return null;
    const path = sequence.path;
    if (path.curves.length === 0) return null;

    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return null;

    let clamped = Math.max(0, Math.min(path.length, u));
    const other = (isStart ? element.end : element.start) as number;
    clamped = isStart ? Math.min(clamped, other) : Math.max(clamped, other);
    const bounds = this.neighbourBoundsAroundSpan(sequence, element.start as number, element.end as number, element);
    clamped = isStart ? Math.max(clamped, bounds.left) : Math.min(clamped, bounds.right);
    return clamped as PathCoordinate;
  }

  private neighbourBoundsAroundSpan(
    sequence: Sequence,
    start: number,
    end: number,
    exclude: Element | Set<Element> | null,
  ): { left: number; right: number } {
    const path = sequence.path;
    let left = 0;
    let right = path.length;
    for (const other of sequence.elements) {
      if (other === exclude || (exclude instanceof Set && exclude.has(other))) continue;
      const os = Math.min(other.start as number, other.end as number);
      const oe = Math.max(other.start as number, other.end as number);
      if (oe <= start) left = Math.max(left, oe);
      else if (os >= end) right = Math.min(right, os);
    }
    return { left, right };
  }

  private snapCursorToPathNearCurve(
    sequence: Sequence,
    anchorCurveIndex: number,
    cursor: Vector<2>,
  ): PathCoordinate | null {
    const curves = sequence.path.curves;
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

  private snapCursorToPathAnywhere(sequence: Sequence, cursor: Vector<2>): PathCoordinate | null {
    const curves = sequence.path.curves;
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
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return;
    const path = sequence.path;
    const curves = path.curves;
    if (curves.length === 0) return;

    const cursor = this.screenToWorld(screenX, screenY);
    const anchorIndex = this.curveIndexAt(path, element.start as number);
    const grabbedU = this.snapCursorToPathNearCurve(sequence, anchorIndex, cursor);
    if (grabbedU == null) return;

    const startU = element.start as number;
    const endU = element.end as number;
    const lo = Math.min(startU, endU);
    const hi = Math.max(startU, endU);
    const clampedGrab = Math.min(Math.max(grabbedU as number, lo), hi);

    this.isDraggingElementSegment = true;
    this.dragElement = element;
    this.segmentDragGrabU = clampedGrab;

    const moving = new Set<Element>([element]);
    if (!this.isProvisionalElement(element) && this.selectedElements.has(element) && this.selectedElements.size > 1) {
      for (const selected of this.selectedElements) moving.add(selected);
    }

    this.segmentDragItems = [];
    let dMin = -Infinity;
    let dMax = Infinity;
    for (const moved of moving) {
      const movedSequence = this.getSequenceOfElement(moved);
      if (!movedSequence) continue;
      const s0 = Math.min(moved.start as number, moved.end as number);
      const e0 = Math.max(moved.start as number, moved.end as number);
      this.segmentDragItems.push({ element: moved, start0: s0, end0: e0 });
      const bounds = this.neighbourBoundsAroundSpan(movedSequence, s0, e0, moving);
      dMin = Math.max(dMin, -movedSequence.path.arcLengthBetween(bounds.left as PathCoordinate, s0 as PathCoordinate));
      dMax = Math.min(dMax, movedSequence.path.arcLengthBetween(e0 as PathCoordinate, bounds.right as PathCoordinate));
    }
    this.segmentDragDeltaMin = dMin;
    this.segmentDragDeltaMax = dMax;
  }

  private curveIndexAt(path: Path, u: number): number {
    if (path.curves.length === 0) return 0;
    if (u <= 0) return 0;
    if (u >= path.length) return path.curves.length - 1;
    const [curve] = path.getCurveAndCurvilinearCoord(u as PathCoordinate);
    const index = path.curves.indexOf(curve);
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

    for (const sequence of this.sequences) {
      for (const element of this.selectableElements(sequence)) {
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
    }
    return best;
  }

  private drawControlHandles(sequence: Sequence) {
    const ctx = this.ctx;
    const curves = sequence.path.curves;

    curves.forEach((curve, curveIndex) => {
      const points = [curve.p0, curve.p1, curve.p2, curve.p3];
      const showP1 = this.isHandleVisible(sequence, curveIndex, "p1");
      const showP2 = this.isHandleVisible(sequence, curveIndex, "p2");

      ctx.strokeStyle = `rgba(0, 0, 0, ${POLYGON_ALPHA})`;
      ctx.lineWidth = (1 * CANVAS_SCALE) / this.view.zoom;
      if (showP1) this.drawGuide(points[0]!, points[1]!);
      if (showP2) this.drawGuide(points[2]!, points[3]!);

      const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
      points.forEach((point, index) => {
        const pointKey = keys[index]!;
        if ((pointKey === "p1" && !showP1) || (pointKey === "p2" && !showP2)) return;

        const isSelected = this.isSelectedPoint(sequence, this.keyOf(curveIndex, pointKey));
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

  private isSelectedPoint(sequence: Sequence, key: string): boolean {
    return this.selectedPoints.get(sequence)?.has(key) ?? false;
  }

  private drawGuide(a: Vector<2>, b: Vector<2>) {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x * CANVAS_SCALE, -a.y * CANVAS_SCALE);
    this.ctx.lineTo(b.x * CANVAS_SCALE, -b.y * CANVAS_SCALE);
    this.ctx.stroke();
  }

  private getAddButtonPosition(sequence: Sequence): Vector<2> {
    const curves = sequence.path.curves;
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

  private drawAddButtons() {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      this.drawPlusInCircle(this.getAddButtonPosition(sequence));
    }
  }

  private hitAddButton(screenX: number, screenY: number): Sequence | null {
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      const [iconX, iconY] = this.worldToScreen(this.getAddButtonPosition(sequence));
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS) return sequence;
    }
    return null;
  }

  private getRemovablePoint(
    sequence: Sequence,
  ): { point: Vector<2>; dir: Vector<2>; isStart: boolean; isEnd: boolean } | null {
    const selected = this.selectedPoints.get(sequence);
    const curves = this.selectedCurves.get(sequence);
    if (!selected || selected.size !== 1 || (curves && curves.size > 0)) return null;
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const [ciStr, pkStr] = [...selected][0]!.split(":");
    const curveIndex = Number(ciStr);
    const pointKey = pkStr as ControlPointKey;
    const curve = path.curves[curveIndex];
    if (!curve) return null;

    if (pointKey === "p0" && curveIndex === 0 && path.curves.length > 1) {
      return { point: curve.p0, dir: curve.getDerivative(0 as Curvilinear).normalized(), isStart: true, isEnd: false };
    }
    if (pointKey === "p3" && curveIndex === path.curves.length - 1 && path.curves.length > 1) {
      return { point: curve.p3, dir: curve.getDerivative(1 as Curvilinear).normalized(), isStart: false, isEnd: true };
    }
    if (pointKey === "p0" && curveIndex > 0) {
      return { point: curve.p0, dir: curve.getDerivative(0 as Curvilinear).normalized(), isStart: false, isEnd: false };
    }
    if (pointKey === "p3" && curveIndex < path.curves.length - 1) {
      return {
        point: curve.p3,
        dir: path.curves[curveIndex + 1]!.getDerivative(0 as Curvilinear).normalized(),
        isStart: false,
        isEnd: false,
      };
    }
    return null;
  }

  private getDeleteButtonData(
    sequence: Sequence,
  ): { removable: { point: Vector<2>; dir: Vector<2>; isStart: boolean; isEnd: boolean }; center: Vector<2> } | null {
    const removable = this.getRemovablePoint(sequence);
    if (!removable) return null;
    const perp = removable.dir.getOrthogonal();
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return { removable, center: removable.point.plus(perp.times(offset)) };
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

  private drawDeleteButtons() {
    for (const sequence of this.sequences) {
      const data = this.getDeleteButtonData(sequence);
      if (!data) continue;
      this.drawMinusInCircle(data.center);
    }
  }

  private getElementDeleteButtonElement(): Element | null {
    if (this.selectedElements.size !== 1) return null;
    return [...this.selectedElements][0]!;
  }

  private getElementActionButtonGeometry(): { point: Vector<2>; perp: Vector<2> } | null {
    const element = this.getElementDeleteButtonElement();
    if (!element) return null;
    const sequence = this.getSequenceOfElement(element);
    if (!sequence || sequence.path.curves.length === 0) return null;
    return this.midpointNormal(sequence, element);
  }

  private midpointNormal(sequence: Sequence, element: Element): { point: Vector<2>; perp: Vector<2> } | null {
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    const midU = ((lo + hi) / 2) as PathCoordinate;
    const [curve, curvilinear] = path.getCurveAndCurvilinearCoord(midU);
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

  private drawCogInCircle(world: Vector<2>, color: string = COG_BUTTON_COLOR) {
    const ctx = this.ctx;
    const cx = world.x * CANVAS_SCALE;
    const cy = -world.y * CANVAS_SCALE;

    const outerRadius = (DELETE_BUTTON_RADIUS * CANVAS_SCALE) / this.view.zoom;
    const circleRadius = outerRadius * 0.62;

    ctx.strokeStyle = color;
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
    for (const provisional of this.provisionalElements.values()) {
      if (provisional === element) return true;
    }
    return false;
  }

  private startProvisionalCreation(sequence: Sequence, u: number) {
    this.placeProvisionalElement(sequence, u);
    this.isCreatingProvisional = true;
    this.creatingSequence = sequence;
    this.provisionalOriginU = u;
  }

  private updateProvisionalCreation(cursor: Vector<2>) {
    const sequence = this.creatingSequence;
    if (!sequence || sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return;
    const origin = this.provisionalOriginU;
    if (Math.abs(u - origin) < 1e-9) {
      this.placeProvisionalElement(sequence, origin);
      return;
    }
    this.setProvisionalSpan(sequence, Math.min(origin, u), Math.max(origin, u), origin);
  }

  private placeProvisionalElement(sequence: Sequence, u: number) {
    const half = PROVISIONAL_TOTAL_LENGTH / 2;
    this.setProvisionalSpan(sequence, u - half, u + half);
  }

  private setProvisionalSpan(sequence: Sequence, start: number, end: number, anchor?: number) {
    const path = sequence.path;
    if (path.curves.length === 0) return;
    const clampedStart = Math.max(0, start) as PathCoordinate;
    const clampedEnd = Math.min(path.length, end) as PathCoordinate;
    const mid = anchor ?? ((clampedStart as number) + (clampedEnd as number)) / 2;
    let left = 0;
    let right = path.length;
    for (const other of sequence.elements) {
      const os = Math.min(other.start as number, other.end as number);
      const oe = Math.max(other.start as number, other.end as number);
      if (oe <= mid) left = Math.max(left, oe);
      else right = Math.min(right, os);
    }
    const lo = Math.max(clampedStart as number, left);
    const hi = Math.min(clampedEnd as number, right);
    const finalStart = Math.max(lo, Math.min(hi, lo)) as PathCoordinate;
    const existing = this.provisionalElements.get(sequence);
    if (!existing) {
      this.provisionalElements.set(sequence, createDefaultFootTurn(finalStart, hi as PathCoordinate));
    } else {
      existing.start = finalStart;
      existing.end = hi as PathCoordinate;
    }
    this.selectedPoints.delete(sequence);
    this.selectedCurves.delete(sequence);
    this.selectedElements = new Set(
      [...this.selectedElements].filter((element) => this.getSequenceOfElement(element) !== sequence),
    );
    this.requestDraw();
  }

  private pickPathCoordinate(screenX: number, screenY: number): { sequence: Sequence; u: number } | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;

    let best: { sequence: Sequence; u: number; distance: number } | null = null;
    for (const sequence of this.sequences) {
      const hit = sequence.path.pickCurve(cursor, tolerance);
      if (!hit) continue;
      const { t } = hit.curve.getClosestPoint(cursor);
      const u = this.uniformCoordinateAt(sequence.path.curves, hit.curveIndex, t);
      if (!best || hit.distance < best.distance) {
        best = { sequence, u, distance: hit.distance };
      }
    }
    return best ? { sequence: best.sequence, u: best.u } : null;
  }

  private getProvisionalPlusButtons(): { sequence: Sequence; center: Vector<2> }[] {
    const result: { sequence: Sequence; center: Vector<2> }[] = [];
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    for (const [sequence, element] of this.provisionalElements) {
      const geometry = this.midpointNormal(sequence, element);
      if (!geometry) continue;
      result.push({ sequence, center: geometry.point.plus(geometry.perp.times(-offset)) });
    }
    return result;
  }

  private drawProvisionalPlusButtons() {
    for (const { center } of this.getProvisionalPlusButtons()) {
      this.drawPlusInCircleWithColor(center, PROVISIONAL_COLOR);
    }
  }

  private hitProvisionalPlusButton(screenX: number, screenY: number): Sequence | null {
    for (const { sequence, center } of this.getProvisionalPlusButtons()) {
      const [iconX, iconY] = this.worldToScreen(center);
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS) return sequence;
    }
    return null;
  }

  private openProvisionalChange(sequence: Sequence) {
    const element = this.provisionalElements.get(sequence);
    if (!element) return;
    if (this.onElementChangeRequest) {
      this.onElementChangeRequest(element);
      this.draw();
      return;
    }
    this.addProvisionalElement(sequence);
  }

  private addProvisionalElement(sequence: Sequence) {
    const element = this.provisionalElements.get(sequence);
    if (!element) return;
    this.provisionalElements.delete(sequence);
    sequence.addElement(element);
    this.notifySequenceChange();
    if (this.onElementChangeRequest) this.onElementChangeRequest(element);
    this.draw();
  }

  isProvisional(element: Element): boolean {
    return this.isProvisionalElement(element);
  }

  commitProvisionalElement(provisional: Element, replacement: Element): Sequence | null {
    const sequence = this.getSequenceOfElement(provisional);
    if (!sequence || !this.isProvisionalElement(provisional)) return null;
    this.provisionalElements.delete(sequence);
    sequence.addElement(replacement);
    this.notifySequenceChange();
    this.draw();
    return sequence;
  }

  onTimingKeyframeChangeRequest?: (
    keyframe: TimingKeyframe,
    isProvisional: boolean,
    previous: TimingKeyframe | null,
  ) => void;

  getPreviousTimingKeyframe(keyframe: TimingKeyframe): TimingKeyframe | null {
    const sequence = this.getSequenceOfTimingKeyframe(keyframe);
    if (!sequence) return null;
    return (
      [...sequence.keyframes.time]
        .filter((candidate) => candidate.pathCoordinate < keyframe.pathCoordinate)
        .sort((a, b) => a.pathCoordinate - b.pathCoordinate)
        .pop() ?? null
    );
  }

  isProvisionalTiming(keyframe: TimingKeyframe): boolean {
    for (const provisional of this.provisionalTimingKeyframes.values()) {
      if (provisional === keyframe) return true;
    }
    return false;
  }

  getSequenceOfTimingKeyframe(keyframe: TimingKeyframe): Sequence | null {
    for (const sequence of this.sequences) {
      if (sequence.keyframes.time.includes(keyframe)) return sequence;
    }
    for (const [sequence, provisional] of this.provisionalTimingKeyframes) {
      if (provisional === keyframe) return sequence;
    }
    return null;
  }

  commitProvisionalTimingKeyframe(provisional: TimingKeyframe, replacement: TimingKeyframe): Sequence | null {
    const sequence = this.getSequenceOfTimingKeyframe(provisional);
    if (!sequence || !this.isProvisionalTiming(provisional)) return null;
    this.provisionalTimingKeyframes.delete(sequence);
    sequence.addKeyframe("time", replacement);
    this.notifySequenceChange();
    this.draw();
    return sequence;
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

  private hitDeleteButton(
    screenX: number,
    screenY: number,
  ): { sequence: Sequence; removable: NonNullable<ReturnType<Editor["getRemovablePoint"]>> } | null {
    for (const sequence of this.sequences) {
      const data = this.getDeleteButtonData(sequence);
      if (!data) continue;
      const [iconX, iconY] = this.worldToScreen(data.center);
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS) return { sequence, removable: data.removable };
    }
    return null;
  }

  private getSplitButtonData(): { sequence: Sequence; curveIndex: number; center: Vector<2> }[] {
    const result: { sequence: Sequence; curveIndex: number; center: Vector<2> }[] = [];
    for (const [sequence, curveIndices] of this.selectedCurves) {
      for (const curveIndex of curveIndices) {
        const curve = sequence.path.curves[curveIndex];
        if (!curve) continue;
        const mid = curve.getHalfLengthCoordinate();
        const point = curve.getPosition(mid);
        const dir = curve.getDerivative(mid).normalized();
        const perp = dir.getOrthogonal();
        const offset = SPLIT_BUTTON_OFFSET / this.view.zoom; // px -> m
        result.push({ sequence, curveIndex, center: point.plus(perp.times(offset)) });
      }
    }
    return result;
  }

  private drawSplitButtons() {
    for (const { center } of this.getSplitButtonData()) {
      this.drawPlusInCircle(center);
    }
  }

  private hitSplitButton(screenX: number, screenY: number): { sequence: Sequence; curveIndex: number } | null {
    for (const { sequence, curveIndex, center } of this.getSplitButtonData()) {
      const [iconX, iconY] = this.worldToScreen(center);
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS) return { sequence, curveIndex };
    }
    return null;
  }

  private isHandleVisible(sequence: Sequence, curveIndex: number, pointKey: ControlPointKey): boolean {
    if (pointKey !== "p1" && pointKey !== "p2") return true;
    const selected = this.selectedPoints.get(sequence);
    if (!selected || selected.size === 0) return false;
    const curveCount = sequence.path.curves.length;
    const has = (ci: number, pk: ControlPointKey) => this.isSelectedPoint(sequence, this.keyOf(ci, pk));

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
    const cursor = this.screenToWorld(screenX, screenY);
    const pickRadius = PICK_RADIUS / this.view.zoom;
    const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];

    let best: ControlPointSelection | null = null;
    let bestDistance = Infinity;

    for (const sequence of this.sequences) {
      sequence.path.curves.forEach((curve, curveIndex) => {
        keys.forEach((pointKey) => {
          if ((pointKey === "p1" || pointKey === "p2") && !this.isHandleVisible(sequence, curveIndex, pointKey)) {
            return;
          }
          const distance = curve[pointKey].minus(cursor).length();
          if (distance <= pickRadius && distance < bestDistance) {
            bestDistance = distance;
            best = { sequence, curveIndex, pointKey };
          }
        });
      });
    }

    return best;
  }

  private pickCurve(screenX: number, screenY: number): { sequence: Sequence; curveIndex: number } | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;

    let best: { sequence: Sequence; curveIndex: number; distance: number } | null = null;
    for (const sequence of this.sequences) {
      const result = sequence.path.pickCurve(cursor, tolerance);
      if (!result) continue;
      if (!best || result.distance < best.distance) {
        best = { sequence, curveIndex: result.curveIndex, distance: result.distance };
      }
    }
    return best ? { sequence: best.sequence, curveIndex: best.curveIndex } : null;
  }

  private handleCurveSelection(sequence: Sequence, curveIndex: number, ctrlKey: boolean) {
    if (ctrlKey) {
      const selected = this.getSelectedCurvesFor(sequence);
      if (selected.has(curveIndex)) selected.delete(curveIndex);
      else selected.add(curveIndex);
    } else if (!this.selectedCurves.get(sequence)?.has(curveIndex)) {
      this.selectedCurves = new Map([[sequence, new Set([curveIndex])]]);
      this.selectedPoints.clear();
    }
    if ((this.selectedCurves.get(sequence)?.size ?? 0) > 0) this.selectedPoints.delete(sequence);
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
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return;
    sequence.updateElementKeyframes(element);
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

    this.requestDraw();
  }

  private handleMouseDown(event: MouseEvent) {
    event.preventDefault();

    const [screenX, screenY] = this.screenPosition(event);
    if (event.button === 2) {
      this.handleSecondaryDown(screenX, screenY);
      return;
    }
    if (event.button === 0) this.handlePrimaryDown(screenX, screenY, event.ctrlKey);
  }

  private handleTouchStart(event: TouchEvent) {
    event.preventDefault();
    if (event.touches.length >= 2) {
      if (this.touchMode === "one") this.handleMouseUp(); // a second finger breaks off the one-finger action
      this.touchMode = "two";
      this.startPinch(event.touches);
      return;
    }
    if (this.touchMode !== "none") return; // leftover finger after a two-finger gesture does nothing
    const touch = event.touches[0];
    if (!touch) return;
    this.touchMode = "one";
    this.handlePrimaryDown(...this.touchPosition(touch), false);
  }

  private handleTouchMove(event: TouchEvent) {
    if (this.touchMode === "two" && event.touches.length >= 2) {
      event.preventDefault();
      this.pinchZoomAndPan(event.touches);
      return;
    }
    if (this.touchMode === "one" && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      this.handleMove(...this.touchPosition(touch));
    }
  }

  private handleTouchEnd(event: TouchEvent) {
    if (this.touchMode === "one" && event.touches.length === 0) {
      this.handleMouseUp();
      this.touchMode = "none";
      return;
    }
    if (this.touchMode === "two" && event.touches.length < 2) {
      this.touchMode = "none";
      event.preventDefault();
      this.handleMouseUp();
    }
  }

  private touchPosition(touch: Touch): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  private startPinch(touches: TouchList) {
    const [a, b] = [touches[0], touches[1]];
    if (!a || !b) return;
    const [ax, ay] = this.touchPosition(a);
    const [bx, by] = this.touchPosition(b);
    this.lastPinchDist = Math.hypot(bx - ax, by - ay);
    this.lastPinchMidX = (ax + bx) / 2;
    this.lastPinchMidY = (ay + by) / 2;
  }

  private pinchZoomAndPan(touches: TouchList) {
    const [a, b] = [touches[0], touches[1]];
    if (!a || !b) return;
    const [ax, ay] = this.touchPosition(a);
    const [bx, by] = this.touchPosition(b);
    const dist = Math.hypot(bx - ax, by - ay);
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    if (this.lastPinchDist <= 0) {
      this.lastPinchDist = dist;
      this.lastPinchMidX = midX;
      this.lastPinchMidY = midY;
      return;
    }

    const worldUnderMid = this.screenToWorld(this.lastPinchMidX, this.lastPinchMidY);
    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * (dist / this.lastPinchDist)));
    // The world point under the previous midpoint stays under the current midpoint.
    this.view.center = new Vector<2>(
      worldUnderMid.x - (midX - this.width / 2) / this.view.zoom,
      worldUnderMid.y + (midY - this.height / 2) / this.view.zoom,
    );

    this.lastPinchDist = dist;
    this.lastPinchMidX = midX;
    this.lastPinchMidY = midY;
    this.requestDraw();
  }

  private handleSecondaryDown(screenX: number, screenY: number) {
    this.isPanning = true;
    this.lastPanX = screenX;
    this.lastPanY = screenY;
  }

  private handlePrimaryDown(screenX: number, screenY: number, ctrlKey: boolean) {
    if (this.mode === "view") {
      this.handleSecondaryDown(screenX, screenY);
      return;
    }

    if (this.mode === "timing") {
      const plusHit = this.hitProvisionalTimingPlus(screenX, screenY);
      if (plusHit) {
        this.onTimingKeyframeChangeRequest?.(plusHit, true, this.getPreviousTimingKeyframe(plusHit));
        return;
      }
      const cogHit = this.hitTimingCogButton(screenX, screenY);
      if (cogHit) {
        this.onTimingKeyframeChangeRequest?.(cogHit, false, this.getPreviousTimingKeyframe(cogHit));
        return;
      }
      const minusHit = this.hitTimingMinusButton(screenX, screenY);
      if (minusHit) {
        this.removeTimingKeyframe(minusHit);
        return;
      }
      const dot = this.pickTimingKeyframe(screenX, screenY);
      if (dot) {
        if (!this.isProvisionalTiming(dot)) {
          const owner = this.getSequenceOfTimingKeyframe(dot);
          if (owner) this.provisionalTimingKeyframes.delete(owner);
          this.selectTimingKeyframe(dot, ctrlKey);
        }
        this.startTimingDrag(dot, screenX, screenY);
        this.draw();
        return;
      }
      const pathHit = this.pickPathCoordinate(screenX, screenY);
      if (pathHit) {
        this.startProvisionalTimingCreation(pathHit.sequence, pathHit.u);
        this.draw();
        return;
      }
      this.isSelectingRect = true;
      this.rectDidMove = false;
      this.rectTargetsTiming = true;
      this.rectAddToSelection = ctrlKey;
      this.rectStartX = screenX;
      this.rectStartY = screenY;
      this.rectEndX = screenX;
      this.rectEndY = screenY;
      if (!ctrlKey) this.selectedTimingKeyframes.clear();
      this.draw();
      return;
    }

    if (this.mode !== "path") {
      const provisionalPlusHit = this.hitProvisionalPlusButton(screenX, screenY);
      if (provisionalPlusHit) {
        this.openProvisionalChange(provisionalPlusHit);
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
          const sequence = this.getSequenceOfElement(element);
          if (sequence) sequence.removeElement(element);
          this.selectedElements.delete(element);
          this.notifySequenceChange();
          this.draw();
        }
        return;
      }
      const element = this.pickElement(screenX, screenY);
      if (element) {
        const isProvisional = this.isProvisionalElement(element);
        if (!isProvisional) {
          const owner = this.getSequenceOfElement(element);
          if (owner) this.provisionalElements.delete(owner);
          this.selectElement(element, ctrlKey);
        }
        const pointHit = this.pickElementControlPoint(screenX, screenY);
        if (pointHit?.element === element) {
          this.isDraggingElementPoint = true;
          this.dragElement = element;
          this.dragElementPointIsStart = pointHit.isStart;
        } else {
          this.startElementSegmentDrag(element, screenX, screenY);
        }
      } else {
        const pathHit = this.pickPathCoordinate(screenX, screenY);
        if (pathHit) {
          this.startProvisionalCreation(pathHit.sequence, pathHit.u);
        } else {
          this.isSelectingRect = true;
          this.rectDidMove = false;
          this.rectTargetsElements = true;
          this.rectAddToSelection = ctrlKey;
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

    const deleteHit = this.hitDeleteButton(screenX, screenY);
    if (deleteHit) {
      const sequence = deleteHit.sequence;
      const removable = deleteHit.removable;
      if (removable.isStart) {
        sequence.path.removeStartCurve();
      } else if (removable.isEnd) {
        sequence.path.removeEndCurve();
      } else {
        const [curveBefore] = sequence.path.getCurvesAroundPoint(removable.point);
        this.jointDeletionSnapshot = this.makeJointDeletionSnapshot(
          sequence,
          sequence.path.curves.indexOf(curveBefore),
        );
        sequence.path.removePoint(removable.point);
        this.remapElementsAfterCurveRemoval();
      }
      this.selectedPoints.delete(sequence);
      this.notifySequenceChange();
      this.draw();
      return;
    }
    const addHit = this.hitAddButton(screenX, screenY);
    if (addHit) {
      this.addSegmentEnd(addHit);
      return;
    }
    const splitHit = this.hitSplitButton(screenX, screenY);
    if (splitHit) {
      const sequence = splitHit.sequence;
      const curve = sequence.path.curves[splitHit.curveIndex];
      if (curve) {
        const mid = curve.getHalfLengthCoordinate();
        sequence.path.cut(splitHit.curveIndex, mid);
        const remapFrom = this.selectedCurves.get(sequence) ?? [];
        const newSelected = new Set<number>();
        for (const idx of remapFrom) {
          if (idx < splitHit.curveIndex) newSelected.add(idx);
          else if (idx > splitHit.curveIndex) newSelected.add(idx + 1);
        }
        newSelected.add(splitHit.curveIndex);
        newSelected.add(splitHit.curveIndex + 1);
        this.selectedCurves.set(sequence, newSelected);
        this.notifySequenceChange();
        this.draw();
      }
      return;
    }
    const picked = this.pickControlPoint(screenX, screenY);
    if (picked) {
      const sequence = picked.sequence;
      const key = this.keyOf(picked.curveIndex, picked.pointKey);
      const selected = this.getSelectedPointsFor(sequence);
      if (ctrlKey) {
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
      } else if (!selected.has(key)) {
        // Plain click on an unselected point: select only that point and drop the
        // selections of the other sequences so the drag moves it alone.
        this.selectedPoints = new Map([[sequence, new Set([key])]]);
      }
      if ((this.selectedPoints.get(sequence)?.size ?? 0) > 0) this.selectedCurves.delete(sequence);
      // Deselecting with ctrl does not start a drag. A plain click on a point ends
      // with that point selected (fresh or kept), so the drag starts at once.
      if (this.selectedPoints.get(sequence)?.has(key) ?? false) {
        this.isDraggingPoint = true;
        this.dragSequence = sequence;
        this.dragOrigin = sequence.path.curves[picked.curveIndex]?.[picked.pointKey].copy() ?? null;
        this.lastDragDelta = new Vector<2>(0, 0);
        this.jointMoveSnapshot = this.makeJointMoveSnapshot(sequence, picked.curveIndex, picked.pointKey);
      }
    } else {
      const curveHit = this.pickCurve(screenX, screenY);
      if (curveHit) {
        const sequence = curveHit.sequence;
        this.handleCurveSelection(sequence, curveHit.curveIndex, ctrlKey);
        if (this.selectedCurves.get(sequence)?.has(curveHit.curveIndex)) {
          this.isDraggingCurve = true;
          this.dragSequence = sequence;
          this.dragOrigin = this.screenToWorld(screenX, screenY);
          this.lastDragDelta = new Vector<2>(0, 0);
        }
      } else {
        this.isSelectingRect = true;
        this.rectDidMove = false;
        this.rectTargetsElements = false;
        this.rectAddToSelection = ctrlKey;
        this.rectStartX = screenX;
        this.rectStartY = screenY;
        this.rectEndX = screenX;
        this.rectEndY = screenY;
        if (!ctrlKey) this.selectedPoints.clear();
        this.selectedCurves.clear();
      }
    }
    this.draw();
  }

  private handleMouseMove(event: MouseEvent) {
    this.handleMove(...this.screenPosition(event));
  }

  private handleMove(screenX: number, screenY: number) {
    if (this.isPanning) {
      const deltaX = screenX - this.lastPanX;
      const deltaY = screenY - this.lastPanY;
      this.lastPanX = screenX;
      this.lastPanY = screenY;

      this.view.center = this.view.center.plus(new Vector<2>(-deltaX, deltaY).times(1 / this.view.zoom));
      this.requestDraw();
      return;
    }

    if (this.isSelectingRect) {
      if (
        Math.abs(screenX - this.rectStartX) > RECT_CLICK_THRESHOLD ||
        Math.abs(screenY - this.rectStartY) > RECT_CLICK_THRESHOLD
      ) {
        this.rectDidMove = true;
      }
      this.rectEndX = screenX;
      this.rectEndY = screenY;
      this.requestDraw();
      return;
    }

    if (this.isCreatingProvisional) {
      this.updateProvisionalCreation(this.screenToWorld(screenX, screenY));
      return;
    }

    if (this.isCreatingProvisionalTiming) {
      this.updateProvisionalTimingCreation(this.screenToWorld(screenX, screenY));
      return;
    }

    if (this.isDraggingElementPoint) {
      if (!this.dragElement) return;
      const world = this.screenToWorld(screenX, screenY);
      const u = this.snapElementPointToPath(this.dragElement, this.dragElementPointIsStart, world);
      if (u != null) {
        if (this.dragElementPointIsStart) this.dragElement.start = u;
        else this.dragElement.end = u;
        this.updateElementKeyframes(this.dragElement);
        this.sequenceMutated = true;
      }
      this.requestDraw();
      return;
    }

    if (this.isDraggingElementSegment) {
      const dragSequence = this.dragElement ? this.getSequenceOfElement(this.dragElement) : null;
      if (!dragSequence) return;
      const world = this.screenToWorld(screenX, screenY);
      const currentGrab = this.snapCursorToPathAnywhere(dragSequence, world);
      if (currentGrab != null) {
        const delta =
          (currentGrab as number) >= this.segmentDragGrabU
            ? dragSequence.path.arcLengthBetween(this.segmentDragGrabU as PathCoordinate, currentGrab as PathCoordinate)
            : -dragSequence.path.arcLengthBetween(
                currentGrab as PathCoordinate,
                this.segmentDragGrabU as PathCoordinate,
              );
        const clamped = Math.min(Math.max(delta, this.segmentDragDeltaMin), this.segmentDragDeltaMax);
        for (const item of this.segmentDragItems) {
          const sequence = this.getSequenceOfElement(item.element);
          if (!sequence) continue;
          item.element.start = sequence.path.moveAlongByArcLength(item.start0 as PathCoordinate, clamped);
          item.element.end = sequence.path.moveAlongByArcLength(item.end0 as PathCoordinate, clamped);
          this.updateElementKeyframes(item.element);
        }
        this.sequenceMutated = true;
      }
      this.requestDraw();
      return;
    }

    if (this.isDraggingTimingPoint && this.draggingTimingKeyframe && this.dragTimingSequence) {
      const world = this.screenToWorld(screenX, screenY);
      const currentU = this.snapCursorToPathAnywhere(this.dragTimingSequence, world);
      if (currentU != null) {
        const grab = this.timingDragGrabU;
        const delta =
          (currentU as number) >= grab
            ? this.dragTimingSequence.path.arcLengthBetween(grab as PathCoordinate, currentU as PathCoordinate)
            : -this.dragTimingSequence.path.arcLengthBetween(currentU as PathCoordinate, grab as PathCoordinate);
        const clamped = Math.min(Math.max(delta, this.timingDragDeltaMin), this.timingDragDeltaMax);
        for (const item of this.dragTimingItems) {
          const moved = item.sequence.path.moveAlongByArcLength(item.u0 as PathCoordinate, clamped);
          item.keyframe.pathCoordinate = Math.min(Math.max(moved as number, item.left), item.right) as PathCoordinate;
        }
        this.sequenceMutated = true;
      }
      this.requestDraw();
      return;
    }

    if (this.isDraggingCurve) {
      if (!this.dragOrigin) return;
      const world = this.screenToWorld(screenX, screenY);
      const delta = world.minus(this.dragOrigin);
      const change = delta.minus(this.lastDragDelta);
      this.lastDragDelta = delta;
      this.translateSelectedCurves(change);
      return;
    }

    if (this.isDraggingPoint) {
      const sequence = this.dragSequence;
      const selected = sequence ? this.selectedPoints.get(sequence) : undefined;
      if (sequence && selected && selected.size === 1) {
        const [ciStr, pkStr] = [...selected][0]!.split(":");
        const curveIndex = Number(ciStr);
        const pointKey = pkStr as ControlPointKey;
        const curve = sequence.path.curves[curveIndex];
        const point = curve?.[pointKey];
        if (!curve || !point) return;

        const world = this.screenToWorld(screenX, screenY);
        const delta = world.minus(point);
        point.x = world.x;
        point.y = world.y;
        this.alignNeighbors(sequence, curveIndex, pointKey, delta);
        sequence.path.updateLength();
        this.remapElementsAfterJointMove();
        // Move the points selected on the other sequences by the same movement so a
        // selection across sequences keeps moving together.
        for (const [other, keys] of this.selectedPoints) {
          if (other === sequence || keys.size === 0) continue;
          this.translateGroupOf(other, keys, delta);
        }
        this.sequenceMutated = true;
        this.requestDraw();
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
    for (const [sequence, selected] of this.selectedPoints) {
      if (selected.size === 0) continue;
      this.translateGroupOf(sequence, selected, delta);
    }
    this.sequenceMutated = true;
    this.requestDraw();
  }

  private translateGroupOf(sequence: Sequence, selected: ReadonlySet<string>, delta: Vector<2>) {
    const curves = sequence.path.curves;

    const moveKeys = new Set<string>();
    for (const key of selected) moveKeys.add(key);
    for (const key of selected) {
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

    sequence.path.updateLength();
  }

  private translateSelectedCurves(delta: Vector<2>) {
    for (const [sequence, curveIndices] of this.selectedCurves) {
      if (curveIndices.size === 0) continue;
      const curves = sequence.path.curves;

      const moved = new Set<Vector<2>>();
      for (const curveIndex of curveIndices) {
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

      sequence.path.updateLength();
    }
    this.sequenceMutated = true;
    this.requestDraw();
  }

  private finishSelectionRectangle() {
    if (this.rectTargetsTiming) {
      this.finishTimingSelectionRectangle();
      return;
    }
    if (this.rectTargetsElements) {
      this.finishElementSelectionRectangle();
      return;
    }
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
    const hits = new Map<Sequence, Set<string>>();
    if (this.rectAddToSelection) {
      for (const [sequence, selected] of this.selectedPoints) hits.set(sequence, new Set(selected));
    }
    for (const sequence of this.sequences) {
      const sequenceHits = hits.get(sequence) ?? new Set<string>();
      sequence.path.curves.forEach((curve, curveIndex) => {
        for (const pointKey of keys) {
          if ((pointKey === "p1" || pointKey === "p2") && !this.isHandleVisible(sequence, curveIndex, pointKey)) {
            continue;
          }
          const [screenX, screenY] = this.worldToScreen(curve[pointKey]);
          if (screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1) {
            sequenceHits.add(this.keyOf(curveIndex, pointKey));
          }
        }
      });
      if (sequenceHits.size > 0) {
        hits.set(sequence, sequenceHits);
      } else if (!this.rectAddToSelection) {
        hits.delete(sequence);
      }
    }

    this.selectedPoints = hits;
    this.selectedCurves.clear();
  }

  private finishTimingSelectionRectangle() {
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const hits = new Set<TimingKeyframe>();
    if (this.rectAddToSelection) {
      for (const keyframe of this.selectedTimingKeyframes) hits.add(keyframe);
    }
    for (const sequence of this.sequences) {
      if (sequence.path.curves.length === 0) continue;
      for (const keyframe of sequence.keyframes.time) {
        const [screenX, screenY] = this.worldToScreen(sequence.path.getPosition(keyframe.pathCoordinate));
        if (screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1) hits.add(keyframe);
      }
    }
    this.selectedTimingKeyframes = hits;
    this.selectedPoints.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElements.clear();
  }

  private finishElementSelectionRectangle() {
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const hits = new Set<Element>();
    if (this.rectAddToSelection) for (const element of this.selectedElements) hits.add(element);
    for (const sequence of this.sequences) {
      for (const element of this.selectableElements(sequence)) {
        const inside = this.getElementPoints(element).some((point) => {
          const [screenX, screenY] = this.worldToScreen(point);
          return screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1;
        });
        if (inside) hits.add(element);
      }
    }
    this.selectedElements = hits;
    this.selectedPoints.clear();
    this.selectedCurves.clear();
  }

  private selectAll() {
    const keys: ControlPointKey[] = ["p0", "p3"];
    for (const sequence of this.sequences) {
      const selected = this.getSelectedPointsFor(sequence);
      sequence.path.curves.forEach((curve, curveIndex) => {
        for (const pointKey of keys) selected.add(this.keyOf(curveIndex, pointKey));
      });
    }
    this.selectedCurves.clear();
    this.draw();
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (this.mode === "path" && event.ctrlKey && (event.key === "a" || event.key === "A")) {
      event.preventDefault();
      this.selectAll();
    }
  }

  private ownedTimingKeyframes(sequence: Sequence): TimingKeyframe[] {
    const provisional = this.provisionalTimingKeyframes.get(sequence);
    return provisional ? [provisional, ...sequence.keyframes.time] : [...sequence.keyframes.time];
  }

  private makeJointMoveSnapshot(sequence: Sequence, curveIndex: number, pointKey: ControlPointKey) {
    const curves = sequence.path.curves;
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
    for (const element of this.selectableElements(sequence)) {
      items.push({ element, start: element.start as number, end: element.end as number });
    }
    const timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }> = [];
    for (const keyframe of this.ownedTimingKeyframes(sequence)) {
      timingKeyframes.push({ keyframe, u0: keyframe.pathCoordinate as number });
    }
    return { sequence, jointCurveIndex, curveStarts, curveLengths, items, timingKeyframes };
  }

  private remapElementsAfterJointMove() {
    const snapshot = this.jointMoveSnapshot;
    if (!snapshot) return;
    const sequence = snapshot.sequence;

    const newCurveStarts: number[] = [];
    const newCurveLengths: number[] = [];
    let cumulated = 0;
    for (const curve of sequence.path.curves) {
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

    for (const item of snapshot.timingKeyframes) {
      item.keyframe.pathCoordinate = remapUniformAtJoint(
        item.u0,
        snapshot.curveStarts,
        snapshot.curveLengths,
        newCurveStarts,
        newCurveLengths,
      ) as PathCoordinate;
    }
  }

  private axisTables(sequence: Sequence): { curveStarts: number[]; curveLengths: number[] } {
    const curveStarts: number[] = [];
    const curveLengths: number[] = [];
    let cumulated = 0;
    for (const curve of sequence.path.curves) {
      curveStarts.push(cumulated);
      curveLengths.push(curve.length);
      cumulated += curve.length;
    }
    return { curveStarts, curveLengths };
  }

  private makeJointDeletionSnapshot(sequence: Sequence, jointOldIndex: number) {
    const { curveStarts, curveLengths } = this.axisTables(sequence);

    const items: Array<{ element: Element; start: number; end: number }> = [];
    for (const element of this.selectableElements(sequence)) {
      items.push({ element, start: element.start as number, end: element.end as number });
    }
    const timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }> = [];
    for (const keyframe of this.ownedTimingKeyframes(sequence)) {
      timingKeyframes.push({ keyframe, u0: keyframe.pathCoordinate as number });
    }
    return { sequence, jointOldIndex, curveStarts, curveLengths, items, timingKeyframes };
  }

  private remapElementsAfterCurveRemoval() {
    const snapshot = this.jointDeletionSnapshot;
    if (!snapshot) return;
    const sequence = snapshot.sequence;

    const { curveStarts, curveLengths } = this.axisTables(sequence);

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

    for (const item of snapshot.timingKeyframes) {
      item.keyframe.pathCoordinate = remapUniformAtRemoval(
        item.u0,
        snapshot.curveStarts,
        snapshot.curveLengths,
        curveStarts,
        curveLengths,
        snapshot.jointOldIndex,
        2,
      ) as PathCoordinate;
    }
    this.jointDeletionSnapshot = null;
  }

  private alignNeighbors(sequence: Sequence, curveIndex: number, pointKey: ControlPointKey, delta: Vector<2>) {
    const curves = sequence.path.curves;
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
        this.provisionalElements.clear();
        this.selectedElements.clear();
      } else if (this.rectTargetsTiming) {
        this.provisionalTimingKeyframes.clear();
        this.selectedTimingKeyframes.clear();
      }
      this.isSelectingRect = false;
    }
    this.isPanning = false;
    this.isDraggingPoint = false;
    this.isDraggingCurve = false;
    this.isDraggingElementPoint = false;
    this.isDraggingElementSegment = false;
    this.isCreatingProvisional = false;
    this.creatingSequence = null;
    this.isDraggingTimingPoint = false;
    this.isCreatingProvisionalTiming = false;
    this.timingCreatingSequence = null;
    this.draggingTimingKeyframe = null;
    this.dragTimingSequence = null;
    this.dragTimingItems = [];
    this.jointMoveSnapshot = null;
    this.dragElement = null;
    this.dragSequence = null;
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

export function formatTimingLabel(value: number): string {
  const total = Math.max(0, value);
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  const whole = Math.floor(seconds);
  let millis = Math.round((seconds - whole) * 1000);
  let clampedSeconds = whole;
  if (millis === 1000) {
    clampedSeconds += 1;
    millis = 0;
  }
  return `${minutes}:${String(clampedSeconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
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
