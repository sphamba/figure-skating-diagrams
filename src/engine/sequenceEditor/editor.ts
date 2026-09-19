import type { Curvilinear, Curve } from "../curve.js";
import { type AxisRect } from "../curve.js";
import { bladeLength, CANVAS_SCALE, RINK_COLOR, WHEEL_SENSITIVITY } from "../constants.js";
import type { PathCoordinate, Time } from "../coordinates.js";
import { fullTimeExtentSeconds } from "../diagram.js";
import { Annotation } from "../annotation.js";
import type { Element } from "../element/element.js";
import type { DynamicGlide } from "../element/stroke.js";
import type { Path } from "../path.js";
import { LENGTH, WIDTH, CORNER_RADIUS } from "../rink.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { canvasFontReady } from "../font.js";
import { createDefaultFootTurn, isJumpType } from "../element/turnTypes.js";
import { TimingKeyframe } from "../keyframe.js";
import { Sequence, DEFAULT_BPM, hasTimeEvolution, sequenceTimeRange } from "../sequence.js";
import { checkSequenceCurvatures, isStrokeElement } from "./curvatureWarning.js";
import {
  ACTION_BUTTON_HIT_RADIUS,
  ACTION_BUTTON_RADIUS,
  ActionButtonLabel,
  CogButtonLabel,
  LabelLayer,
  LABEL_FONT_SIZE_SMALL,
  MinusButtonLabel,
  PillLabel,
  PlusButtonLabel,
  WhiteCircleLabel,
  WhitePillLabel,
} from "./label.js";
import { Vector } from "../vector.js";

const WARNING_TRIANGLE_COLOR = "#c25205";
const WARNING_TRIANGLE_SIZE = 30; // px, side length of the filled warning triangle
const HIDDEN_SEQUENCE_ALPHA = 0.3; // hidden sequences keep their foot traces at this opacity
const OUTSIDE_DRAW_RANGE_ALPHA = 0.3; // path opacity outside the rendered draw range
const OUTSIDE_DRAW_RANGE_COLOR = "#000";
const ANNOTATION_LABEL_ALPHA = 0.3; // annotation labels dim to this opacity
const ANNOTATION_LABEL_TEXT_ALPHA = 0.6; // annotation label text dims to this opacity

export type ControlPointKey = "p0" | "p1" | "p2" | "p3";

export function annotationNeighbourBounds(
  annotations: Annotation[],
  start: number,
  end: number,
  exclude?: Annotation | ReadonlySet<Annotation> | null,
): { left: number; right: number } {
  let left = 0;
  let right = Infinity;
  for (const other of annotations) {
    if (other === exclude || (exclude instanceof Set && exclude.has(other))) continue;
    const os = Math.min(other.start as number, other.end as number);
    const oe = Math.max(other.start as number, other.end as number);
    if (oe <= start) left = Math.max(left, oe);
    else if (os >= end) right = Math.min(right, os);
  }
  return { left, right };
}

// Clamps a dragged annotation span into the neighbour bounds, so annotations never overlap.
export function clampAnnotationSpan(start: number, end: number, left: number, right: number): [number, number] {
  return [Math.min(Math.max(start, left), right), Math.min(Math.max(end, left), right)];
}

const RINK_BLUE_COLOR = "#fff"; // blue lines, center face-off circle, goal creases
const RINK_RED_COLOR = "#fff"; // center line, goal lines, face-off circles
const RINK_MARKING_WIDTH = 0.1; // m when zoomed in
const RINK_MARKING_MIN_WIDTH = 2; // px on screen when zoomed out
const RINK_GOAL_LINE_OFFSET = 4; // m from each end board
const RINK_FACEOFF_CIRCLE_RADIUS = 4.5; // m, center and end-zone circles
const RINK_FACEOFF_SPOT_LATERAL = 7; // m, end-zone spot lateral offset from the length axis
const RINK_FACEOFF_SPOT_LONGITUDINAL = 6; // m, end-zone spot distance from the goal line
const RINK_CREASE_RADIUS = 1.8; // m, goal crease semicircle
const PATH_WIDTH = 1; // px
const MIN_TRACE_WIDTH = 1.5; // px
const MIN_BLADE_LENGTH = 25; // px, only effective when zoomed out
const MIN_MARK_SIZE = 12; // px minimum toe-pick mark diameter when zoomed out
const MIN_DRAW_INCREMENT = 2; // px
const ELEMENTS_PATH_COLOR = "#000";
const CHANGE_EDGE_LABEL = "CE";
const ELEMENT_DRAW_INCREMENT = 0.02; // m
const NODE_SIZE = 10; // px
const POLYGON_ALPHA = 0.25;
const PICK_RADIUS = 8; // px
const RECT_CLICK_THRESHOLD = 4; // px (max movement still counted as a click)
const ADD_BUTTON_OFFSET = 20; // px, screen distance from the path end to the button center
const BUTTON_RED_COLOR = "#d33";
const BUTTON_GREY_COLOR = "#444";
const DELETE_BUTTON_OFFSET = 20; // px, screen distance from the path line to the button center
const PROVISIONAL_COLOR = "#1976d2";
export const PROVISIONAL_TOTAL_LENGTH = 0.8; // m
export const DEFAULT_START_ELEMENT_LENGTH = 0.4; // m, total span of the default starting element
const SPLIT_BUTTON_OFFSET = 14; // px, from the curve midpoint
const SELECTION_RECT_FILL = "rgba(100, 149, 237, 0.2)"; // gentle blue fill
const SELECTION_RECT_STROKE = "rgba(100, 149, 237, 0.9)";
const ZOOM_FACTOR = 1.005;

const VIDEO_CURSOR_RADIUS = 0.25; // m, half of the 0.5 m cursor circumdiameter
const VIDEO_CURSOR_MIN_SIZE = 50; // px, minimum on-screen circumdiameter when zoomed out
const VIDEO_CURSOR_FILL = "rgba(68, 0, 0, 0.2)";
const VIDEO_CURSOR_REAR_DEPTH = 0.5; // rear corners behind as a fraction of the radius
const VIDEO_CURSOR_WIDTH = 0.6; // arrowhead width as a fraction of the unthinned width
const VIDEO_CURSOR_INSET = 0.25; // inset depth behind as a fraction of the radius

const ANNOTATION_SCALE = 0.6; // 0.3 m line width with the 30 px minimum on-screen when zoomed out
const ANNOTATION_PICK_RADIUS = 15; // px, half of the 30 px highlight line diameter
const ANNOTATION_BUTTON_GAP = 3; // px, screen gap between the button edge and the highlight band edge
const ANNOTATION_ALPHA = 0.3;
const ANNOTATION_OUTLINE_WIDTH = 2; // px on screen, each side of the highlight line
const ANNOTATION_SELECTED_COLOR = "#d33";

const MIN_ZOOM = 2;
const MAX_ZOOM = 5000;
const INITIAL_EDGE_MARGIN = 5; // px between the canvas edge and the rink edge at load
const TRACKING_ANIMATION_MS = 300; // duration of the rapid but smooth center move and rotation
type ViewState = {
  center: Vector<2>;
  zoom: number; // pixel per meter
  rotation: number; // radians, rotates the world counterclockwise on screen
};

export type EditMode = "view" | "path" | "elements" | "timing" | "annotations";

// One canvas action button drawn in the last frame. The owner is what a hit
// returns, so the hit functions read it back per kind.
type DrawnActionButton = {
  kind:
    | "add"
    | "split"
    | "delete"
    | "provisionalPlus"
    | "elementCog"
    | "elementDelete"
    | "timingPlus"
    | "timingCog"
    | "timingMinus"
    | "annotationPlus"
    | "annotationCog"
    | "annotationDelete";
  owner:
    | Sequence
    | Element
    | TimingKeyframe
    | Annotation
    | { sequence: Sequence; curveIndex: number }
    | {
        sequence: Sequence;
        removable: { point: Vector<2>; dir: Vector<2>; isStart: boolean; isEnd: boolean };
      };
  label: ActionButtonLabel;
};

export type ControlPointSelection = {
  sequence: Sequence;
  curveIndex: number;
  pointKey: ControlPointKey;
};

type MoveSnapshot = {
  sequence: Sequence;
  curveStarts: number[];
  curveLengths: number[];
  items: Array<{ element: Element; start: number; end: number }>;
  timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }>;
  annotations: Array<{ annotation: Annotation; start: number; end: number }>;
};

type JointDeletionSnapshot = MoveSnapshot & {
  jointOldIndex: number;
};

export class Editor {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2DSized;
  width = 0;
  height = 0;

  sequences: Sequence[] = [];
  mode: EditMode = "view";
  scaleElements = true;
  showLabels = true;
  activeSequence: Sequence | null = null;

  private _drawRange = 1;
  // Draw range fraction (0: only around the time cursor, 1: full extent).
  get drawRange(): number {
    return this._drawRange;
  }
  set drawRange(value: number) {
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
    if (clamped === this._drawRange) return;
    this._drawRange = clamped;
    this.requestDraw();
  }

  bpm: number = DEFAULT_BPM;
  videoTimeSeconds: number | null = null;
  hiddenSequences: Set<Sequence> = new Set();
  onVideoTimeChange?: (seconds: number) => void;
  onTimeScrubStart?: () => void;
  onTimeScrubEnd?: () => void;
  private isDraggingVideoCursor = false;
  private dragVideoSequence: Sequence | null = null;
  private view: ViewState;

  private selectedPoints = new Map<Sequence, Set<string>>();
  onElementChangeRequest?: (element: Element) => void;
  onAnnotationChangeRequest?: (annotation: Annotation) => void;
  onSequenceChange?: () => void;
  private sequenceMutated = false;
  private ctxTransformApplied = false;
  private selectedCurves = new Map<Sequence, Set<number>>();
  private selectedElements = new Set<Element>();
  private isPanning = false;
  private panDidMove = false;
  // Tracking keeps the view on the time cursors until the user pans the
  // canvas manually. While tracking, each button click advances a cycle:
  // barycenter, then each visible cursor with its trace direction upright,
  // then back to the barycenter.
  tracking = false;
  onTrackingChange?: () => void;
  private trackedCursorCount = 0;
  private trackingTarget: "barycenter" | number = "barycenter";

  // The stage the crosshair button shows: off, the barycenter, or one
  // specific time cursor with its orientation upright.
  get trackingStage(): "off" | "barycenter" | "cursor" {
    if (!this.tracking) return "off";
    return this.trackingTarget === "barycenter" ? "barycenter" : "cursor";
  }
  private trackingAnimation: {
    fromCenter: Vector<2>;
    toCenter: Vector<2>;
    fromRotation: number;
    toRotation: number;
    startedAt: number;
    duration: number;
  } | null = null;
  // True while a time cursor or rink drag holds the tracked view frozen.
  private trackingSuspended = false;
  private trackingFrameHandle: number | null = null;
  private isDraggingPoint = false;
  private isDraggingCurve = false;
  private isSelectingRect = false;
  private provisionalElements = new Map<Sequence, Element>();
  private creatingSequence: Sequence | null = null;
  private isCreatingProvisional = false;
  private provisionalOriginU = 0;
  private provisionalTimingKeyframes = new Map<Sequence, TimingKeyframe>();
  private selectedTimingKeyframes = new Set<TimingKeyframe>();
  private provisionalAnnotations = new Map<Sequence, Annotation>();
  private selectedAnnotations = new Set<Annotation>();
  private isCreatingProvisionalAnnotation = false;
  private annotationCreatingSequence: Sequence | null = null;
  private provisionalAnnotationOriginU = 0;
  private isDraggingAnnotationPoint = false;
  private dragAnnotation: Annotation | null = null;
  private dragAnnotationPointIsStart = false;
  private isDraggingAnnotationSegment = false;
  private annotationSegmentItems: Array<{ annotation: Annotation; start0: number; end0: number }> = [];
  private annotationSegmentDeltaMin = -Infinity;
  private annotationSegmentDeltaMax = Infinity;
  private annotationSegmentGrabU = 0;
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
  private dragSnapshots = new Map<Sequence, MoveSnapshot>();
  private jointDeletionSnapshot: JointDeletionSnapshot | null = null;
  private rectAddToSelection = false;
  private rectTargetsElements = false;
  private rectTargetsTiming = false;
  private rectTargetsAnnotations = false;
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
  private pendingTouchPosition: [number, number] | null = null;
  private lastPinchDist = 0;
  private lastPinchMidX = 0;
  private lastPinchMidY = 0;
  private drawScheduled = false;
  private drawFrameHandle: number | null = null;
  private destroyed = false;
  // Labels collected during the frame, drawn together after collision resolution.
  private labelLayer = new LabelLayer();
  // Action buttons of the last frame, for hit testing at their resolved positions.
  private drawnButtons: DrawnActionButton[] = [];

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
  // The canvas may get its real size only after a layout change, so the rink
  // stays fitted until the first user zoom disables the auto fit.
  private autoFitRink = true;
  // The element or annotation pane overlays the top of the canvas and hides it;
  // the getter returns the occluded height in px so the fit can avoid it.
  private occludedTop: () => number = () => 0;

