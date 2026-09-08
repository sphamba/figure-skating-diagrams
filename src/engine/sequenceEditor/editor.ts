import type { Curvilinear, Curve } from "../curve.js";
import type { PathCoordinate } from "../coordinates.js";
import type { Element } from "../element.js";
import { LENGTH, WIDTH, CORNER_RADIUS } from "../rink.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { createDefaultFootTurn } from "../turn.js";
import { Sequence } from "../sequence.js";
import { Vector } from "../vector.js";

/** One of the four cubic Bezier control points of a Curve. */
export type ControlPointKey = "p0" | "p1" | "p2" | "p3";

const RINK_COLOR = "#ccc";
const PATH_WIDTH = 1; // px
/** Path color in "elements" mode: translucent grey so the path stays visible but de-emphasized. */
const ELEMENTS_PATH_COLOR = "rgba(128, 128, 128, 0.35)";
/** Path-coordinate step used to trace an element along the path. */
const ELEMENT_DRAW_INCREMENT = 0.02;
const NODE_SIZE = 10; // px
const POLYGON_ALPHA = 0.25;
const PICK_RADIUS = 8; // px
const ADD_BUTTON_OFFSET = 20; // px (screen distance from the path end to the button center)
const ADD_BUTTON_RADIUS = 7; // px (circle radius)
const ADD_BUTTON_LINE_WIDTH = 1.5; // px
const ADD_PLUS_LENGTH = 7; // px (total length of each "+" arm)
const ADD_BUTTON_HIT_RADIUS = 14; // px
const ADD_BUTTON_COLOR = "#d33";
const DELETE_BUTTON_OFFSET = 20; // px (screen distance from the selected joint to the button center)
const DELETE_BUTTON_RADIUS = 7; // px (circle radius)
const DELETE_BUTTON_LINE_WIDTH = 1.5; // px
const DELETE_MINUS_LENGTH = 7; // px (total length of the "-" bar)
const DELETE_BUTTON_HIT_RADIUS = 14; // px
const DELETE_BUTTON_COLOR = "#d33";
/** The "change kind" cog button sits on the side opposite the delete button, with the same geometry. */
const COG_BUTTON_COLOR = "#444";
const COG_LINE_WIDTH = 3.5; // px (thick circle and teeth, thicker than the short teeth are long)
const COG_TEETH_COUNT = 8;
/** Color of the provisional (not yet added) element and its "+" button. */
const PROVISIONAL_COLOR = "#1976d2";
/** Total path length of a newly placed provisional element, in metres. */
const PROVISIONAL_TOTAL_LENGTH = 0.8;
const SPLIT_BUTTON_OFFSET = 14; // px (screen distance from the curve midpoint to the button center)
const SELECTION_RECT_FILL = "rgba(100, 149, 237, 0.2)"; // gentle blue fill
const SELECTION_RECT_STROKE = "rgba(100, 149, 237, 0.9)";
const ZOOM_FACTOR = 1.005;
const MIN_ZOOM = 2;
const MAX_ZOOM = 5000;

type ViewState = {
  center: Vector<2>;
  zoom: number; // pixel per meter
};

/** The active editing tool set. Navigation works in every mode. */
export type EditMode = "path" | "elements";

type ControlPointSelection = {
  curveIndex: number;
  pointKey: ControlPointKey;
};

/**
 * Interactive canvas editor for a single Sequence.
 *
 * Only the path is editable for now: control points can be selected (single
 * click, ctrl + click to add/remove, ctrl + a for all, or via a drag selection
 * rectangle on empty space) and dragged with the left button, the canvas can
 * be panned with a right button drag, and zoomed with the mouse wheel.
 */
export class Editor {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2DSized;
  /** Logical canvas size, in CSS pixels. */
  width = 0;
  height = 0;

  sequence: Sequence;
  /** Current editing mode. "elements" disables path editing for now. */
  mode: EditMode = "path";
  private view: ViewState;
  /** Extra sequences drawn for their paths/traces but not editable. */
  private overlaySequences: Sequence[] = [];

  private selected = new Set<string>();
  /**
   * Called when the user clicks the "change kind" (cog) button on the single
   * selected element. The host UI is expected to show a picker for the
   * element's kind and then replace the element via the sequence.
   */
  onElementChangeRequest?: (element: Element) => void;
  /** Indices of the curves currently selected (by clicking on their line). */
  private selectedCurves = new Set<number>();
  /** Elements currently selected (path-elements mode only). */
  private selectedElements = new Set<Element>();
  private isPanning = false;
  private isDraggingPoint = false;
  private isDraggingCurve = false;
  private isSelectingRect = false;
  /** Element drawn but not yet added to the sequence (elements mode only). */
  private provisionalElement: Element | null = null;
  /** Set while the provisional element is being created by a click and drag. */
  private isCreatingProvisional = false;
  /** Path coordinate where the provisional element creation started. */
  private provisionalOriginU = 0;
  /** Set while dragging an element's control point along the path (elements mode). */
  private isDraggingElementPoint = false;
  /** Element whose control point is being dragged, and whether it is the start point. */
  private dragElement: Element | null = null;
  private dragElementPointIsStart = false;
  /** Set while moving an element by dragging its segment (elements mode). */
  private isDraggingElementSegment = false;
  /**
   * Real (geometric) arc lengths, in metres, from the invisible grabbed point
   * on the path to the element's start and end control points. These are fixed
   * when the drag starts so the element's real length and the grabbed point's
   * relative position are conserved while dragging.
   */
  private dragStartDistance = 0;
  private dragEndDistance = 0;
  /** Curve used as the anchor (current + neighbors) for the segment drag. */
  private dragAnchorCurveIndex = 0;
  private rectAddToSelection = false;
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

    // Keep the backing store in sync whenever the canvas element resizes
    // (e.g. when the layout changes or the sidebar splitter is dragged).
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