  constructor(canvas: HTMLCanvasElement, sequences: Sequence[], options?: { occludedTop?: () => number }) {
    this.occludedTop = options?.occludedTop ?? this.occludedTop;
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
      rotation: 0,
    };

    this.resize();
    // Fit the full rink with a small gap between the canvas edge and the closest rink edge.
    this.fitRink();

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
    // Canvas text may render before the webfont loads; redraw once it is ready.
    canvasFontReady().then(() => this.requestDraw());
  }

  destroy() {
    this.cancelTrackingAnimation();
    if (this.drawFrameHandle !== null) {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.drawFrameHandle);
      this.drawFrameHandle = null;
    }
    this.drawScheduled = false;
    this.destroyed = true;
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
    this.clearEditingState();
    this.draw();
  }

  private clearEditingState() {
    this.dragSnapshots.clear();
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
    this.isDraggingVideoCursor = false;
    this.dragVideoSequence = null;
    this.isDraggingPoint = false;
    this.isDraggingCurve = false;
    this.isDraggingTimingPoint = false;
    this.isDraggingElementPoint = false;
    this.isDraggingElementSegment = false;
    this.provisionalTimingKeyframes.clear();
    this.selectedTimingKeyframes.clear();
    this.isCreatingProvisionalTiming = false;
    this.timingCreatingSequence = null;
    this.dragTimingItems = [];
    this.draggingTimingKeyframe = null;
    this.dragTimingSequence = null;
    this.provisionalAnnotations.clear();
    this.selectedAnnotations.clear();
    this.isCreatingProvisionalAnnotation = false;
    this.annotationCreatingSequence = null;
    this.isDraggingAnnotationPoint = false;
    this.isDraggingAnnotationSegment = false;
    this.dragAnnotation = null;
    this.annotationSegmentItems = [];
  }

  setHiddenSequences(next: Set<Sequence>) {
    // The visible-set semantics decide the redraw; the computed upstream may
    // pass a new Set with the same membership on every store trigger.
    const previous = this.hiddenSequences;
    if (previous.size === next.size && [...next].every((sequence) => previous.has(sequence))) {
      this.hiddenSequences = next;
      return;
    }
    const hasNewlyHidden = this.sequences.some((sequence) => next.has(sequence) && !this.hiddenSequences.has(sequence));
    this.hiddenSequences = next;
    if (hasNewlyHidden) this.clearEditingState();
    this.draw();
  }

  // In-place timing keyframe edits bypass Sequence.addKeyframe, so they must
  // invalidate the sequence timing caches explicitly.
  invalidateTimeCachesFor(keyframe: TimingKeyframe) {
    this.getSequenceOfTimingKeyframe(keyframe)?.invalidateTimeCaches();
  }

  private editSequences(): Sequence[] {
    return this.sequences.filter((sequence) => !this.hiddenSequences.has(sequence));
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

  getSequenceOfAnnotation(annotation: Annotation): Sequence | null {
    for (const sequence of this.sequences) {
      if (sequence.annotations.includes(annotation)) return sequence;
    }
    for (const [sequence, provisional] of this.provisionalAnnotations) {
      if (provisional === annotation) return sequence;
    }
    return null;
  }

  isProvisionalAnnotation(annotation: Annotation): boolean {
    for (const provisional of this.provisionalAnnotations.values()) {
      if (provisional === annotation) return true;
    }
    return false;
  }

  private ownedAnnotations(sequence: Sequence): Annotation[] {
    const provisional = this.provisionalAnnotations.get(sequence);
    return provisional ? [provisional, ...sequence.annotations] : [...sequence.annotations];
  }

  private getSingleSelectedAnnotation(): Annotation | null {
    if (this.selectedAnnotations.size !== 1) return null;
    return [...this.selectedAnnotations][0]!;
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
    this.selectedAnnotations.clear();
    this.provisionalElements.clear();
    this.provisionalTimingKeyframes.clear();
    this.provisionalAnnotations.clear();
    this.creatingSequence = null;
    this.isCreatingProvisional = false;
    this.timingCreatingSequence = null;
    this.isCreatingProvisionalTiming = false;
    this.annotationCreatingSequence = null;
    this.isCreatingProvisionalAnnotation = false;
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
    this.drawnButtons.length = 0;
    this.advanceTrackingAnimation();
    this.updateTracking();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    // A mid-frame error must not leave ctx.save() on the stack.
    this.transformContext();
    this.ctxTransformApplied = true;
    try {
      this.drawRink();
      // Annotations render just above the rink, behind everything else, in every mode.
      this.drawAnnotations();
      this.drawVideoCursor();
      if (this.mode !== "view") {
        for (const sequence of this.sequences) {
          this.drawPath(sequence);
        }
      }
      this.drawSelectedCurves();
      let drewElements = false;
      if (this.mode === "path") {
        for (const sequence of this.editSequences()) {
          this.drawControlHandles(sequence);
        }
      } else if (this.mode === "elements") {
        drewElements = this.drawElements();
      } else if (this.mode === "view") {
        this.drawTraces();
        if (this.showLabels) this.collectTimingBeatLabels();
      } else if (this.mode === "timing") {
        this.drawTimingElements();
        this.drawTimingKeyframes();
        this.collectTimingTimeLabels();
        this.collectTimingBeatLabels();
      }
      if (this.mode === "path" || this.mode === "elements") {
        this.drawCurvatureWarnings();
      }
      // Labels hide in view mode via showLabels. Timing mode keeps only the
      // CE inflection and annotation labels.
      if (this.showLabels || this.mode !== "view") {
        for (const sequence of this.editSequences()) {
          if (this.mode !== "timing") this.collectElementLabels(sequence);
          this.collectAnnotationLabels(sequence);
        }
        this.collectInflectionLabels();
        this.collectStartLabels();
      }
      // The buttons render above the labels, so no pointer crosses a button.
      if (this.mode === "path") {
        this.collectAddButtons();
        this.collectSplitButtons();
        this.collectPathDeleteButtons();
      } else if (this.mode === "elements") {
        if (drewElements) this.collectElementModeButtons();
      } else if (this.mode === "timing") {
        this.collectTimingButtons();
      } else if (this.mode === "annotations") {
        this.collectAnnotationButtons();
      }
      this.labelLayer.resolveAndDraw(this.ctx);
    } catch (error) {
      // A partial frame must not leave stale buttons registered for hit testing.
      this.drawnButtons.length = 0;
      throw error;
    } finally {
      if (this.ctxTransformApplied) {
        this.ctxTransformApplied = false;
        ctx.restore();
        this.drawSelectionRectangle();
      }
    }
  }

  requestDraw() {
    if (this.destroyed) return;
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

  private getVideoCursorRadius(): number {
    return Math.max(VIDEO_CURSOR_RADIUS, VIDEO_CURSOR_MIN_SIZE / 2 / this.view.zoom);
  }

  private getAnnotationLineWidth(): number {
    return 2 * this.getVideoCursorRadius() * ANNOTATION_SCALE;
  }

  private setTimeCursorToElementCenter(element: Element) {
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return;
    const lo = Math.min(element.start as number, element.end as number);
    const hi = Math.max(element.start as number, element.end as number);
    const seconds = sequence.getTimeFromPathCoordinate(((lo + hi) / 2) as PathCoordinate, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private setTimeCursorToElementCoordinate(element: Element, u: PathCoordinate) {
    const sequence = this.getSequenceOfElement(element);
    if (!sequence) return;
    const seconds = sequence.getTimeFromPathCoordinate(u, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private setTimeCursorToAnnotationCenter(annotation: Annotation) {
    const sequence = this.getSequenceOfAnnotation(annotation);
    if (!sequence) return;
    const lo = Math.min(annotation.start as number, annotation.end as number);
    const hi = Math.max(annotation.start as number, annotation.end as number);
    const seconds = sequence.getTimeFromPathCoordinate(((lo + hi) / 2) as PathCoordinate, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private setTimeCursorToAnnotationCoordinate(annotation: Annotation, u: PathCoordinate) {
    const sequence = this.getSequenceOfAnnotation(annotation);
    if (!sequence) return;
    const seconds = sequence.getTimeFromPathCoordinate(u, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private moveVideoCursorToPathCoordinate(sequence: Sequence, u: number) {
    if (!hasTimeEvolution(sequence)) return;
    const seconds = sequence.getTimeFromPathCoordinate(u as PathCoordinate, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private setTimeCursorToTimingKeyframe(sequence: Sequence, keyframe: TimingKeyframe) {
    const seconds = sequence.getTimeFromPathCoordinate(keyframe.pathCoordinate, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private getVideoCursorPosition(sequence: Sequence): PathCoordinate | null {
    if (this.videoTimeSeconds === null) return null;
    if (!hasTimeEvolution(sequence)) return null;
    const range = sequenceTimeRange(sequence, this.bpm);
    if (!range) return null;
    const time = this.videoTimeSeconds as Time;
    if (time < range[0] || time > range[1]) return null;
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    return sequence.getPathCoordinateFromTime(time, this.bpm);
  }

  private getVideoCursorPoint(sequence: Sequence): Vector<2> | null {
    const u = this.getVideoCursorPosition(sequence);
    return u === null ? null : sequence.path.getPosition(u);
  }

  private getVideoCursorGeometry(sequence: Sequence): { point: Vector<2>; angle: number } | null {
    const u = this.getVideoCursorPosition(sequence);
    if (u === null) return null;
    // The orientation comes from the path direction and the interpolated hips
    // keyframes: a sequence without hips orientation data falls back to the path
    // direction alone.
    const angle = sequence.keyframes.hips.some((keyframe) => keyframe.data.orientation !== undefined)
      ? sequence.getFloorAngle("hips", u)
      : sequence.getFloorAngleFromPath(u);
    return { point: sequence.path.getPosition(u), angle };
  }

  private visibleTimeCursors(): { sequence: Sequence; point: Vector<2>; angle: number }[] {
    const cursors: { sequence: Sequence; point: Vector<2>; angle: number }[] = [];
    if (this.videoTimeSeconds === null) return cursors;
    for (const sequence of this.editSequences()) {
      const geometry = this.getVideoCursorGeometry(sequence);
      if (!geometry) continue;
      cursors.push({ sequence, point: geometry.point, angle: geometry.angle });
    }
    return cursors;
  }

  followTimeCursor() {
    if (this.trackingSuspended) return;
    const count = this.visibleTimeCursors().length;
    if (count === 0) return;
    if (!this.tracking) {
      this.trackingTarget = "barycenter";
    } else if (this.trackingTarget === "barycenter") {
      this.trackingTarget = 0;
    } else {
      const next = this.trackingTarget + 1;
      this.trackingTarget = next >= count ? "barycenter" : next;
    }
    this.setTracking(true);
    this.trackedCursorCount = count;
    this.startTrackingAnimation(this.trackingGoal());
    // The stage may change while tracking stays on, so the button state
    // updates through this callback too.
    this.onTrackingChange?.();
  }

  // Freezes the tracked view: the center and orientation stay where they
  // were while the user drags a time cursor or the rink.
  private suspendTracking() {
    if (!this.tracking || this.trackingSuspended) return;
    this.trackingSuspended = true;
    this.cancelTrackingAnimation();
  }

  // Re-engages the frozen tracking after a time cursor drag ends.
  private resumeTracking() {
    if (!this.tracking || !this.trackingSuspended) return;
    this.trackingSuspended = false;
    this.trackedCursorCount = this.visibleTimeCursors().length;
    this.startTrackingAnimation(this.trackingGoal());
  }

  disableTracking() {
    this.trackingSuspended = false;
    this.setTracking(false);
    // Panning breaks tracking: rotate the rink back upright smoothly.
    if (Math.abs(this.view.rotation) > 1e-6) {
      this.startTrackingAnimation({ point: this.view.center, rotation: 0 });
    }
  }

  private setTracking(value: boolean) {
    if (value === this.tracking) return;
    this.tracking = value;
    if (!value) {
      this.cancelTrackingAnimation();
      this.trackedCursorCount = 0;
    }
    this.onTrackingChange?.();
  }

  // The center and rotation the tracked view should ease toward: the
  // barycenter keeps the default rotation, a tracked cursor rotates the
  // whole rink so its trace direction points up on screen.
  private trackingGoal(): { point: Vector<2>; rotation: number } | null {
    const cursors = this.visibleTimeCursors();
    if (this.trackingTarget === "barycenter") {
      if (cursors.length === 0) return null;
      let sum = new Vector<2>(0, 0);
      for (const cursor of cursors) sum = sum.plus(cursor.point);
      return { point: sum.times(1 / cursors.length), rotation: 0 };
    }
    // A hidden sibling shifts the indices, so the target falls back to the
    // last remaining cursor.
    const cursor = cursors[Math.min(this.trackingTarget, cursors.length - 1)];
    if (!cursor) return null;
    return { point: cursor.point, rotation: Math.PI / 2 - cursor.angle };
  }

  private startTrackingAnimation(goal: { point: Vector<2>; rotation: number } | null) {
    this.cancelTrackingAnimation();
    if (!goal) return;
    if (typeof requestAnimationFrame !== "function") {
      this.view.center = goal.point;
      this.view.rotation = goal.rotation;
      return;
    }
    // Take the short way around, so the rotation never spins the long arc.
    const rotationDelta = Math.atan2(
      Math.sin(goal.rotation - this.view.rotation),
      Math.cos(goal.rotation - this.view.rotation),
    );
    this.trackingAnimation = {
      fromCenter: this.view.center,
      toCenter: goal.point,
      fromRotation: this.view.rotation,
      toRotation: this.view.rotation + rotationDelta,
      startedAt: performance.now(),
      duration: TRACKING_ANIMATION_MS,
    };
    const step = () => {
      this.trackingFrameHandle = null;
      if (!this.trackingAnimation) return;
      this.requestDraw();
      if (performance.now() - this.trackingAnimation.startedAt >= this.trackingAnimation.duration) {
        this.trackingAnimation = null;
        return;
      }
      this.trackingFrameHandle = requestAnimationFrame(step);
    };
    this.trackingFrameHandle = requestAnimationFrame(step);
    this.requestDraw();
  }

  private cancelTrackingAnimation() {
    if (this.trackingFrameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.trackingFrameHandle);
    }
    this.trackingFrameHandle = null;
    this.trackingAnimation = null;
  }

  // Runs at the top of draw, also while tracking is off after a pan broke
  // it: the tracked center move and rotation ease toward their goals.
  private advanceTrackingAnimation() {
    const animation = this.trackingAnimation;
    if (!animation) return;
    const t = Math.min(1, (performance.now() - animation.startedAt) / animation.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    this.view.center = animation.fromCenter.plus(animation.toCenter.minus(animation.fromCenter).times(eased));
    this.view.rotation = animation.fromRotation + (animation.toRotation - animation.fromRotation) * eased;
    if (t >= 1) this.trackingAnimation = null;
  }

  // Runs at the top of draw: a jump in the tracked cursor count eases toward
  // the new goal, and without an animation the view follows the goal with no
  // lag. When no cursor is visible, the view stays still and a running move
  // stops.
  private updateTracking() {
    if (!this.tracking || this.trackingSuspended) return;
    const count = this.visibleTimeCursors().length;
    if (count === 0) this.cancelTrackingAnimation();
    const jumped = count !== this.trackedCursorCount && count > 0;
    this.trackedCursorCount = count;
    if (jumped) this.startTrackingAnimation(this.trackingGoal());
    if (this.trackingAnimation) return;
    const goal = this.trackingGoal();
    if (goal) {
      this.view.center = goal.point;
      this.view.rotation = goal.rotation;
    }
  }

  private hitVideoCursor(screenX: number, screenY: number): Sequence | null {
    if (this.videoTimeSeconds === null) return null;
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = Math.max(this.getVideoCursorRadius() + 0.05, PICK_RADIUS / this.view.zoom);
    let best: Sequence | null = null;
    let bestDistance = Infinity;
    for (const sequence of this.editSequences()) {
      const point = this.getVideoCursorPoint(sequence);
      if (!point) continue;
      const distance = point.minus(cursor).length();
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        best = sequence;
      }
    }
    return best;
  }

  private hitNearPath(screenX: number, screenY: number): Sequence | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = Math.max(this.getVideoCursorRadius() + 0.05, PICK_RADIUS / this.view.zoom);
    let best: Sequence | null = null;
    let bestDistance = Infinity;
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      let distance = Infinity;
      for (const curve of sequence.path.curves) distance = Math.min(distance, curve.getClosestPoint(cursor).distance);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        best = sequence;
      }
    }
    return best;
  }

  private dragVideoCursor(screenX: number, screenY: number) {
    const sequence = this.dragVideoSequence ?? this.activeSequence;
    if (!sequence) return;
    const cursor = this.screenToWorld(screenX, screenY);
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return;
    const seconds = sequence.getTimeFromPathCoordinate(u as PathCoordinate, this.bpm);
    this.videoTimeSeconds = seconds;
    this.onVideoTimeChange?.(seconds);
  }

  private drawVideoCursor() {
    for (const sequence of this.editSequences()) {
      const geometry = this.getVideoCursorGeometry(sequence);
      if (!geometry) continue;
      this.drawMetres(() => {
        const ctx = this.ctx;
        const radius = this.getVideoCursorRadius();
        // The cursor is an isosceles triangle, tip forward, with a low
        // triangular inset cut behind. The tip lies on the circle of the former
        // timestamp circle, so the length stays the same; the arrowhead is
        // thinned to 60% of the unthinned width.
        const rear = -VIDEO_CURSOR_REAR_DEPTH * radius;
        const halfBase = VIDEO_CURSOR_WIDTH * Math.sin(Math.acos(-rear / radius)) * radius;
        const cos = Math.cos(geometry.angle);
        const sin = Math.sin(geometry.angle);
        const rotate = (x: number, y: number): Vector<2> =>
          new Vector<2>(geometry.point.x + x * cos - y * sin, geometry.point.y + x * sin + y * cos);
        const vertices = [
          rotate(radius, 0),
          rotate(rear, halfBase),
          rotate(rear + VIDEO_CURSOR_INSET * radius, 0),
          rotate(rear, -halfBase),
        ];
        ctx.fillStyle = VIDEO_CURSOR_FILL;
        ctx.beginPath();
        ctx.moveTo(vertices[0]!.x, -vertices[0]!.y);
        for (const vertex of vertices.slice(1)) ctx.lineTo(vertex.x, -vertex.y);
        ctx.closePath();
        ctx.fill();
      });
    }
  }

  private drawAnnotations() {
    // Inside drawMetres the stroke width is read in metres: no CANVAS_SCALE conversion.
    const lineWidth = this.getAnnotationLineWidth();
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      for (const annotation of sequence.annotations) {
        this.drawAnnotationHighlight(sequence, annotation, lineWidth, this.selectedAnnotations.has(annotation), false);
      }
      const provisional = this.provisionalAnnotations.get(sequence);
      if (provisional) {
        this.drawAnnotationHighlight(sequence, provisional, lineWidth, false, true);
      }
    }
  }

  private drawAnnotationHighlight(
    sequence: Sequence,
    annotation: Annotation,
    lineWidth: number,
    selected: boolean,
    provisional: boolean,
  ) {
    const path = sequence.path;
    const span = this.clampedAnnotationSpan(sequence, annotation);
    if (span.hi <= span.lo) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "butt";
    if (selected) {
      ctx.strokeStyle = ANNOTATION_SELECTED_COLOR;
      ctx.globalAlpha = 1;
      ctx.lineWidth = lineWidth + (2 * ANNOTATION_OUTLINE_WIDTH) / this.view.zoom;
      this.drawMetres(() => path.drawRange(ctx, span.lo as PathCoordinate, span.hi as PathCoordinate));
    }
    ctx.strokeStyle = provisional ? PROVISIONAL_COLOR : annotation.color;
    ctx.globalAlpha = ANNOTATION_ALPHA;
    ctx.lineWidth = lineWidth;
    this.drawMetres(() => path.drawRange(ctx, span.lo as PathCoordinate, span.hi as PathCoordinate));
    ctx.restore();
    if (selected) {
      const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;
      ctx.fillStyle = ANNOTATION_SELECTED_COLOR;
      for (const u of [span.lo, span.hi]) {
        const point = path.getPosition(u as PathCoordinate);
        ctx.beginPath();
        ctx.arc(point.x * CANVAS_SCALE, -point.y * CANVAS_SCALE, nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  private clampedAnnotationSpan(sequence: Sequence, annotation: Annotation): { lo: number; hi: number } {
    const pathLength = sequence.path.length;
    const lo = Math.max(0, Math.min(annotation.start as number, annotation.end as number));
    const hi = Math.min(pathLength, Math.max(annotation.start as number, annotation.end as number));
    return { lo, hi };
  }

  private annotationBounds(
    sequence: Sequence,
    start: number,
    end: number,
    exclude?: Annotation | ReadonlySet<Annotation> | null,
  ): { left: number; right: number } {
    const bounds = annotationNeighbourBounds(sequence.annotations, start, end, exclude);
    return { left: bounds.left, right: Math.min(bounds.right, sequence.path.length) };
  }

  private getAnnotationPoints(sequence: Sequence, annotation: Annotation): Vector<2>[] {
    const path = sequence.path;
    const { lo, hi } = this.clampedAnnotationSpan(sequence, annotation);
    const span = hi - lo;
    const step = Math.min(ELEMENT_DRAW_INCREMENT, span / 4) || ELEMENT_DRAW_INCREMENT;
    const points: Vector<2>[] = [];
    for (let u = lo; u <= hi; u += step) {
      points.push(path.getPosition(u as PathCoordinate));
    }
    return points;
  }

  private selectableAnnotations(sequence: Sequence): Annotation[] {
    const provisional = this.provisionalAnnotations.get(sequence);
    const annotations = [...sequence.annotations];
    if (provisional) annotations.push(provisional);
    return annotations;
  }

  private selectAnnotation(annotation: Annotation, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedAnnotations.has(annotation)) this.selectedAnnotations.delete(annotation);
      else this.selectedAnnotations.add(annotation);
    } else if (!this.selectedAnnotations.has(annotation)) {
      this.selectedAnnotations = new Set([annotation]);
    }
  }

  private pickAnnotation(screenX: number, screenY: number): Annotation | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = ANNOTATION_PICK_RADIUS / this.view.zoom;
    let best: Annotation | null = null;
    let bestDistance = Infinity;
    for (const sequence of this.editSequences()) {
      for (const annotation of this.selectableAnnotations(sequence)) {
        const points = this.getAnnotationPoints(sequence, annotation);
        if (points.length === 0) continue;
        for (const point of [points[0], points[points.length - 1]]) {
          if (!point) continue;
          const distance = point.minus(cursor).length();
          if (distance <= tolerance && distance < bestDistance) {
            bestDistance = distance;
            best = annotation;
          }
        }
        for (let i = 0; i < points.length - 1; i++) {
          const distance = distanceToSegment(cursor, points[i]!, points[i + 1]!);
          if (distance <= tolerance && distance < bestDistance) {
            bestDistance = distance;
            best = annotation;
          }
        }
      }
    }
    return best;
  }

  private pickAnnotationControlPoint(
    screenX: number,
    screenY: number,
  ): { annotation: Annotation; isStart: boolean } | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = ANNOTATION_PICK_RADIUS / this.view.zoom;
    let best: { annotation: Annotation; isStart: boolean } | null = null;
    let bestDistance = Infinity;
    for (const sequence of this.editSequences()) {
      for (const annotation of this.selectableAnnotations(sequence)) {
        const points = this.getAnnotationPoints(sequence, annotation);
        if (points.length === 0) continue;
        for (const [isStart, point] of [
          [true, points[0]!],
          [false, points[points.length - 1]!],
        ] as Array<[boolean, Vector<2>]>) {
          const distance = point.minus(cursor).length();
          if (distance <= tolerance && distance <= bestDistance) {
            bestDistance = distance;
            best = { annotation, isStart };
          }
        }
      }
    }
    return best;
  }

  private snapAnnotationPointToPath(
    annotation: Annotation,
    isStart: boolean,
    cursor: Vector<2>,
  ): PathCoordinate | null {
    const sequence = this.getSequenceOfAnnotation(annotation);
    if (!sequence) return null;
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return null;
    let clamped = Math.max(0, Math.min(path.length, u));
    const other = (isStart ? annotation.end : annotation.start) as number;
    clamped = isStart ? Math.min(clamped, other) : Math.max(clamped, other);
    const { left, right } = this.annotationBounds(
      sequence,
      Math.min(annotation.start as number, annotation.end as number),
      Math.max(annotation.start as number, annotation.end as number),
      annotation,
    );
    clamped = isStart ? Math.max(clamped, left) : Math.min(clamped, right);
    return clamped as PathCoordinate;
  }

  private startAnnotationSegmentDrag(annotation: Annotation, screenX: number, screenY: number) {
    const sequence = this.getSequenceOfAnnotation(annotation);
    if (!sequence || sequence.path.curves.length === 0) return;
    const cursor = this.screenToWorld(screenX, screenY);
    const anchorIndex = this.curveIndexAt(sequence.path, annotation.start as number);
    const grabbedU = this.snapCursorToPathNearCurve(sequence, anchorIndex, cursor);
    if (grabbedU == null) return;

    const lo = Math.min(annotation.start as number, annotation.end as number);
    const hi = Math.max(annotation.start as number, annotation.end as number);
    const clampedGrab = Math.min(Math.max(grabbedU as number, lo), hi);

    this.isDraggingAnnotationSegment = true;
    this.dragAnnotation = annotation;
    this.annotationSegmentGrabU = clampedGrab;

    const moving = new Set<Annotation>([annotation]);
    if (
      !this.isProvisionalAnnotation(annotation) &&
      this.selectedAnnotations.has(annotation) &&
      this.selectedAnnotations.size > 1
    ) {
      for (const selected of this.selectedAnnotations) moving.add(selected);
    }

    this.annotationSegmentItems = [];
    let dMin = -Infinity;
    let dMax = Infinity;
    for (const moved of moving) {
      const movedSequence = this.getSequenceOfAnnotation(moved);
      if (!movedSequence) continue;
      const s0 = Math.min(moved.start as number, moved.end as number);
      const e0 = Math.max(moved.start as number, moved.end as number);
      this.annotationSegmentItems.push({ annotation: moved, start0: s0, end0: e0 });
      const bounds = this.annotationBounds(movedSequence, s0, e0, moving);
      const left = Math.min(bounds.left, s0);
      const right = Math.min(bounds.right, movedSequence.path.length);
      dMin = Math.max(dMin, -movedSequence.path.arcLengthBetween(left as PathCoordinate, s0 as PathCoordinate));
      dMax = Math.min(dMax, movedSequence.path.arcLengthBetween(e0 as PathCoordinate, right as PathCoordinate));
    }
    this.annotationSegmentDeltaMin = dMin;
    this.annotationSegmentDeltaMax = dMax;
  }

  private startProvisionalAnnotationCreation(sequence: Sequence, u: number) {
    this.placeProvisionalAnnotation(sequence, u);
    this.moveVideoCursorToProvisionalAnnotation(sequence);
    this.isCreatingProvisionalAnnotation = true;
    this.annotationCreatingSequence = sequence;
    this.provisionalAnnotationOriginU = u;
  }

  private placeProvisionalAnnotation(sequence: Sequence, u: number) {
    const half = PROVISIONAL_TOTAL_LENGTH / 2;
    this.setProvisionalAnnotationSpan(sequence, u - half, u + half);
  }

  private updateProvisionalAnnotationCreation(cursor: Vector<2>) {
    const sequence = this.annotationCreatingSequence;
    if (!sequence) return;
    const provisional = this.provisionalAnnotations.get(sequence);
    if (!provisional || sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return;
    const origin = this.provisionalAnnotationOriginU;
    if (Math.abs(u - origin) < 1e-9) {
      this.placeProvisionalAnnotation(sequence, origin);
      this.moveVideoCursorToProvisionalAnnotation(sequence);
      return;
    }
    this.setProvisionalAnnotationSpan(sequence, Math.min(origin, u), Math.max(origin, u), origin);
    this.moveVideoCursorToProvisionalAnnotationEdge(sequence, u);
  }

  private moveVideoCursorToProvisionalAnnotation(sequence: Sequence) {
    const annotation = this.provisionalAnnotations.get(sequence);
    if (annotation) this.setTimeCursorToAnnotationCenter(annotation);
  }

  private moveVideoCursorToProvisionalAnnotationEdge(sequence: Sequence, u: number) {
    const provisional = this.provisionalAnnotations.get(sequence);
    if (!provisional) return;
    const edge = u > this.provisionalAnnotationOriginU ? provisional.end : provisional.start;
    this.setTimeCursorToAnnotationCoordinate(provisional, edge);
  }

  private setProvisionalAnnotationSpan(sequence: Sequence, start: number, end: number, anchor?: number) {
    const path = sequence.path;
    if (path.curves.length === 0) return;
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(path.length, end);
    const mid = anchor ?? (clampedStart + clampedEnd) / 2;
    const existing = this.provisionalAnnotations.get(sequence) ?? null;
    let left = 0;
    let right = path.length;
    for (const other of sequence.annotations) {
      if (other === existing) continue;
      const os = Math.min(other.start as number, other.end as number);
      const oe = Math.max(other.start as number, other.end as number);
      if (oe <= mid) left = Math.max(left, oe);
      else right = Math.min(right, os);
    }
    const lo = Math.max(clampedStart, left);
    const hi = Math.min(clampedEnd, right);
    const finalStart = Math.min(lo, hi);
    if (!existing) {
      this.provisionalAnnotations.set(sequence, new Annotation(finalStart as PathCoordinate, hi as PathCoordinate));
    } else {
      existing.start = finalStart as PathCoordinate;
      existing.end = hi as PathCoordinate;
    }
    this.selectedAnnotations = new Set(
      [...this.selectedAnnotations].filter((item) => this.getSequenceOfAnnotation(item) !== sequence),
    );
    this.requestDraw();
  }

  commitProvisionalAnnotation(annotation: Annotation): Sequence | null {
    const sequence = this.getSequenceOfAnnotation(annotation);
    if (!sequence || !this.isProvisionalAnnotation(annotation)) return null;
    this.provisionalAnnotations.delete(sequence);
    this.annotationCreatingSequence = null;
    this.isCreatingProvisionalAnnotation = false;
    sequence.addAnnotation(annotation);
    this.notifySequenceChange();
    this.draw();
    return sequence;
  }

  private annotationButtonOffset(): number {
    return this.getAnnotationLineWidth() / 2 + (ACTION_BUTTON_RADIUS + ANNOTATION_BUTTON_GAP) / this.view.zoom;
  }

  private collectAnnotationButtons() {
    const offset = this.annotationButtonOffset();
    for (const [sequence, provisional] of this.provisionalAnnotations) {
      if (sequence.path.curves.length === 0) continue;
      const geometry = this.midpointNormal(sequence, provisional);
      if (!geometry) continue;
      this.collectActionButton(
        "annotationPlus",
        provisional,
        new PlusButtonLabel(geometry.point.plus(geometry.perp.times(-offset)), this.view.zoom, PROVISIONAL_COLOR),
      );
    }
    const selected = this.getSingleSelectedAnnotation();
    if (!selected || this.isProvisionalAnnotation(selected)) return;
    const owner = this.getSequenceOfAnnotation(selected);
    if (!owner || owner.path.curves.length === 0) return;
    const geometry = this.midpointNormal(owner, selected);
    if (!geometry) return;
    this.collectActionButton(
      "annotationDelete",
      selected,
      new MinusButtonLabel(geometry.point.plus(geometry.perp.times(offset)), this.view.zoom, BUTTON_RED_COLOR),
    );
    this.collectActionButton(
      "annotationCog",
      selected,
      new CogButtonLabel(geometry.point.plus(geometry.perp.times(-offset)), this.view.zoom, BUTTON_GREY_COLOR),
    );
  }

  private hitProvisionalAnnotationPlus(screenX: number, screenY: number): Annotation | null {
    const button = this.findDrawnActionButton("annotationPlus", screenX, screenY);
    return button ? (button.owner as Annotation) : null;
  }

  private getAnnotationActionButtonAnnotation(): Annotation | null {
    const selected = this.getSingleSelectedAnnotation();
    if (!selected || this.isProvisionalAnnotation(selected)) return null;
    return selected;
  }

  private hitAnnotationCogButton(screenX: number, screenY: number): boolean {
    return this.findDrawnActionButton("annotationCog", screenX, screenY) !== null;
  }

  private hitAnnotationDeleteButton(screenX: number, screenY: number): boolean {
    return this.findDrawnActionButton("annotationDelete", screenX, screenY) !== null;
  }

  private drawTraces() {
    const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
    const minBladeLength = this.scaleElements ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
    const minMarkSize = MIN_MARK_SIZE / this.view.zoom;
    const minDrawIncrement = MIN_DRAW_INCREMENT / this.view.zoom;
    const viewport = this.getTraceViewport(minBladeLength);
    const window = this.traceDrawWindow();
    for (const sequence of this.sequences) {
      const hiddenAlpha = this.hiddenSequences.has(sequence) ? HIDDEN_SEQUENCE_ALPHA : 1;
      if (window === null) {
        this.ctx.globalAlpha = hiddenAlpha;
        this.drawMetres(() =>
          sequence.drawTraces(
            this.ctx,
            minTraceWidth,
            minBladeLength,
            minMarkSize,
            minDrawIncrement,
            viewport,
            this.sequenceMutated,
          ),
        );
        this.ctx.globalAlpha = 1;
        continue;
      }
      if (sequence.path.curves.length === 0) continue;
      if (!hasTimeEvolution(sequence)) {
        // No computable time along the path: keep it fully drawn.
        this.ctx.globalAlpha = hiddenAlpha;
        this.drawMetres(() =>
          sequence.drawTraces(
            this.ctx,
            minTraceWidth,
            minBladeLength,
            minMarkSize,
            minDrawIncrement,
            viewport,
            this.sequenceMutated,
          ),
        );
        this.ctx.globalAlpha = 1;
        continue;
      }
      const timeRange = sequenceTimeRange(sequence, this.bpm);
      if (!timeRange) {
        this.ctx.globalAlpha = hiddenAlpha;
        this.drawMetres(() =>
          sequence.drawTraces(
            this.ctx,
            minTraceWidth,
            minBladeLength,
            minMarkSize,
            minDrawIncrement,
            viewport,
            this.sequenceMutated,
          ),
        );
        this.ctx.globalAlpha = 1;
        continue;
      }
      const path = sequence.path;
      const overlapT0 = Math.max(window[0], timeRange[0]);
      const overlapT1 = Math.min(window[1], timeRange[1]);
      if (overlapT1 <= overlapT0) {
        this.drawOutsideDrawRangeStroke(path, 0 as PathCoordinate, undefined, hiddenAlpha);
        continue;
      }
      const uLoRaw = sequence.getPathCoordinateFromTime(overlapT0 as Time, this.bpm);
      const uHiRaw = sequence.getPathCoordinateFromTime(overlapT1 as Time, this.bpm);
      const uLo = Math.min(uLoRaw, uHiRaw);
      const uHi = Math.max(uLoRaw, uHiRaw);
      this.drawOutsideDrawRangeStroke(path, 0 as PathCoordinate, uLo as PathCoordinate, hiddenAlpha);
      this.drawOutsideDrawRangeStroke(path, uHi as PathCoordinate, undefined, hiddenAlpha);
      this.ctx.globalAlpha = hiddenAlpha;
      this.drawMetres(() =>
        sequence.drawFootTraces(
          this.ctx,
          uLo as PathCoordinate,
          uHi as PathCoordinate,
          minTraceWidth,
          minBladeLength,
          minMarkSize,
          minDrawIncrement,
          viewport,
          this.sequenceMutated,
        ),
      );
      this.ctx.globalAlpha = 1;
    }
  }

  // Hides when the element time span lies entirely outside the drawing range.
  private elementNameHidden(sequence: Sequence, element: Element): boolean {
    if (this.mode !== "view") return false;
    const window = this.traceDrawWindow();
    if (window === null) return false;
    const loU = Math.min(element.start as number, element.end as number);
    const hiU = Math.max(element.start as number, element.end as number);
    const lo = sequence.getTimeFromPathCoordinate(loU as PathCoordinate, this.bpm);
    const hi = sequence.getTimeFromPathCoordinate(hiU as PathCoordinate, this.bpm);
    return Math.max(lo, hi) < window[0] || Math.min(lo, hi) > window[1];
  }

  private drawOutsideDrawRangeStroke(
    path: Path,
    uStart: PathCoordinate,
    uEnd: PathCoordinate | undefined,
    hiddenAlpha: number,
  ) {
    const start = Math.max(0, uStart as number);
    const end = Math.min(path.length, uEnd ?? path.length);
    if (end <= start) return;
    const ctx = this.ctx;
    ctx.globalAlpha = OUTSIDE_DRAW_RANGE_ALPHA * hiddenAlpha;
    ctx.strokeStyle = OUTSIDE_DRAW_RANGE_COLOR;
    ctx.lineWidth = PATH_WIDTH / this.view.zoom;
    this.drawMetres(() => path.drawRange(ctx, uStart, (uEnd ?? path.length) as PathCoordinate));
    ctx.globalAlpha = 1;
  }

  // The time window the draw range renders around the time cursor.
  private traceDrawWindow(): [number, number] | null {
    if (this.drawRange >= 1) return null;
    const extent = fullTimeExtentSeconds(this.sequences, this.bpm);
    if (!extent) return null;
    if (this.videoTimeSeconds === null) return null;
    const center = this.videoTimeSeconds;
    const halfWindow = (extent[1] - extent[0]) * this.drawRange ** 2;
    const t0 = Math.max(extent[0], center - halfWindow);
    const t1 = Math.min(extent[1], center + halfWindow);
    if (t1 <= t0) return null;
    return [t0, t1];
  }

  private getTraceViewport(minBladeLength?: number): AxisRect {
    const margin = minBladeLength === undefined ? bladeLength : Math.max(bladeLength, minBladeLength);
    // With a rotated view the visible world region is a rotated rectangle, so
    // the culling box spans its four corners.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const corner of [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.width, 0),
      this.screenToWorld(this.width, this.height),
      this.screenToWorld(0, this.height),
    ]) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    return {
      minX: minX - margin,
      maxX: maxX + margin,
      minY: minY - margin,
      maxY: maxY + margin,
    };
  }

  private transformContext() {
    const ctx = this.ctx;
    const rotation = this.view.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    // The canvas draws world points as (x, -y), so a counterclockwise world
    // rotation appears as a negative canvas rotation.
    const rotatedCenter = new Vector<2>(
      this.view.center.x * cos - this.view.center.y * sin,
      this.view.center.x * sin + this.view.center.y * cos,
    );
    let translation = new Vector<2>(ctx.width / 2, -ctx.height / 2);
    translation = translation.times(1 / this.view.zoom).minus(rotatedCenter);

    ctx.save();
    ctx.scale(this.view.zoom / CANVAS_SCALE, this.view.zoom / CANVAS_SCALE);
    ctx.translate(translation.x * CANVAS_SCALE, -translation.y * CANVAS_SCALE);
    ctx.rotate(-rotation);
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

    this.drawMetres(() => {
      ctx.lineCap = "butt";
      ctx.lineWidth = Math.max(RINK_MARKING_WIDTH, RINK_MARKING_MIN_WIDTH / this.view.zoom);
      const line = (x0: number, y0: number, x1: number, y1: number) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };
      const goalY = LENGTH / 2 - RINK_GOAL_LINE_OFFSET;
      const blueY = goalY - (LENGTH - 2 * RINK_GOAL_LINE_OFFSET) / 3;

      ctx.strokeStyle = RINK_BLUE_COLOR;
      for (const y of [blueY, -blueY]) {
        line(-WIDTH / 2, y, WIDTH / 2, y);
      }
      ctx.strokeStyle = RINK_RED_COLOR;
      line(-WIDTH / 2, 0, WIDTH / 2, 0);
      const goalHalfWidth = this.zoneLineHalfWidth(goalY);
      for (const y of [goalY, -goalY]) {
        line(-goalHalfWidth, y, goalHalfWidth, y);
      }

      ctx.strokeStyle = RINK_BLUE_COLOR;
      ctx.beginPath();
      ctx.arc(0, 0, RINK_FACEOFF_CIRCLE_RADIUS, 0, 2 * Math.PI);
      ctx.stroke();
      for (const sign of [1, -1]) {
        const start = sign > 0 ? Math.PI : 0;
        ctx.beginPath();
        ctx.arc(0, sign * goalY, RINK_CREASE_RADIUS, start, start + Math.PI);
        ctx.stroke();
      }

      ctx.strokeStyle = RINK_RED_COLOR;
      for (const signX of [1, -1]) {
        for (const signY of [1, -1]) {
          ctx.beginPath();
          ctx.arc(
            signX * RINK_FACEOFF_SPOT_LATERAL,
            signY * (goalY - RINK_FACEOFF_SPOT_LONGITUDINAL),
            RINK_FACEOFF_CIRCLE_RADIUS,
            0,
            2 * Math.PI,
          );
          ctx.stroke();
        }
      }
    });
  }

  // Half width of the rink outline at a given metre y, so end-zone lines stay inside
  // the rounded corners.
  private zoneLineHalfWidth(y: number): number {
    const straight = LENGTH / 2 - CORNER_RADIUS;
    const centerY = WIDTH / 2 - CORNER_RADIUS;
    if (Math.abs(y) <= straight) return WIDTH / 2;
    return centerY + Math.sqrt(CORNER_RADIUS ** 2 - (Math.abs(y) - straight) ** 2);
  }

  private drawPath(sequence: Sequence) {
    if (sequence.path.curves.length == 0) {
      return;
    }
    const hidden = this.hiddenSequences.has(sequence);
    if (hidden) {
      const minTraceWidth = MIN_TRACE_WIDTH / this.view.zoom;
      const minBladeLength =
        this.scaleElements && this.mode !== "elements" ? MIN_BLADE_LENGTH / this.view.zoom : undefined;
      const minMarkSize = MIN_MARK_SIZE / this.view.zoom;
      const minDrawIncrement = MIN_DRAW_INCREMENT / this.view.zoom;
      const viewport = this.getTraceViewport(minBladeLength);
      this.ctx.globalAlpha = HIDDEN_SEQUENCE_ALPHA;
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
          this.sequenceMutated,
        ),
      );
      this.ctx.globalAlpha = 1;
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
    if ((this.mode === "path" || this.mode === "timing" || this.mode === "annotations") && !pathColor) {
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
          this.sequenceMutated,
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
          this.sequenceMutated,
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
          this.sequenceMutated,
        ),
      );
    }
  }

  private sortedTimingKeyframes(sequence: Sequence): TimingKeyframe[] {
    return [...sequence.keyframes.time].sort((a, b) => (a.pathCoordinate as number) - (b.pathCoordinate as number));
  }

  private drawTimingKeyframes() {
    const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;
    for (const sequence of this.editSequences()) {
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

  private collectTimingButtons() {
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom;
    for (const [sequence, provisional] of this.provisionalTimingKeyframes) {
      const geometry = this.getTimingKeyframeGeometry(sequence, provisional);
      if (!geometry) continue;
      this.collectActionButton(
        "timingPlus",
        provisional,
        new PlusButtonLabel(geometry.point.plus(geometry.outside.times(offset)), this.view.zoom, PROVISIONAL_COLOR),
      );
    }
    const selected = this.getSingleSelectedTimingKeyframe();
    if (!selected) return;
    const sequence = this.getSequenceOfTimingKeyframe(selected);
    const geometry = sequence ? this.getTimingKeyframeGeometry(sequence, selected) : null;
    if (!geometry) return;
    this.collectActionButton(
      "timingMinus",
      selected,
      new MinusButtonLabel(geometry.point.plus(geometry.outside.times(offset)), this.view.zoom, BUTTON_RED_COLOR),
    );
    this.collectActionButton(
      "timingCog",
      selected,
      new CogButtonLabel(geometry.point.plus(geometry.outside.times(-offset)), this.view.zoom, BUTTON_GREY_COLOR),
    );
  }

  private getSingleSelectedTimingKeyframe(): TimingKeyframe | null {
    if (this.selectedTimingKeyframes.size !== 1) return null;
    const selected = [...this.selectedTimingKeyframes][0]!;
    return this.isProvisionalTiming(selected) ? null : selected;
  }

  private hitProvisionalTimingPlus(screenX: number, screenY: number): TimingKeyframe | null {
    const button = this.findDrawnActionButton("timingPlus", screenX, screenY);
    return button ? (button.owner as TimingKeyframe) : null;
  }

  private hitTimingCogButton(screenX: number, screenY: number): TimingKeyframe | null {
    const button = this.findDrawnActionButton("timingCog", screenX, screenY);
    return button ? (button.owner as TimingKeyframe) : null;
  }

  private hitTimingMinusButton(screenX: number, screenY: number): TimingKeyframe | null {
    const button = this.findDrawnActionButton("timingMinus", screenX, screenY);
    return button ? (button.owner as TimingKeyframe) : null;
  }

  private getLabelGeometryInside(path: Path, u: PathCoordinate): { point: Vector<2>; outside: Vector<2> } {
    const { point, tangent, curvature } = this.getLabelFrame(path, u);
    // Same frame as getLabelGeometryAt with the flipped sign: inside the curvature.
    const inside = tangent.getOrthogonal().times(curvature > 0 ? 1 : -1);
    return { point, outside: inside };
  }

  private collectTimingTimeLabels() {
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      for (const keyframe of this.sortedTimingKeyframes(sequence)) {
        if (keyframe.kind !== "time") continue;
        const geometry = this.getLabelGeometryInside(sequence.path, keyframe.pathCoordinate);
        this.labelLayer.add(
          new WhitePillLabel(formatTimingLabel(keyframe.value), geometry.point, geometry.outside, this.view.zoom, {
            fontSizePx: LABEL_FONT_SIZE_SMALL,
            rotation: this.view.rotation,
          }),
        );
      }
    }
  }

  private collectTimingBeatLabels() {
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      const sorted = this.sortedTimingKeyframes(sequence);
      for (let index = 1; index < sorted.length; index++) {
        const keyframe = sorted[index];
        if (!keyframe || keyframe.kind !== "beats") continue;
        const previous = sorted[index - 1];
        if (!previous) continue;
        const mid = (((previous.pathCoordinate as number) + keyframe.pathCoordinate) as number) / 2;
        const geometry = this.getLabelGeometryInside(sequence.path, mid as PathCoordinate);
        this.labelLayer.add(
          new WhiteCircleLabel(String(Math.round(keyframe.value)), geometry.point, geometry.outside, this.view.zoom, {
            fontSizePx: LABEL_FONT_SIZE_SMALL,
            rotation: this.view.rotation,
          }),
        );
      }
    }
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
    for (const sequence of this.editSequences()) {
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
    sequence.invalidateTimeCaches();
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
      if (this.hiddenSequences.has(sequence)) continue;
      for (const curveIndex of curveIndices) {
        const curve = sequence.path.curves[curveIndex];
        if (!curve) continue;
        this.drawMetres(() => curve.draw(ctx));
      }
    }
  }

  private drawElements(): boolean {
    const nodeSize = (NODE_SIZE * CANVAS_SCALE) / this.view.zoom;
    let drewElements = false;

    for (const sequence of this.editSequences()) {
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

    return drewElements;
  }

  private drawTimingElements() {
    for (const sequence of this.editSequences()) {
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

  private drawCurvatureWarnings() {
    for (const sequence of this.editSequences()) {
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

  private collectElementLabels(sequence: Sequence) {
    if (sequence.path.curves.length === 0) return;
    for (const element of sequence.elements) {
      if (this.elementNameHidden(sequence, element)) continue;
      const geometry = this.getElementLabelGeometry(sequence, element);
      if (!geometry) continue;
      if (isJumpType(element.type) && this.mode === "view") {
        this.labelLayer.add(
          new PillLabel(element.shortName, geometry.point, null, this.view.zoom, {
            connector: true,
            rotation: this.view.rotation,
          }),
        );
      } else {
        this.labelLayer.add(
          new PillLabel(element.shortName, geometry.point, geometry.outside, this.view.zoom, {
            connector: true,
            rotation: this.view.rotation,
          }),
        );
      }
      if (isStrokeElement(element) && element.crossed) {
        const text = this.crossedLabel(sequence, element);
        if (text) {
          const crossedGeometry = this.getLabelGeometryInside(sequence.path, element.start);
          this.labelLayer.add(
            new PillLabel(text, crossedGeometry.point, crossedGeometry.outside, this.view.zoom, {
              fontSizePx: LABEL_FONT_SIZE_SMALL,
              connector: true,
              rotation: this.view.rotation,
            }),
          );
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

  private collectInflectionLabels() {
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      for (const u of [
        ...this.getUncoveredInflectionCoordinates(sequence),
        ...this.getUncoveredJointEdgeChangeCoordinates(sequence),
      ]) {
        if (this.changeEdgeHidden(sequence, u)) continue;
        const geometry = this.getLabelGeometryAt(sequence.path, u);
        this.labelLayer.add(
          new PillLabel(CHANGE_EDGE_LABEL, geometry.point, geometry.outside, this.view.zoom, {
            fontSizePx: LABEL_FONT_SIZE_SMALL,
            connector: true,
            rotation: this.view.rotation,
          }),
        );
      }
    }
  }

  private collectAnnotationLabels(sequence: Sequence) {
    if (sequence.path.curves.length === 0) return;
    const annotations = [...sequence.annotations];
    const provisional = this.provisionalAnnotations.get(sequence);
    if (provisional) annotations.push(provisional);
    for (const annotation of annotations) {
      const { lo, hi } = this.clampedAnnotationSpan(sequence, annotation);
      if (hi <= lo) continue;
      const geometry = this.getLabelGeometryAt(sequence.path, ((lo + hi) / 2) as PathCoordinate);
      if (!geometry) continue;
      // The title clears the highlight band before the normal label offset.
      const extraOffset = this.getAnnotationLineWidth() / 2 + ANNOTATION_BUTTON_GAP / this.view.zoom;
      // The pill uses the annotation color; the text is always black.
      this.labelLayer.add(
        new PillLabel(annotation.title, geometry.point, geometry.outside, this.view.zoom, {
          rotation: this.view.rotation,
          extraOffset: extraOffset,
          alpha: ANNOTATION_LABEL_ALPHA,
          background: annotation.color,
          textColor: "#000",
          textAlpha: ANNOTATION_LABEL_TEXT_ALPHA,
        }),
      );
    }
  }

  private collectStartLabels() {
    for (const sequence of this.editSequences()) {
      const geometry = this.getStartLabelGeometry(sequence);
      if (!geometry) continue;
      this.labelLayer.add(
        new PillLabel("start", geometry.point, geometry.outside, this.view.zoom, {
          connector: true,
          rotation: this.view.rotation,
        }),
      );
    }
  }

  // Hides when the time lies outside the drawing range.
  private changeEdgeHidden(sequence: Sequence, u: PathCoordinate): boolean {
    if (this.mode !== "view") return false;
    const window = this.traceDrawWindow();
    if (window === null) return false;
    const t = sequence.getTimeFromPathCoordinate(u, this.bpm);
    return t < window[0] || t > window[1];
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

    for (const sequence of this.editSequences()) {
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

    for (const sequence of this.editSequences()) {
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

  private collectActionButton(
    kind: DrawnActionButton["kind"],
    owner: DrawnActionButton["owner"],
    label: ActionButtonLabel,
  ) {
    this.drawnButtons.push({ kind, owner, label });
    this.labelLayer.add(label);
  }

  // Screen position of a drawn button at its collision-resolved label position.
  private drawnButtonScreenPosition(label: ActionButtonLabel): [number, number] {
    const resolved = label.getResolvedCanvasPosition();
    return this.worldToScreen(new Vector<2>(resolved.x / CANVAS_SCALE, -resolved.y / CANVAS_SCALE));
  }

  private findDrawnActionButton(
    kind: DrawnActionButton["kind"],
    screenX: number,
    screenY: number,
  ): DrawnActionButton | null {
    for (const button of this.drawnButtons) {
      if (button.kind !== kind) continue;
      const [iconX, iconY] = this.drawnButtonScreenPosition(button.label);
      if (Math.hypot(screenX - iconX, screenY - iconY) <= ACTION_BUTTON_HIT_RADIUS) return button;
    }
    return null;
  }

  private collectAddButtons() {
    for (const sequence of this.editSequences()) {
      if (sequence.path.curves.length === 0) continue;
      this.collectActionButton(
        "add",
        sequence,
        new PlusButtonLabel(this.getAddButtonPosition(sequence), this.view.zoom, BUTTON_RED_COLOR),
      );
    }
  }

  private hitAddButton(screenX: number, screenY: number): Sequence | null {
    const button = this.findDrawnActionButton("add", screenX, screenY);
    return button ? (button.owner as Sequence) : null;
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

  private collectPathDeleteButtons() {
    for (const sequence of this.editSequences()) {
      const data = this.getDeleteButtonData(sequence);
      if (!data) continue;
      this.collectActionButton(
        "delete",
        { sequence, removable: data.removable },
        new MinusButtonLabel(data.center, this.view.zoom, BUTTON_RED_COLOR),
      );
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

  private midpointNormal(
    sequence: Sequence,
    spanned: { start: PathCoordinate; end: PathCoordinate },
  ): { point: Vector<2>; perp: Vector<2> } | null {
    const path = sequence.path;
    if (path.curves.length === 0) return null;
    const lo = Math.min(spanned.start as number, spanned.end as number);
    const hi = Math.max(spanned.start as number, spanned.end as number);
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

  private collectElementModeButtons() {
    const element = this.getElementDeleteButtonElement();
    if (element) {
      const deleteCenter = this.getElementDeleteButtonPosition();
      if (deleteCenter) {
        this.collectActionButton(
          "elementDelete",
          element,
          new MinusButtonLabel(deleteCenter, this.view.zoom, BUTTON_RED_COLOR),
        );
      }
      const cogCenter = this.getElementCogButtonPosition();
      if (cogCenter) {
        this.collectActionButton(
          "elementCog",
          element,
          new CogButtonLabel(cogCenter, this.view.zoom, BUTTON_GREY_COLOR),
        );
      }
    }
    for (const { sequence, center } of this.getProvisionalPlusButtons()) {
      this.collectActionButton(
        "provisionalPlus",
        sequence,
        new PlusButtonLabel(center, this.view.zoom, PROVISIONAL_COLOR),
      );
    }
  }

  private getElementCogButtonPosition(): Vector<2> | null {
    const geometry = this.getElementActionButtonGeometry();
    if (!geometry) return null;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return geometry.point.plus(geometry.perp.times(-offset));
  }

  private isProvisionalElement(element: Element): boolean {
    for (const provisional of this.provisionalElements.values()) {
      if (provisional === element) return true;
    }
    return false;
  }

  private startProvisionalCreation(sequence: Sequence, u: number) {
    this.placeProvisionalElement(sequence, u);
    this.moveVideoCursorToProvisionalElement(sequence);
    this.isCreatingProvisional = true;
    this.creatingSequence = sequence;
    this.provisionalOriginU = u;
  }

  private moveVideoCursorToProvisionalElement(sequence: Sequence) {
    const element = this.provisionalElements.get(sequence);
    if (element) this.setTimeCursorToElementCenter(element);
  }

  // While a drag grows the provisional span, the cursor follows the dragged
  // end under the mouse instead of the span center.
  private moveVideoCursorToProvisionalElementEdge(sequence: Sequence, u: number) {
    const provisional = this.provisionalElements.get(sequence);
    if (!provisional) return;
    const edge = u > this.provisionalOriginU ? provisional.end : provisional.start;
    this.setTimeCursorToElementCoordinate(provisional, edge);
  }

  private updateProvisionalCreation(cursor: Vector<2>) {
    const sequence = this.creatingSequence;
    if (!sequence || sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(sequence, cursor);
    if (u == null) return;
    const origin = this.provisionalOriginU;
    if (Math.abs(u - origin) < 1e-9) {
      this.placeProvisionalElement(sequence, origin);
      this.moveVideoCursorToProvisionalElement(sequence);
      return;
    }
    this.setProvisionalSpan(sequence, Math.min(origin, u), Math.max(origin, u), origin);
    this.moveVideoCursorToProvisionalElementEdge(sequence, u);
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
    for (const sequence of this.editSequences()) {
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

  private hitProvisionalPlusButton(screenX: number, screenY: number): Sequence | null {
    const button = this.findDrawnActionButton("provisionalPlus", screenX, screenY);
    return button ? (button.owner as Sequence) : null;
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
    return this.findDrawnActionButton("elementCog", screenX, screenY) !== null;
  }

  private hitElementDeleteButton(screenX: number, screenY: number): boolean {
    return this.findDrawnActionButton("elementDelete", screenX, screenY) !== null;
  }

  private hitDeleteButton(
    screenX: number,
    screenY: number,
  ): { sequence: Sequence; removable: NonNullable<ReturnType<Editor["getRemovablePoint"]>> } | null {
    const button = this.findDrawnActionButton("delete", screenX, screenY);
    return button
      ? (button.owner as { sequence: Sequence; removable: NonNullable<ReturnType<Editor["getRemovablePoint"]>> })
      : null;
  }

  private getSplitButtonData(): { sequence: Sequence; curveIndex: number; center: Vector<2> }[] {
    const result: { sequence: Sequence; curveIndex: number; center: Vector<2> }[] = [];
    for (const [sequence, curveIndices] of this.selectedCurves) {
      if (this.hiddenSequences.has(sequence)) continue;
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

  private collectSplitButtons() {
    for (const { sequence, curveIndex, center } of this.getSplitButtonData()) {
      this.collectActionButton(
        "split",
        { sequence, curveIndex },
        new PlusButtonLabel(center, this.view.zoom, BUTTON_RED_COLOR),
      );
    }
  }

  private hitSplitButton(screenX: number, screenY: number): { sequence: Sequence; curveIndex: number } | null {
    const button = this.findDrawnActionButton("split", screenX, screenY);
    return button ? (button.owner as { sequence: Sequence; curveIndex: number }) : null;
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

    for (const sequence of this.editSequences()) {
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

  private pickCurve(screenX: number, screenY: number): { sequence: Sequence; curveIndex: number; u: number } | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;

    let best: { sequence: Sequence; curveIndex: number; distance: number; u: number } | null = null;
    for (const sequence of this.editSequences()) {
      const result = sequence.path.pickCurve(cursor, tolerance);
      if (!result) continue;
      if (!best || result.distance < best.distance) {
        const { t } = result.curve.getClosestPoint(cursor);
        best = {
          sequence,
          curveIndex: result.curveIndex,
          distance: result.distance,
          u: this.uniformCoordinateAt(sequence.path.curves, result.curveIndex, t),
        };
      }
    }
    return best ? { sequence: best.sequence, curveIndex: best.curveIndex, u: best.u } : null;
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
    const cos = Math.cos(this.view.rotation);
    const sin = Math.sin(this.view.rotation);
    const dx = (screenX - this.width / 2) / this.view.zoom;
    const dy = -(screenY - this.height / 2) / this.view.zoom;
    return new Vector<2>(this.view.center.x + dx * cos + dy * sin, this.view.center.y - dx * sin + dy * cos);
  }

  private worldToScreen(world: Vector<2>): [number, number] {
    const cos = Math.cos(this.view.rotation);
    const sin = Math.sin(this.view.rotation);
    const dx = world.x - this.view.center.x;
    const dy = world.y - this.view.center.y;
    return [
      this.width / 2 + (dx * cos - dy * sin) * this.view.zoom,
      this.height / 2 - (dx * sin + dy * cos) * this.view.zoom,
    ];
  }

  // The world-space screen offset, rotated back into world coordinates, that
  // a point at the given screen position is away from the view center.
  private rotatedScreenOffset(screenX: number, screenY: number): Vector<2> {
    const cos = Math.cos(this.view.rotation);
    const sin = Math.sin(this.view.rotation);
    const dx = (screenX - this.width / 2) / this.view.zoom;
    const dy = -(screenY - this.height / 2) / this.view.zoom;
    return new Vector<2>(dx * cos + dy * sin, -dx * sin + dy * cos);
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
    this.autoFitRink = false;
    const [screenX, screenY] = this.screenPosition(event);
    const worldBefore = this.screenToWorld(screenX, screenY);

    this.view.zoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, this.view.zoom * Math.pow(ZOOM_FACTOR, -event.deltaY * WHEEL_SENSITIVITY)),
    );

    this.view.center = worldBefore.minus(this.rotatedScreenOffset(screenX, screenY));

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
      if (this.touchMode === "one") this.handleMouseUp();
      this.pendingTouchPosition = null;
      this.touchMode = "two";
      this.startPinch(event.touches);
      return;
    }
    if (this.touchMode !== "none") return; // leftover finger after a two-finger gesture does nothing
    const touch = event.touches[0];
    if (!touch) return;
    this.touchMode = "one";
    this.pendingTouchPosition = this.touchPosition(touch);
  }

  private handleTouchMove(event: TouchEvent) {
    if (this.touchMode === "two" && event.touches.length >= 2) {
      event.preventDefault();
      this.pendingTouchPosition = null;
      this.pinchZoomAndPan(event.touches);
      return;
    }
    if (this.touchMode === "one" && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      if (this.pendingTouchPosition) {
        this.handlePrimaryDown(...this.pendingTouchPosition, false);
        this.pendingTouchPosition = null;
      }
      this.handleMove(...this.touchPosition(touch));
    }
  }

  private handleTouchEnd(event: TouchEvent) {
    if (this.touchMode === "one" && event.touches.length === 0) {
      const cancelled = event.type === "touchcancel";
      if (!cancelled && this.pendingTouchPosition) {
        this.handlePrimaryDown(...this.pendingTouchPosition, false);
      }
      this.pendingTouchPosition = null;
      this.handleMouseUp();
      this.touchMode = "none";
      return;
    }
    if (this.touchMode === "two" && event.touches.length < 2) {
      this.touchMode = "none";
      this.pendingTouchPosition = null;
      event.preventDefault();
      this.handleMouseUp();
    }
  }

  private touchPosition(touch: Touch): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [touch.clientX - rect.left, touch.clientY - rect.top];
  }

  private startPinch(touches: TouchList) {
    // A fresh pinch resets the pan flag, but a suspended gesture keeps it so
    // the gesture end still cancels rather than reverting the panned view.
    if (!this.trackingSuspended) this.panDidMove = false;
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
    this.autoFitRink = false;
    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * (dist / this.lastPinchDist)));
    // The world point under the previous midpoint stays under the current midpoint.
    this.view.center = worldUnderMid.minus(this.rotatedScreenOffset(midX, midY));
    // Freezing the tracking after the center update keeps the frozen state
    // from reverting the panned center; the gesture end cancels it.
    this.panDidMove = true;
    this.suspendTracking();

    this.lastPinchDist = dist;
    this.lastPinchMidX = midX;
    this.lastPinchMidY = midY;
    this.requestDraw();
  }

  private handleSecondaryDown(screenX: number, screenY: number) {
    this.isPanning = true;
    this.panDidMove = false;
    this.lastPanX = screenX;
    this.lastPanY = screenY;
    this.suspendTracking();
  }

  // A pointerdown must hit-test the drawn state, so a scheduled frame paints first.
  private flushScheduledDraw() {
    if (!this.drawScheduled) return;
    if (this.drawFrameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.drawFrameHandle);
    }
    this.drawScheduled = false;
    this.drawFrameHandle = null;
    this.draw();
  }

  private handlePrimaryDown(screenX: number, screenY: number, ctrlKey: boolean) {
    this.flushScheduledDraw();
    // Panning is the only interaction below the time cursor, so in view mode
    // the circle keeps priority.
    if (this.mode === "view") {
      const grabbed = this.hitVideoCursor(screenX, screenY);
      if (grabbed) {
        this.isDraggingVideoCursor = true;
        this.dragVideoSequence = grabbed;
        this.onTimeScrubStart?.();
        this.suspendTracking();
        return;
      }
      const nearPath = this.hitNearPath(screenX, screenY);
      if (nearPath) {
        // Clicking near the path scrubs the time cursor, so the drag starts at once.
        this.isDraggingVideoCursor = true;
        this.dragVideoSequence = nearPath;
        this.onTimeScrubStart?.();
        this.suspendTracking();
        this.dragVideoCursor(screenX, screenY);
        return;
      }
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
          if (owner) this.setTimeCursorToTimingKeyframe(owner, dot);
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
      const grabbedTiming = this.hitVideoCursor(screenX, screenY);
      if (grabbedTiming) {
        this.isDraggingVideoCursor = true;
        this.dragVideoSequence = grabbedTiming;
        this.onTimeScrubStart?.();
        return;
      }
      this.startSelectionRectangle("timing", ctrlKey, screenX, screenY);
      if (!ctrlKey) this.selectedTimingKeyframes.clear();
      this.draw();
      return;
    }

    if (this.mode === "annotations") {
      const plusHit = this.hitProvisionalAnnotationPlus(screenX, screenY);
      if (plusHit) {
        this.onAnnotationChangeRequest?.(plusHit);
        return;
      }
      if (this.hitAnnotationCogButton(screenX, screenY) && this.onAnnotationChangeRequest) {
        const annotation = this.getAnnotationActionButtonAnnotation();
        if (annotation) this.onAnnotationChangeRequest(annotation);
        return;
      }
      if (this.hitAnnotationDeleteButton(screenX, screenY)) {
        const annotation = this.getAnnotationActionButtonAnnotation();
        if (annotation) {
          const sequence = this.getSequenceOfAnnotation(annotation);
          if (sequence) sequence.removeAnnotation(annotation);
          this.selectedAnnotations.delete(annotation);
          this.notifySequenceChange();
          this.draw();
        }
        return;
      }
      const annotation = this.pickAnnotation(screenX, screenY);
      if (annotation) {
        const isProvisional = this.isProvisionalAnnotation(annotation);
        if (!isProvisional) {
          const owner = this.getSequenceOfAnnotation(annotation);
          if (owner) this.provisionalAnnotations.delete(owner);
          this.selectAnnotation(annotation, ctrlKey);
        }
        this.setTimeCursorToAnnotationCenter(annotation);
        const pointHit = this.pickAnnotationControlPoint(screenX, screenY);
        if (pointHit?.annotation === annotation) {
          this.isDraggingAnnotationPoint = true;
          this.dragAnnotation = annotation;
          this.dragAnnotationPointIsStart = pointHit.isStart;
          // The handles sit on the clamped span, so a reversed annotation from a
          // loaded file still moves the cursor to the grabbed end.
          const sequence = this.getSequenceOfAnnotation(annotation);
          const { lo, hi } = sequence
            ? this.clampedAnnotationSpan(sequence, annotation)
            : { lo: annotation.start as number, hi: annotation.end as number };
          this.setTimeCursorToAnnotationCoordinate(annotation, (pointHit.isStart ? lo : hi) as PathCoordinate);
        } else {
          this.startAnnotationSegmentDrag(annotation, screenX, screenY);
        }
      } else {
        const pathHit = this.pickPathCoordinate(screenX, screenY);
        if (pathHit) {
          this.startProvisionalAnnotationCreation(pathHit.sequence, pathHit.u);
        } else {
          const grabbedAnnotation = this.hitVideoCursor(screenX, screenY);
          if (grabbedAnnotation) {
            this.isDraggingVideoCursor = true;
            this.dragVideoSequence = grabbedAnnotation;
            this.onTimeScrubStart?.();
            return;
          }
          this.startSelectionRectangle("annotations", ctrlKey, screenX, screenY);
        }
        this.draw();
        return;
      }
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
        this.setTimeCursorToElementCenter(element);
        const pointHit = this.pickElementControlPoint(screenX, screenY);
        if (pointHit?.element === element) {
          this.isDraggingElementPoint = true;
          this.dragElement = element;
          this.dragElementPointIsStart = pointHit.isStart;
          const [displayedStart, displayedEnd] = this.getDisplayedSpan(this.getSequenceOfElement(element)!, element);
          this.setTimeCursorToElementCoordinate(element, pointHit.isStart ? displayedStart : displayedEnd);
        } else {
          this.startElementSegmentDrag(element, screenX, screenY);
        }
      } else {
        const pathHit = this.pickPathCoordinate(screenX, screenY);
        if (pathHit) {
          this.startProvisionalCreation(pathHit.sequence, pathHit.u);
        } else {
          const grabbedElement = this.hitVideoCursor(screenX, screenY);
          if (grabbedElement) {
            this.isDraggingVideoCursor = true;
            this.dragVideoSequence = grabbedElement;
            this.onTimeScrubStart?.();
            return;
          }
          this.startSelectionRectangle("elements", ctrlKey, screenX, screenY);
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

      // The p1 and p2 handles sit off the curve, so their clicks keep the time cursor at a fixed time.
      if (picked.pointKey === "p0" || picked.pointKey === "p3") {
        const curve = sequence.path.curves[picked.curveIndex];
        if (curve) {
          const u = this.uniformCoordinateAt(sequence.path.curves, picked.curveIndex, picked.pointKey === "p0" ? 0 : 1);
          this.moveVideoCursorToPathCoordinate(sequence, u);
        }
      }

      // Deselecting with ctrl does not start a drag. A plain click on a point ends
      // with that point selected (fresh or kept), so the drag starts at once.
      if (this.selectedPoints.get(sequence)?.has(key) ?? false) {
        this.isDraggingPoint = true;
        this.dragSequence = sequence;
        this.dragOrigin = sequence.path.curves[picked.curveIndex]?.[picked.pointKey].copy() ?? null;
        this.lastDragDelta = new Vector<2>(0, 0);
        this.makeMoveSnapshots(this.sequences.filter((s) => (this.selectedPoints.get(s)?.size ?? 0) > 0));
      }
    } else {
      const curveHit = this.pickCurve(screenX, screenY);
      if (curveHit) {
        const sequence = curveHit.sequence;
        this.handleCurveSelection(sequence, curveHit.curveIndex, ctrlKey);
        this.moveVideoCursorToPathCoordinate(sequence, curveHit.u);
        if (this.selectedCurves.get(sequence)?.has(curveHit.curveIndex)) {
          this.isDraggingCurve = true;
          this.dragSequence = sequence;
          this.dragOrigin = this.screenToWorld(screenX, screenY);
          this.lastDragDelta = new Vector<2>(0, 0);
          this.makeMoveSnapshots(this.sequences.filter((s) => (this.selectedCurves.get(s)?.size ?? 0) > 0));
        }
      } else {
        const grabbedPath = this.hitVideoCursor(screenX, screenY);
        if (grabbedPath) {
          this.isDraggingVideoCursor = true;
          this.dragVideoSequence = grabbedPath;
          this.onTimeScrubStart?.();
          return;
        }
        this.startSelectionRectangle("points", ctrlKey, screenX, screenY);
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
    if (this.isDraggingVideoCursor) {
      this.dragVideoCursor(screenX, screenY);
      this.requestDraw();
      return;
    }

    if (this.isPanning) {
      const deltaX = screenX - this.lastPanX;
      const deltaY = screenY - this.lastPanY;
      this.lastPanX = screenX;
      this.lastPanY = screenY;

      // The screen delta rotates back into world axes, so the dragged world
      // point follows the cursor during a rotation restore.
      const cos = Math.cos(this.view.rotation);
      const sin = Math.sin(this.view.rotation);
      this.view.center = this.view.center.plus(
        new Vector<2>((-deltaX * cos + deltaY * sin) / this.view.zoom, (deltaX * sin + deltaY * cos) / this.view.zoom),
      );
      this.panDidMove = true;
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

    if (this.isCreatingProvisionalAnnotation) {
      this.updateProvisionalAnnotationCreation(this.screenToWorld(screenX, screenY));
      return;
    }

    if (this.isDraggingAnnotationPoint && this.dragAnnotation) {
      const world = this.screenToWorld(screenX, screenY);
      const u = this.snapAnnotationPointToPath(this.dragAnnotation, this.dragAnnotationPointIsStart, world);
      if (u != null) {
        if (this.dragAnnotationPointIsStart) this.dragAnnotation.start = u;
        else this.dragAnnotation.end = u;
        this.sequenceMutated = true;
        this.setTimeCursorToAnnotationCoordinate(this.dragAnnotation, u);
      }
      this.requestDraw();
      return;
    }

    if (this.isDraggingAnnotationSegment) {
      const dragSequence = this.dragAnnotation ? this.getSequenceOfAnnotation(this.dragAnnotation) : null;
      if (!dragSequence) return;
      const world = this.screenToWorld(screenX, screenY);
      const currentGrab = this.snapCursorToPathAnywhere(dragSequence, world);
      if (currentGrab != null) {
        const delta =
          (currentGrab as number) >= this.annotationSegmentGrabU
            ? dragSequence.path.arcLengthBetween(
                this.annotationSegmentGrabU as PathCoordinate,
                currentGrab as PathCoordinate,
              )
            : -dragSequence.path.arcLengthBetween(
                currentGrab as PathCoordinate,
                this.annotationSegmentGrabU as PathCoordinate,
              );
        const clamped = Math.min(Math.max(delta, this.annotationSegmentDeltaMin), this.annotationSegmentDeltaMax);
        for (const item of this.annotationSegmentItems) {
          const sequence = this.getSequenceOfAnnotation(item.annotation);
          if (!sequence) continue;
          item.annotation.start = sequence.path.moveAlongByArcLength(item.start0 as PathCoordinate, clamped);
          item.annotation.end = sequence.path.moveAlongByArcLength(item.end0 as PathCoordinate, clamped);
        }
        this.sequenceMutated = true;
        if (this.dragAnnotation) this.setTimeCursorToAnnotationCenter(this.dragAnnotation);
      }
      this.requestDraw();
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
        this.getSequenceOfElement(this.dragElement)?.invalidateTraceCaches();
        this.sequenceMutated = true;
        this.setTimeCursorToElementCoordinate(this.dragElement, u);
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
          sequence.invalidateTraceCaches();
        }
        this.sequenceMutated = true;
        if (this.dragElement) this.setTimeCursorToElementCenter(this.dragElement);
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
          item.sequence.invalidateTimeCaches();
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
        // Move the points selected on the other sequences by the same movement so a
        // selection across sequences keeps moving together.
        for (const [other, keys] of this.selectedPoints) {
          if (other === sequence || keys.size === 0) continue;
          this.translateGroupOf(other, keys, delta);
        }
        this.remapElementsAfterDragMove();
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
    this.remapElementsAfterDragMove();
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
    sequence.invalidateTraceCaches();
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
      sequence.invalidateTraceCaches();
    }
    this.remapElementsAfterDragMove();
    this.sequenceMutated = true;
    this.requestDraw();
  }

  // Every rectangle gesture resets the target flags: stale flags from a previous
  // gesture would dispatch the finish to the wrong selection type.
  private startSelectionRectangle(
    target: "timing" | "annotations" | "elements" | "points",
    ctrlKey: boolean,
    screenX: number,
    screenY: number,
  ) {
    this.isSelectingRect = true;
    this.rectDidMove = false;
    this.rectTargetsTiming = target === "timing";
    this.rectTargetsAnnotations = target === "annotations";
    this.rectTargetsElements = target === "elements";
    this.rectAddToSelection = ctrlKey;
    this.rectStartX = screenX;
    this.rectStartY = screenY;
    this.rectEndX = screenX;
    this.rectEndY = screenY;
  }

  private finishSelectionRectangle() {
    if (this.rectTargetsTiming) {
      this.finishTimingSelectionRectangle();
      return;
    }
    if (this.rectTargetsAnnotations) {
      this.finishAnnotationSelectionRectangle();
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
    for (const sequence of this.editSequences()) {
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
    for (const sequence of this.editSequences()) {
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

  private finishAnnotationSelectionRectangle() {
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const hits = new Set<Annotation>();
    if (this.rectAddToSelection) {
      for (const annotation of this.selectedAnnotations) hits.add(annotation);
    }
    for (const sequence of this.editSequences()) {
      for (const annotation of this.selectableAnnotations(sequence)) {
        const inside = this.getAnnotationPoints(sequence, annotation).some((point) => {
          const [screenX, screenY] = this.worldToScreen(point);
          return screenX >= x0 && screenX <= x1 && screenY >= y0 && screenY <= y1;
        });
        if (inside) hits.add(annotation);
      }
    }
    this.selectedAnnotations = hits;
    this.selectedPoints.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.selectedTimingKeyframes.clear();
    this.provisionalElements.clear();
  }

  private finishElementSelectionRectangle() {
    const x0 = Math.min(this.rectStartX, this.rectEndX);
    const x1 = Math.max(this.rectStartX, this.rectEndX);
    const y0 = Math.min(this.rectStartY, this.rectEndY);
    const y1 = Math.max(this.rectStartY, this.rectEndY);

    const hits = new Set<Element>();
    if (this.rectAddToSelection) for (const element of this.selectedElements) hits.add(element);
    for (const sequence of this.editSequences()) {
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
    for (const sequence of this.editSequences()) {
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

  private makeItemsAndKeyframes(sequence: Sequence): Pick<MoveSnapshot, "items" | "timingKeyframes" | "annotations"> {
    const items: Array<{ element: Element; start: number; end: number }> = [];
    for (const element of this.selectableElements(sequence)) {
      items.push({ element, start: element.start as number, end: element.end as number });
    }
    const timingKeyframes: Array<{ keyframe: TimingKeyframe; u0: number }> = [];
    for (const keyframe of this.ownedTimingKeyframes(sequence)) {
      timingKeyframes.push({ keyframe, u0: keyframe.pathCoordinate as number });
    }
    const annotations: Array<{ annotation: Annotation; start: number; end: number }> = [];
    for (const annotation of this.ownedAnnotations(sequence)) {
      annotations.push({ annotation, start: annotation.start as number, end: annotation.end as number });
    }
    return { items, timingKeyframes, annotations };
  }

  private makeMoveSnapshots(sequences: Iterable<Sequence>) {
    for (const sequence of sequences) {
      if (!this.dragSnapshots.has(sequence)) {
        const { curveStarts, curveLengths } = this.axisTables(sequence);
        this.dragSnapshots.set(sequence, {
          sequence,
          curveStarts,
          curveLengths,
          ...this.makeItemsAndKeyframes(sequence),
        });
      }
    }
  }

  private remapElementsAfterDragMove() {
    for (const snapshot of this.dragSnapshots.values()) {
      this.remapElementsOfSnapshot(snapshot);
    }
  }

  private remapElementsOfSnapshot(snapshot: MoveSnapshot) {
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
    for (const sequence of this.sequences) sequence.invalidateTimeCaches();

    for (const item of snapshot.annotations) {
      item.annotation.start = remapUniformAtJoint(
        item.start,
        snapshot.curveStarts,
        snapshot.curveLengths,
        newCurveStarts,
        newCurveLengths,
      ) as PathCoordinate;
      item.annotation.end = remapUniformAtJoint(
        item.end,
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
    return { sequence, jointOldIndex, curveStarts, curveLengths, ...this.makeItemsAndKeyframes(sequence) };
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
    for (const sequence of this.sequences) sequence.invalidateTimeCaches();

    for (const item of snapshot.annotations) {
      item.annotation.start = remapUniformAtRemoval(
        item.start,
        snapshot.curveStarts,
        snapshot.curveLengths,
        curveStarts,
        curveLengths,
        snapshot.jointOldIndex,
        2,
      ) as PathCoordinate;
      item.annotation.end = remapUniformAtRemoval(
        item.end,
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
      } else if (!this.rectAddToSelection) {
        // A ctrl-click without movement only adds to the selection: it never clears.
        if (this.rectTargetsElements) {
          this.provisionalElements.clear();
          this.selectedElements.clear();
        } else if (this.rectTargetsTiming) {
          this.provisionalTimingKeyframes.clear();
          this.selectedTimingKeyframes.clear();
        } else if (this.rectTargetsAnnotations) {
          this.provisionalAnnotations.clear();
          this.selectedAnnotations.clear();
        }
      }
      this.isSelectingRect = false;
    }
    this.isPanning = false;
    this.isDraggingPoint = false;
    this.isDraggingCurve = false;
    const wasScrubbing = this.isDraggingVideoCursor;
    this.isDraggingVideoCursor = false;
    this.dragVideoSequence = null;
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
    this.isDraggingAnnotationPoint = false;
    this.isDraggingAnnotationSegment = false;
    this.isCreatingProvisionalAnnotation = false;
    this.annotationCreatingSequence = null;
    this.dragAnnotation = null;
    this.annotationSegmentItems = [];
    this.dragSnapshots.clear();
    this.dragElement = null;
    this.dragSequence = null;
    this.dragOrigin = null;
    this.lastDragDelta = new Vector<2>(0, 0);
    if (this.trackingSuspended) {
      if (wasScrubbing || !this.panDidMove) this.resumeTracking();
      else this.disableTracking();
    }
    this.panDidMove = false;
    if (wasScrubbing) this.onTimeScrubEnd?.();
    if (this.sequenceMutated) {
      this.sequenceMutated = false;
      this.notifySequenceChange();
      this.draw();
    } else {
      this.draw();
    }
  }

  private fitRink() {
    // The pane hides the top of the canvas, so the rink fits and centers in the
    // visible band below it. The clamp mirrors the wheel and pinch paths: a
    // band near zero height (a near full-height pane or canvas) must not
    // produce a singular zero zoom.
    const top = Math.max(0, this.occludedTop());
    this.view.zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        (this.canvas.clientWidth - 2 * INITIAL_EDGE_MARGIN) / WIDTH,
        (this.canvas.clientHeight - top - 2 * INITIAL_EDGE_MARGIN) / LENGTH,
      ),
    );
    // The canvas flips world y, so a larger center.y draws the origin lower on
    // screen: shift by half the occluded height to center in the visible band.
    this.view.center = new Vector<2>(0, top / (2 * this.view.zoom));
  }

  private resize() {
    this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.ctx.width = this.canvas.clientWidth;
    this.ctx.height = this.canvas.clientHeight;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    if (this.autoFitRink) {
      this.fitRink();
    }
    this.draw();
  }

  // Re-run the auto fit after a layout change, for example when the pane above
  // the canvas grows with its content. Blocked once the user zoomed manually.
  refit() {
    if (!this.autoFitRink) return;
    this.fitRink();
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