  /** Remove all event listeners. Call when the editor is no longer used. */
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
    this.selected.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElement = null;
    this.draw();
  }

  /** Deselect every selected curve, control point, and element. */
  clearSelection() {
    this.selected.clear();
    this.selectedCurves.clear();
    this.selectedElements.clear();
    this.provisionalElement = null;
  }

  /**
   * Swap a selected element reference for its replacement, so the new element
   * stays selected after an in-place kind change. The sequence must already
   * hold the new element.
   */
  replaceSelectedElement(oldElement: Element, newElement: Element) {
    if (this.selectedElements.delete(oldElement)) {
      this.selectedElements.add(newElement);
    }
  }

  /** Draw an extra sequence (path + foot traces) without making it editable. */
  addOverlaySequence(sequence: Sequence) {
    this.overlaySequences.push(sequence);
    this.draw();
  }

  getSequence(): Sequence {
    return this.sequence;
  }

  /** Append a 1 m straight curve at the end of the path. */
  addSegmentEnd() {
    this.sequence.path.addCurveEnd();
    this.draw();
  }

  // Drawing /////////////////////////////////////////////////////////////////

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.transformContext();
    this.drawRink();
    this.drawPath();
    for (const sequence of this.overlaySequences) {
      this.drawPath(sequence);
    }
    this.drawSelectedCurves();
    // Path-editing controls (control points, add/split/delete buttons,
    // selection rectangle) are only meaningful while editing the path.
    // In "elements" mode they are hidden, and selection is empty.
    if (this.mode !== "elements") {
      this.drawControlHandles();
      this.drawAddButton();
      this.drawSplitButtons();
      this.drawDeleteButton();
    } else {
      this.drawElements();
    }
    ctx.restore();
    if (this.mode !== "elements") {
      this.drawSelectionRectangle();
    }
  }

  private transformContext() {
    const ctx = this.ctx;
    let translation = new Vector<2>(ctx.width / 2, -ctx.height / 2);
    translation = translation.times(1 / this.view.zoom).minus(this.view.center);

    ctx.save();
    ctx.scale(this.view.zoom, this.view.zoom);
    ctx.translate(translation.x, -translation.y);
  }

  private drawRink() {
    const ctx = this.ctx;
    // Draw inset rectangle with thick border to have corner radius
    const width = WIDTH - 2 * CORNER_RADIUS;
    const height = LENGTH - 2 * CORNER_RADIUS;

    ctx.lineWidth = 2 * CORNER_RADIUS;
    ctx.lineJoin = "round";
    ctx.fillStyle = RINK_COLOR;
    ctx.strokeStyle = RINK_COLOR;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeRect(-width / 2, -height / 2, width, height);
  }

  private drawPath(sequence: Sequence = this.sequence) {
    if (sequence.path.curves.length == 0) {
      return;
    }
    const pathWidth = PATH_WIDTH / this.view.zoom;
    // Draw the path and the foot traces (same as the home page).
    // In "elements" mode the path is de-emphasized in translucent grey.
    const pathColor = this.mode === "elements" ? ELEMENTS_PATH_COLOR : undefined;
    sequence.draw(this.ctx, pathWidth, 0 as PathCoordinate, undefined, pathColor);
  }

  /** Draw the selected curves on top of the path, in a highlight color. */
  private drawSelectedCurves() {
    if (this.selectedCurves.size == 0) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "#d33";
    ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const curveIndex of this.selectedCurves) {
      const curve = this.sequence.path.curves[curveIndex];
      if (curve) curve.draw(ctx);
    }
  }

  /**
   * Draw the elements as black lines that follow the path, with a control
   * point at each end. Each element spans a start and an end path coordinate,
   * so its line is traced along the path between those two points, similar
   * to how a curve is shown in path mode. Selected elements are highlighted.
   */
  private drawElements() {
    if (this.sequence.path.curves.length === 0) {
      return;
    }
    if (this.sequence.elements.length === 0 && !this.provisionalElement) {
      return;
    }
    const ctx = this.ctx;
    const nodeSize = NODE_SIZE / this.view.zoom;

    for (const element of this.sequence.elements) {
      const selected = this.selectedElements.has(element);

      // Black line that follows the path from start to end. Drawn as the
      // native canvas Bezier sub-curves of the underlying path, never as a
      // sampled polyline.
      ctx.strokeStyle = selected ? "#d33" : "#000";
      ctx.lineWidth = (selected ? PATH_WIDTH + 2 : PATH_WIDTH) / this.view.zoom;
      this.drawElementSpan(element);

      // Control point at each end (exact path positions, not sampled).
      ctx.fillStyle = selected ? "#d33" : "#444";
      for (const u of [
        Math.min(element.start as number, element.end as number),
        Math.max(element.start as number, element.end as number),
      ]) {
        const point = this.sequence.path.getPosition(u as PathCoordinate);
        ctx.beginPath();
        ctx.arc(point.x, -point.y, nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // The provisional element is drawn in its own color to show the
    // difference: it is an edit preview, not part of the sequence yet.
    if (this.provisionalElement) {
      const element = this.provisionalElement;
      const lo = Math.min(element.start as number, element.end as number);
      const hi = Math.max(element.start as number, element.end as number);

      ctx.strokeStyle = PROVISIONAL_COLOR;
      ctx.lineWidth = (PATH_WIDTH + 2) / this.view.zoom;
      this.drawElementSpan(element);

      ctx.fillStyle = PROVISIONAL_COLOR;
      for (const u of [lo, hi]) {
        const point = this.sequence.path.getPosition(u as PathCoordinate);
        ctx.beginPath();
        ctx.arc(point.x, -point.y, nodeSize / 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Action buttons for the selected element, on top of the elements.
    this.drawElementDeleteButton();
    this.drawElementCogButton();
    // The "+" button of the provisional element, where the cog would be.
    this.drawProvisionalAddButton();
  }

  /** Trace an element's span along the path, as native Bezier sub-curves. */
  private drawElementSpan(element: Element) {
    const start = Math.min(element.start as number, element.end as number);
    const end = Math.max(element.start as number, element.end as number);
    this.sequence.path.drawRange(this.ctx, start as PathCoordinate, end as PathCoordinate);
  }

  /** Sampled world-space points along the path covered by an element. */
  private getElementPoints(element: Element): Vector<2>[] {
    const path = this.sequence.path;
    const points: Vector<2>[] = [];
    for (let u = element.start as number; u <= (element.end as number); u += ELEMENT_DRAW_INCREMENT) {
      points.push(path.getPosition(u as PathCoordinate));
    }
    return points;
  }

  /** Select an element, toggling it with ctrl, or selecting only it on a plain click. */
  private selectElement(element: Element, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedElements.has(element)) this.selectedElements.delete(element);
      else this.selectedElements.add(element);
    } else if (!this.selectedElements.has(element)) {
      this.selectedElements = new Set([element]);
    }
  }

  /**
   * Endpoint control point under the cursor, or null when the click is too far
   * from every element start/end point. Used to start dragging an element point.
   */
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
      // The end point is visited after the start point. Using <= (instead of
      // <) means that, when both ends are at the same spot (e.g. an element
      // whose start and end coincide on screen), the END point wins the
      // tie-break and gets priority to be dragged.
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

  /**
   * Snap the dragged control point of an element to the point on the path
   * closest to the given world cursor. To avoid big jumps, only the curve the
   * point currently lies on and its direct neighbors are considered.
   *
   * @returns The new path coordinate, or null when it cannot be computed.
   */
  private snapElementPointToPath(element: Element, isStart: boolean, cursor: Vector<2>): PathCoordinate | null {
    const path = this.sequence.path;
    const curves = path.curves;
    if (curves.length === 0) return null;

    // Curve the endpoint currently lies on.
    const currentU = (isStart ? element.start : element.end) as number;
    const anchorIndex = this.curveIndexAt(curves, currentU);
    const u = this.snapCursorToPathNearCurve(anchorIndex, cursor);
    if (u == null) return null;

    let clamped = Math.max(0, Math.min(path.length, u));
    // Keep a valid, non-inverted span: the dragged point must not cross the
    // opposite endpoint (start <= end).
    const other = (isStart ? element.end : element.start) as number;
    clamped = isStart ? Math.min(clamped, other) : Math.max(clamped, other);
    return clamped as PathCoordinate;
  }

  /**
   * Point on the path closest to the cursor, considering only the given anchor
   * curve and its direct neighbors. This avoids big jumps while dragging.
   *
   * @returns The uniform path coordinate, or null if the path is empty.
   */
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

  /**
   * Point on the path closest to the cursor, considering every curve. Used
   * when a first anchor point does not exist yet, e.g. while creating a
   * provisional element with a click and drag.
   *
   * @returns The uniform path coordinate, or null if the path is empty.
   */
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

  /**
   * Begin moving an element by dragging its segment. Records the real
   * (geometric) arc lengths along the path between the invisible grabbed point
   * (the path point closest to the cursor, clamped into the element's span) and
   * the element's two control points.
   *
   * These real lengths, not the approximate path-coordinate span, are what must
   * stay fixed. The path coordinate is only a coarse lookup-table approximation
   * of arc length, so conserving the path-coordinate span lets an element's
   * drawn length drift when it is dragged across a curve whose speed varies.
   */
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
    // The grabbed point lies on the element, so clamp it into its span. This
    // keeps both real lengths non-negative (the grabbed point never falls
    // outside the element) so its real length is exactly conserved.
    const lo = Math.min(startU, endU);
    const hi = Math.max(startU, endU);
    const clampedGrab = Math.min(Math.max(grabbedU as number, lo), hi);

    this.isDraggingElementSegment = true;
    this.dragElement = element;
    // Real (geometric) arc lengths from the grabbed point to each control point.
    this.dragStartDistance = path.arcLengthBetween(lo as PathCoordinate, clampedGrab as PathCoordinate);
    this.dragEndDistance = path.arcLengthBetween(clampedGrab as PathCoordinate, hi as PathCoordinate);
    this.dragAnchorCurveIndex = anchorIndex;
  }

  /** Index of the curve containing the given path coordinate (clamped). */
  private curveIndexAt(curves: Curve[], u: number): number {
    if (curves.length === 0) return 0;
    if (u <= 0) return 0;
    if (u >= this.sequence.path.length) return curves.length - 1;
    const [curve] = this.sequence.path.getCurveAndCurvilinearCoord(u as PathCoordinate);
    const index = curves.indexOf(curve);
    return index >= 0 ? index : 0;
  }

  /**
   * Uniform path coordinate for a curvilinear parameter on a given curve, i.e.
   * the cumulated length of the curves before it plus the point within it.
   */
  private uniformCoordinateAt(curves: Curve[], curveIndex: number, s: number): number {
    let u = 0;
    for (let i = 0; i < curveIndex; i++) u += curves[i]!.length;
    u += this.uniformWithinCurve(curves[curveIndex]!, s);
    return u;
  }

  /** Inverse of getCurvilinearCoordFromUniform for a single curve. */
  private uniformWithinCurve(curve: Curve, s: number): number {
    return curve.getUniformCoordFromCurvilinear(s as Curvilinear);
  }

  /**
   * Element under the cursor (by a control point or its segment), or null when
   * the click is too far from every element. Uses the same pick radius as the
   * path control points.
   */
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

      // Control points at either end.
      for (const point of [points[0], points[points.length - 1]]) {
        if (!point) continue;
        const distance = point.minus(cursor).length();
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          best = element;
        }
      }

      // Segment: the line traced along the path.
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

      // Control polygon guides: p0-p1 and p2-p3 only (no p1-p2 segment), and
      // only for handles that are currently visible.
      ctx.strokeStyle = `rgba(0, 0, 0, ${POLYGON_ALPHA})`;
      ctx.lineWidth = 1 / this.view.zoom;
      if (showP1) this.drawGuide(points[0]!, points[1]!);
      if (showP2) this.drawGuide(points[2]!, points[3]!);

      // Handles. Anchors (p0, p3) are always shown; the guide handles (p1, p2)
      // only appear with their anchor, or while their aligned pair is selected.
      const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
      points.forEach((point, index) => {
        const pointKey = keys[index]!;
        if ((pointKey === "p1" && !showP1) || (pointKey === "p2" && !showP2)) return;

        const isSelected = this.selected.has(this.keyOf(curveIndex, pointKey));
        const size = (isSelected ? NODE_SIZE * 1.5 : NODE_SIZE) / this.view.zoom;

        // Endpoints (p0, p3) are anchors; inner points (p1, p2) are guides.
        ctx.fillStyle = index === 0 || index === 3 ? "#444" : "#888";
        ctx.beginPath();
        ctx.arc(point.x, -point.y, size / 2, 0, 2 * Math.PI);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = "#d33";
          ctx.lineWidth = 2 / this.view.zoom;
          ctx.stroke();
        }
      });
    });
  }

  private drawGuide(a: Vector<2>, b: Vector<2>) {
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, -a.y);
    this.ctx.lineTo(b.x, -b.y);
    this.ctx.stroke();
  }

  /**
   * World position of the "+" add-segment button. It is placed just beyond
   * the end of the path, offset from the shared end point along the direction
   * of the path derivative at its end (the tangent where the next segment
   * starts). For an empty path the button sits at the center of the rink.
   */
  private getAddButtonPosition(): Vector<2> {
    const curves = this.sequence.path.curves;
    if (curves.length == 0) return new Vector<2>(0, 0);

    const lastCurve = curves[curves.length - 1]!;
    const end = lastCurve.p3;
    const dir = lastCurve.getDerivative(1 as Curvilinear).normalized();
    const offset = ADD_BUTTON_OFFSET / this.view.zoom; // px -> m
    return end.plus(dir.times(offset));
  }

  /** Draw a "+" inside a circle at the given world point. */
  private drawPlusInCircle(world: Vector<2>) {
    this.drawPlusInCircleWithColor(world, ADD_BUTTON_COLOR);
  }

  /** Draw a "+" inside a circle at the given world point, in the given color. */
  private drawPlusInCircleWithColor(world: Vector<2>, color: string) {
    const ctx = this.ctx;
    const cx = world.x;
    const cy = -world.y;

    const radius = ADD_BUTTON_RADIUS / this.view.zoom;
    const halfPlus = ADD_PLUS_LENGTH / 2 / this.view.zoom;

    ctx.strokeStyle = color;
    ctx.lineWidth = ADD_BUTTON_LINE_WIDTH / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Circle outline.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // "+" inside the circle.
    ctx.beginPath();
    ctx.moveTo(cx - halfPlus, cy);
    ctx.lineTo(cx + halfPlus, cy);
    ctx.moveTo(cx, cy - halfPlus);
    ctx.lineTo(cx, cy + halfPlus);
    ctx.stroke();
  }

  /** Draw the "+" add-segment button near the end of the path. */
  private drawAddButton() {
    this.drawPlusInCircle(this.getAddButtonPosition());
  }

  /** True when the given CSS pixel position is over the "+" add-segment button. */
  private hitAddButton(screenX: number, screenY: number): boolean {
    const [iconX, iconY] = this.worldToScreen(this.getAddButtonPosition());
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS;
  }

  /**
   * The point selected for removal, if exactly one point is selected. Returns
   * the world position of the point and the tangent direction of the path
   * there (used to offset the delete button to the side), plus flags saying
   * whether it is the very first or very last point of the path. Interior
   * joints (shared by two consecutive curves) and both ends are removable;
   * the guide handles (p1, p2) are not.
   */
  private getRemovablePoint(): { point: Vector<2>; dir: Vector<2>; isStart: boolean; isEnd: boolean } | null {
    if (this.selected.size !== 1 || this.selectedCurves.size > 0) return null;
    const curves = this.sequence.path.curves;
    if (curves.length === 0) return null;
    const [ciStr, pkStr] = [...this.selected][0]!.split(":");
    const curveIndex = Number(ciStr);
    const pointKey = pkStr as ControlPointKey;
    const curve = curves[curveIndex];
    if (!curve) return null;

    // Very first point: deleting removes the first curve. Only allowed while
    // more than one curve remains, so the path can never become empty.
    if (pointKey === "p0" && curveIndex === 0 && curves.length > 1) {
      return { point: curve.p0, dir: curve.getDerivative(0 as Curvilinear).normalized(), isStart: true, isEnd: false };
    }
    // Very last point: deleting removes the last curve. Only allowed while
    // more than one curve remains, so the path can never become empty.
    if (pointKey === "p3" && curveIndex === curves.length - 1 && curves.length > 1) {
      return { point: curve.p3, dir: curve.getDerivative(1 as Curvilinear).normalized(), isStart: false, isEnd: true };
    }
    // Interior joint: p0 of a non-first curve, or p3 of a non-last curve.
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

  /**
   * World position of the "-" delete button. It sits beside the selected
   * point, offset to the side of the path (perpendicular to the tangent).
   */
  private getDeleteButtonPosition(): Vector<2> | null {
    const removable = this.getRemovablePoint();
    if (!removable) return null;
    const perp = removable.dir.getOrthogonal();
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return removable.point.plus(perp.times(offset));
  }

  /** Draw a "-" inside a circle at the given world point. */
  private drawMinusInCircle(world: Vector<2>) {
    const ctx = this.ctx;
    const cx = world.x;
    const cy = -world.y;

    const radius = DELETE_BUTTON_RADIUS / this.view.zoom;
    const halfMinus = DELETE_MINUS_LENGTH / 2 / this.view.zoom;

    ctx.strokeStyle = DELETE_BUTTON_COLOR;
    ctx.lineWidth = DELETE_BUTTON_LINE_WIDTH / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Circle outline.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // "-" bar inside the circle.
    ctx.beginPath();
    ctx.moveTo(cx - halfMinus, cy);
    ctx.lineTo(cx + halfMinus, cy);
    ctx.stroke();
  }

  /** Draw the "-" delete button beside a selected joint. */
  private drawDeleteButton() {
    const center = this.getDeleteButtonPosition();
    if (!center) return;
    this.drawMinusInCircle(center);
  }

  /** The single selected element, or null when not exactly one is selected. */
  private getElementDeleteButtonElement(): Element | null {
    if (this.selectedElements.size !== 1) return null;
    return [...this.selectedElements][0]!;
  }

  /**
   * Geometry shared by the element action buttons (delete "-" and change-kind
   * cog): the path position at the element's centre and the perpendicular
   * (sideways) direction there. Null when not exactly one element is selected
   * or the path is empty.
   */
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

  /**
   * World position of the "-" delete button for a selected element. It sits
   * beside the element's centre, offset to the side of the path
   * (perpendicular to the tangent at the centre). Only shown while exactly
   * one element is selected.
   */
  private getElementDeleteButtonPosition(): Vector<2> | null {
    const geometry = this.getElementActionButtonGeometry();
    if (!geometry) return null;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return geometry.point.plus(geometry.perp.times(offset));
  }

  /** Draw the "-" delete button beside a selected element's centre. */
  private drawElementDeleteButton() {
    const center = this.getElementDeleteButtonPosition();
    if (!center) return;
    this.drawMinusInCircle(center);
  }

  /**
   * World position of the "change kind" cog button for a selected element. It
   * sits at the element's centre like the delete button but on the opposite
   * side of the path (negative perpendicular offset). Only shown while
   * exactly one element is selected.
   */
  private getElementCogButtonPosition(): Vector<2> | null {
    const geometry = this.getElementActionButtonGeometry();
    if (!geometry) return null;
    const offset = DELETE_BUTTON_OFFSET / this.view.zoom; // px -> m
    return geometry.point.plus(geometry.perp.times(-offset));
  }

  /** Draw a cog (gear): a single thick circle with 8 thick teeth sticking out. */
  private drawCogInCircle(world: Vector<2>) {
    const ctx = this.ctx;
    const cx = world.x;
    const cy = -world.y;

    // The teeth reach the same outer radius as the "-" delete button, so both
    // buttons look the same size.
    const outerRadius = DELETE_BUTTON_RADIUS / this.view.zoom;
    // The inner circle is smaller, so the teeth stick out from its edge. They
    // do not traverse the circle (their inner end is exactly on its edge).
    const circleRadius = outerRadius * 0.62;

    ctx.strokeStyle = COG_BUTTON_COLOR;
    ctx.lineWidth = COG_LINE_WIDTH / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Single thick circle.
    ctx.beginPath();
    ctx.arc(cx, cy, circleRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // 8 thick teeth, from the circle edge out to the delete-button radius
    // (thicker than long).
    for (let i = 0; i < COG_TEETH_COUNT; i++) {
      const angle = (i / COG_TEETH_COUNT) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * circleRadius, cy + Math.sin(angle) * circleRadius);
      ctx.lineTo(cx + Math.cos(angle) * outerRadius, cy + Math.sin(angle) * outerRadius);
      ctx.stroke();
    }
  }

  /** Draw the "change kind" cog button beside a selected element's centre. */
  private drawElementCogButton() {
    const center = this.getElementCogButtonPosition();
    if (!center) return;
    this.drawCogInCircle(center);
  }

  /** True when the given element is the provisional, not-yet-added one. */
  private isProvisionalElement(element: Element): boolean {
    return element === this.provisionalElement;
  }

  /**
   * Create the provisional element centered on the given path coordinate with
   * the default span, remember the coordinate as the origin of a possible
   * creation drag, and drop every selection (creating it deselects the other
   * elements).
   */
  private startProvisionalCreation(u: number) {
    this.placeProvisionalElement(u);
    this.isCreatingProvisional = true;
    this.provisionalOriginU = u;
  }

  /**
   * Extend the provisional element being created to the given path
   * coordinate: the span goes from the creation origin to the current point.
   * Dragging "backwards" along the path swaps which end is start and which is
   * end, so the span stays valid. When the cursor is back on the origin, the
   * centered default span is restored.
   */
  private updateProvisionalCreation(cursor: Vector<2>) {
    if (this.sequence.path.curves.length === 0) return;
    const u = this.snapCursorToPathAnywhere(cursor);
    if (u == null) return;
    const origin = this.provisionalOriginU;
    if (Math.abs(u - origin) < 1e-9) {
      this.placeProvisionalElement(origin);
      return;
    }
    this.setProvisionalSpan(Math.min(origin, u), Math.max(origin, u));
  }

  /** Give the provisional element the span [u - half, u + half], clamped. */
  private placeProvisionalElement(u: number) {
    const half = PROVISIONAL_TOTAL_LENGTH / 2;
    this.setProvisionalSpan(u - half, u + half);
  }

  /** Set the provisional element's span to [start, end], clamped to the path. */
  private setProvisionalSpan(start: number, end: number) {
    const path = this.sequence.path;
    if (path.curves.length === 0) return;
    const clampedStart = Math.max(0, start) as PathCoordinate;
    const clampedEnd = Math.min(path.length, end) as PathCoordinate;
    if (!this.provisionalElement) {
      this.provisionalElement = createDefaultFootTurn(clampedStart, clampedEnd);
    } else {
      this.provisionalElement.start = clampedStart;
      this.provisionalElement.end = clampedEnd;
    }
    this.selectedElements.clear();
    this.selectedCurves.clear();
    this.selected.clear();
    this.draw();
  }

  /**
   * Path coordinate under the cursor, or null when the click is too far from
   * the path. Used to place the provisional element on a click on the path.
   */
  private pickPathCoordinate(screenX: number, screenY: number): number | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    const hit = this.sequence.path.pickCurve(cursor, tolerance);
    if (!hit) return null;
    const { t } = hit.curve.getClosestPoint(cursor);
    return this.uniformCoordinateAt(this.sequence.path.curves, hit.curveIndex, t);
  }

  /**
   * World position of the "+" add-to-sequence button of the provisional
   * element. It sits where the cog button of a selected element would be: at
   * the element's centre, offset to the opposite side of the path from the
   * delete button.
   */
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

  /** Draw the "+" add-to-sequence button of the provisional element. */
  private drawProvisionalAddButton() {
    if (!this.provisionalElement) return;
    const center = this.getProvisionalAddButtonPosition();
    if (!center) return;
    this.drawPlusInCircleWithColor(center, PROVISIONAL_COLOR);
  }

  /** True when the given CSS pixel position is over the provisional element's "+" button. */
  private hitProvisionalAddButton(screenX: number, screenY: number): boolean {
    const center = this.getProvisionalAddButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS;
  }

  /**
   * Add the provisional element to the sequence and open the "change kind"
   * dialog for it (the same dialog as the cog button opens), then forget the
   * provisional element. Does nothing when there is none.
   */
  private addProvisionalElement() {
    const element = this.provisionalElement;
    if (!element) return;
    this.provisionalElement = null;
    this.sequence.addElement(element);
    if (this.onElementChangeRequest) this.onElementChangeRequest(element);
    this.draw();
  }

  /** True when the given CSS pixel position is over the element cog button. */
  private hitElementCogButton(screenX: number, screenY: number): boolean {
    const center = this.getElementCogButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  /** True when the given CSS pixel position is over the element delete button. */
  private hitElementDeleteButton(screenX: number, screenY: number): boolean {
    const center = this.getElementDeleteButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  /** True when the given CSS pixel position is over the "-" delete button. */
  private hitDeleteButton(screenX: number, screenY: number): boolean {
    const center = this.getDeleteButtonPosition();
    if (!center) return false;
    const [iconX, iconY] = this.worldToScreen(center);
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= DELETE_BUTTON_HIT_RADIUS;
  }

  /**
   * The "+" split buttons: one for each selected curve, placed at the real
   * arc-length midpoint of the curve and offset to the side (perpendicular to
   * the tangent there). The midpoint is the curvilinear coordinate at half the
   * curve's true arc length, so the button sits at the real middle of the
   * curve, not halfway between its control points.
   */
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

  /** Draw a "+" split button at the midpoint of every selected curve. */
  private drawSplitButtons() {
    for (const { center } of this.getSplitButtonData()) {
      this.drawPlusInCircle(center);
    }
  }

  /**
   * True when the given CSS pixel position is over a "+" split button;
   * returns the index of the curve it splits, or null when over none.
   */
  private hitSplitButton(screenX: number, screenY: number): number | null {
    for (const { curveIndex, center } of this.getSplitButtonData()) {
      const [iconX, iconY] = this.worldToScreen(center);
      const dx = screenX - iconX;
      const dy = screenY - iconY;
      if (Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS) return curveIndex;
    }
    return null;
  }

  /**
   * A guide handle (p1 or p2) is drawn only when an anchor on its shared joint
   * is selected (either representation of the joint), when it is itself
   * selected, or when its aligned partner handle across the shared joint is
   * selected (so the two aligned handles stay visible together). Anchors (p0,
   * p3) are always visible.
   */
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
    // pointKey === "p2"
    if (has(curveIndex, "p3") || has(curveIndex, "p2")) return true;
    if (curveIndex < curveCount - 1 && (has(curveIndex + 1, "p0") || has(curveIndex + 1, "p1"))) return true;
    return false;
  }

  /** Stable string key identifying one control point across the path. */
  private keyOf(curveIndex: number, pointKey: ControlPointKey): string {
    return `${curveIndex}:${pointKey}`;
  }

  /** Draw the in-progress selection rectangle in screen pixels (after ctx.restore). */
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
        // Hidden guide handles cannot be picked.
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

  /**
   * Index of the curve under the cursor, or null when the click is too far
   * from every curve. Uses the same pick radius as the control points.
   */
  private pickCurve(screenX: number, screenY: number): number | null {
    const cursor = this.screenToWorld(screenX, screenY);
    const tolerance = PICK_RADIUS / this.view.zoom;
    const result = this.sequence.path.pickCurve(cursor, tolerance);
    return result ? result.curveIndex : null;
  }

  /** Select a curve, replacing the point selection on a plain click, or toggling it with ctrl. */
  private handleCurveSelection(curveIndex: number, ctrlKey: boolean) {
    if (ctrlKey) {
      if (this.selectedCurves.has(curveIndex)) this.selectedCurves.delete(curveIndex);
      else this.selectedCurves.add(curveIndex);
    } else if (!this.selectedCurves.has(curveIndex)) {
      // Plain click selects only this curve, unless the clicked curve is
      // already part of a multi-selection (the group is kept so dragging it
      // moves every selected curve).
      this.selectedCurves = new Set([curveIndex]);
    }
    // Points and curves never share the selection: keeping any curve selected
    // drops the control-point selection.
    if (this.selectedCurves.size > 0) this.selected.clear();
  }

  // Coordinate transforms //////////////////////////////////////////////////

  /** Convert a CSS pixel position (relative to the canvas) to world meters. */
  private screenToWorld(screenX: number, screenY: number): Vector<2> {
    return new Vector<2>(
      this.view.center.x + (screenX - this.width / 2) / this.view.zoom,
      this.view.center.y - (screenY - this.height / 2) / this.view.zoom,
    );
  }

  /** Convert a world position (meters) to CSS pixels (relative to the canvas). */
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

  // Event handlers /////////////////////////////////////////////////////////

  /**
   * Recompute an element's keyframes in the sequence after an edit. The
   * provisional element is not part of the sequence, so its keyframes must
   * not be touched: only its start and end coordinates change.
   */
  private updateElementKeyframes(element: Element) {
    if (this.isProvisionalElement(element)) return;
    this.sequence.updateElementKeyframes(element);
  }

  private handleWheel(event: WheelEvent) {
    event.preventDefault();
    const [screenX, screenY] = this.screenPosition(event);
    const worldBefore = this.screenToWorld(screenX, screenY);

    this.view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * Math.pow(ZOOM_FACTOR, -event.deltaY)));

    // Keep the world point under the cursor fixed while zooming.
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

      // "elements" mode: clicking any part of an element selects it. Clicking
      // an endpoint control point starts dragging that point along the path;
      // clicking the segment moves the whole element along the path. No
      // path-editing actions are available here.
      if (this.mode !== "path") {
        // The "+" button of the provisional element adds it to the sequence
        // and opens the change-kind dialog (same dialog as the cog button).
        if (this.hitProvisionalAddButton(screenX, screenY)) {
          this.addProvisionalElement();
          return;
        }
        // The "change kind" cog button takes priority over selecting/picking
        // the element, but only actually does something when a callback is
        // wired up (the host UI shows the kind picker).
        if (this.hitElementCogButton(screenX, screenY) && this.onElementChangeRequest) {
          const element = this.getElementDeleteButtonElement();
          if (element) this.onElementChangeRequest(element);
          return;
        }
        // Delete button takes priority over selecting/picking the element.
        if (this.hitElementDeleteButton(screenX, screenY)) {
          const element = this.getElementDeleteButtonElement();
          if (element) {
            this.sequence.removeElement(element);
            this.selectedElements.delete(element);
            this.draw();
          }
          return;
        }
        const element = this.pickElement(screenX, screenY);
        if (element) {
          // Clicking on a real element discards the provisional one.
          if (!this.isProvisionalElement(element)) this.provisionalElement = null;
          // The provisional element can be dragged but not selected, so the
          // selected-element action buttons never target it.
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
          if (!event.ctrlKey) this.selectedElements.clear();
          // Clicking the path where no element exists places (or re-centers)
          // the provisional element there. A click anywhere else (outside the
          // provisional element and the path) discards it.
          const u = this.pickPathCoordinate(screenX, screenY);
          if (u != null) {
            // Create centered; a subsequent drag extends it from the pressed
            // point to the cursor (works dragged backwards too).
            this.startProvisionalCreation(u);
          } else {
            this.provisionalElement = null;
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
            this.sequence.path.removePoint(removable.point);
          }
          this.selected.clear();
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
          // Split adds a joint and shifts the indices of the curves after it.
          // Re-index the selection and keep both halves selected.
          const newSelected = new Set<number>();
          for (const idx of this.selectedCurves) {
            if (idx < splitCurveIndex) newSelected.add(idx);
            else if (idx > splitCurveIndex) newSelected.add(idx + 1);
          }
          newSelected.add(splitCurveIndex);
          newSelected.add(splitCurveIndex + 1);
          this.selectedCurves = newSelected;
          this.draw();
        }
        return;
      }
      const picked = this.pickControlPoint(screenX, screenY);
      if (picked) {
        const key = this.keyOf(picked.curveIndex, picked.pointKey);
        if (event.ctrlKey) {
          // Ctrl + click toggles the point in the selection.
          if (this.selected.has(key)) this.selected.delete(key);
          else this.selected.add(key);
        } else if (!this.selected.has(key)) {
          // Plain click selects only this point, unless it is already part of
          // a multi-selection (keep the group).
          this.selected = new Set([key]);
        }
        // Points and curves never share the selection: keeping any point
        // selected drops the curve selection.
        if (this.selected.size > 0) this.selectedCurves.clear();
        // Start dragging only if the clicked point remains in the selection.
        if (this.selected.has(key)) {
          this.isDraggingPoint = true;
          this.dragOrigin = this.sequence.path.curves[picked.curveIndex]?.[picked.pointKey].copy() ?? null;
          this.lastDragDelta = new Vector<2>(0, 0);
        }
      } else {
        // Click on a curve line selects the curve.
        const curveIndex = this.pickCurve(screenX, screenY);
        if (curveIndex != null) {
          this.handleCurveSelection(curveIndex, event.ctrlKey);
          // Start dragging the curve(s) if the clicked curve is selected.
          if (this.selectedCurves.has(curveIndex)) {
            this.isDraggingCurve = true;
            this.dragOrigin = this.screenToWorld(screenX, screenY);
            this.lastDragDelta = new Vector<2>(0, 0);
          }
        } else {
          // Left drag on empty space draws a selection rectangle (no longer pans).
          this.isSelectingRect = true;
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

      // The world y-axis is flipped relative to the screen (screenToWorld,
      // drawing), so grab-style panning needs opposite signs on x and y:
      // drag right/down to move the content right/down.
      this.view.center = this.view.center.plus(new Vector<2>(-deltaX, deltaY).times(1 / this.view.zoom));
      this.draw();
      return;
    }

    if (this.isSelectingRect) {
      const [screenX, screenY] = this.screenPosition(event);
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
      }
      this.draw();
      return;
    }

    if (this.isDraggingElementSegment) {
      const [screenX, screenY] = this.screenPosition(event);
      if (!this.dragElement) return;
      const world = this.screenToWorld(screenX, screenY);
      const path = this.sequence.path;
      const pathLen = path.length;
      const total = this.dragStartDistance + this.dragEndDistance;
      const snappedU = this.snapCursorToPathNearCurve(this.dragAnchorCurveIndex, world);
      if (snappedU != null) {
        const grabbed = snappedU as number;
        // Walk the real (geometric) arc lengths from the grabbed point to each
        // control point along the path, so the element's real length (not its
        // approximate path-coordinate span) is conserved during the drag.
        let newStart = path.moveAlongByArcLength(grabbed as PathCoordinate, -this.dragStartDistance);
        let newEnd = path.moveAlongByArcLength(grabbed as PathCoordinate, this.dragEndDistance);
        // If a path boundary was hit, re-anchor the whole span to preserve its
        // total real length instead of letting it shrink against the edge.
        if (total >= pathLen) {
          newStart = 0 as PathCoordinate;
          newEnd = pathLen as PathCoordinate;
        } else if ((newStart as number) <= 1e-9) {
          newStart = 0 as PathCoordinate;
          newEnd = path.moveAlongByArcLength(0 as PathCoordinate, total);
        } else if ((newEnd as number) >= pathLen - 1e-9) {
          newEnd = pathLen as PathCoordinate;
          newStart = path.moveAlongByArcLength(pathLen as PathCoordinate, -total);
        }
        this.dragElement.start = newStart;
        this.dragElement.end = newEnd;
        this.updateElementKeyframes(this.dragElement);
        // Follow the cursor so the move can continue across curves smoothly
        // (the curvilinear to path conversion is anchored on newStart's curve).
        this.dragAnchorCurveIndex = this.curveIndexAt(this.sequence.path.curves, newStart as number);
      }
      this.draw();
      return;
    }

    if (this.isDraggingCurve) {
      const [screenX, screenY] = this.screenPosition(event);
      if (!this.dragOrigin) return;
      // Translate every selected curve by the change in delta, so the whole
      // selection tracks the cursor exactly (no accumulation error).
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
        // Single point: keep the original align-neighbours behaviour.
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
        this.draw();
      } else if (this.dragOrigin) {
        // Multiple points: translate each step by the change in delta, so the
        // whole selection tracks the cursor exactly (no accumulation error).
        const world = this.screenToWorld(screenX, screenY);
        const delta = world.minus(this.dragOrigin);
        const change = delta.minus(this.lastDragDelta);
        this.lastDragDelta = delta;
        this.translateGroup(change);
      }
    }
  }

  /**
   * Translate every selected point (and the flanking handles of selected
   * anchors, so the path stays connected) by `delta`. Points are deduplicated
   * with a set so a shared handle is moved exactly once.
   */
  private translateGroup(delta: Vector<2>) {
    const curves = this.sequence.path.curves;

    // Collect the keys that should move: every selected point plus the
    // flanking handles of selected anchors (so the path stays connected).
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

    // Apply the translation once per distinct point. A joint shared by two
    // curves (one curve's p3 and the next curve's p0) is the same Vector
    // object, so it can appear under several keys; dedupe by object identity
    // so it is never moved twice.
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
    this.draw();
  }

  /**
   * Translate every selected curve by `delta`: each curve's endpoints (p0,
   * p3) and both control points (p1, p2) all move together with the same
   * motion, so the whole edge slides without changing its shape. Shared joints
   * are deduplicated by object identity so they are moved exactly once.
   *
   * To keep the path continuous, the supplementary control points of the
   * neighbouring curves are translated too: the previous curve's p2 at the
   * start joint and the next curve's p1 at the end joint. Moving them by the
   * same delta as the joint keeps them collinear with it, so the derivative
   * stays continuous (and unchanged) at the joints.
   */
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
      // Supplementary control points of the neighbouring curves, if they exist,
      // to keep the derivative continuous at the shared joints.
      if (curveIndex > 0) moved.add(curves[curveIndex - 1]!.p2);
      if (curveIndex < curves.length - 1) moved.add(curves[curveIndex + 1]!.p1);
    }

    for (const point of moved) {
      point.x += delta.x;
      point.y += delta.y;
    }

    this.sequence.path.updateLength();
    this.draw();
  }

  /** Select the control points inside the dragged rectangle. */
  private finishSelectionRectangle() {
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

  /** Select the anchor control points (p0, p3) of all curves, not the guides (p1, p2). */
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

  /**
   * Keep the path continuous after a control point is dragged.
   *
   * Dragging an anchor (p0 or p3) translates the flanking handles together
   * with it, all with the same motion: around a joint, the handle before the
   * joint (previous curve's p2 for a p0, this curve's p2 for a p3) and the
   * handle after it (this curve's p1 for a p0, next curve's p1 for a p3) keep
   * their offset to the anchor unchanged. This preserves the derivative at the
   * join. Dragging p1 aligns the previous curve's end handle (p2) about the
   * shared joint so the two handles stay collinear, keeping its distance to
   * the joint. Dragging p2 does the same on the other side: the next curve's
   * start handle (p1) is aligned about the shared joint, keeping its distance.
   */
  private alignNeighbors(curveIndex: number, pointKey: ControlPointKey, delta: Vector<2>) {
    const curves = this.sequence.path.curves;
    const curve = curves[curveIndex];
    if (!curve) return;

    if (pointKey === "p0" || pointKey === "p3") {
      // Anchor: translate the flanking handle of this curve.
      if (pointKey === "p0") curve.p1 = curve.p1.plus(delta);
      else curve.p2 = curve.p2.plus(delta);

      // And the handle of the neighbouring curve on the other side.
      if (pointKey === "p0" && curveIndex > 0) {
        curves[curveIndex - 1]!.p2 = curves[curveIndex - 1]!.p2.plus(delta);
      } else if (pointKey === "p3" && curveIndex < curves.length - 1) {
        curves[curveIndex + 1]!.p1 = curves[curveIndex + 1]!.p1.plus(delta);
      }
    } else if (pointKey === "p1" && curveIndex > 0) {
      // Handle: mirror the previous curve's end handle (p2) about the joint.
      curves[curveIndex - 1]!.alignEnd(curve);
    } else if (pointKey === "p2" && curveIndex < curves.length - 1) {
      // Handle: mirror the next curve's start handle (p1) about the joint.
      curves[curveIndex + 1]!.alignStart(curve);
    }
  }

  private handleMouseUp() {
    if (this.isSelectingRect) {
      this.finishSelectionRectangle();
      this.isSelectingRect = false;
    }
    this.isPanning = false;
    this.isDraggingPoint = false;
    this.isDraggingCurve = false;
    this.isDraggingElementPoint = false;
    this.isDraggingElementSegment = false;
    this.isCreatingProvisional = false;
    this.dragElement = null;
    this.dragOrigin = null;
    this.lastDragDelta = new Vector<2>(0, 0);
    this.draw();
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

/** Shortest squared distance from point p to the segment [a, b]. */
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
