import type { Curvilinear } from "../curve.js";
import { LENGTH, WIDTH, CORNER_RADIUS } from "../rink.js";
import type { CanvasRenderingContext2DSized } from "../rinkCanvas.js";
import { Sequence } from "../sequence.js";
import { Vector } from "../vector.js";

/** One of the four cubic Bezier control points of a Curve. */
export type ControlPointKey = "p0" | "p1" | "p2" | "p3";

const RINK_COLOR = "#ccc";
const PATH_WIDTH = 1; // px
const NODE_SIZE = 10; // px
const POLYGON_ALPHA = 0.25;
const PICK_RADIUS = 8; // px
const ADD_BUTTON_OFFSET = 24; // px (screen distance from the path end to the arrow tip)
const ARROW_LENGTH = 14; // px (shaft length from tail to tip)
const ARROW_HEAD_LENGTH = 7; // px (length of each arrowhead wing from the tip)
const ARROW_HEAD_WIDTH = 6; // px (total width of the arrowhead)
const ADD_BUTTON_HIT_RADIUS = 14; // px
const ADD_BUTTON_COLOR = "#d33";
const SELECTION_RECT_FILL = "rgba(100, 149, 237, 0.2)"; // gentle blue fill
const SELECTION_RECT_STROKE = "rgba(100, 149, 237, 0.9)";
const ZOOM_FACTOR = 1.005;
const MIN_ZOOM = 2;
const MAX_ZOOM = 5000;

type ViewState = {
  center: Vector<2>;
  zoom: number; // pixel per meter
};

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
  private view: ViewState;
  /** Extra sequences drawn for their paths/traces but not editable. */
  private overlaySequences: Sequence[] = [];

  private selected = new Set<string>();
  private isPanning = false;
  private isDraggingPoint = false;
  private isSelectingRect = false;
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

  constructor(canvas: HTMLCanvasElement, sequence: Sequence) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d") as CanvasRenderingContext2DSized;
    this.sequence = sequence;

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
  }

  setSequence(sequence: Sequence) {
    this.sequence = sequence;
    this.selected.clear();
    this.draw();
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
    this.drawControlHandles();
    this.drawAddButton();
    ctx.restore();
    this.drawSelectionRectangle();
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
    sequence.draw(this.ctx, pathWidth);
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
   * World position of the add-segment arrow head. It is placed just beyond
   * the end of the path, offset from the shared end point along the direction
   * of the path derivative at its end (the tangent where the next segment
   * starts). For an empty path the arrow head sits at the center of the rink.
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

  /** Tangent direction the add-segment arrow points along (world units). */
  private getAddButtonDirection(): Vector<2> {
    const curves = this.sequence.path.curves;
    if (curves.length == 0) return new Vector<2>(0, 1); // point up for an empty path
    return curves[curves.length - 1]!.getDerivative(1 as Curvilinear).normalized();
  }

  /** Draw the add-segment arrow near the end of the path. */
  private drawAddButton() {
    const ctx = this.ctx;
    const tip = this.getAddButtonPosition();
    const dir = this.getAddButtonDirection();
    const perp = dir.getOrthogonal();

    const shaftLen = ARROW_LENGTH / this.view.zoom;
    const headLen = ARROW_HEAD_LENGTH / this.view.zoom;
    const halfHeadWidth = ARROW_HEAD_WIDTH / 2 / this.view.zoom;

    const tail = tip.minus(dir.times(shaftLen));
    const headBase = tip.minus(dir.times(headLen));

    ctx.strokeStyle = ADD_BUTTON_COLOR;
    ctx.lineWidth = 2 / this.view.zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    // Shaft, from the tail toward the end of the path.
    ctx.moveTo(tail.x, -tail.y);
    ctx.lineTo(tip.x, -tip.y);
    // Arrowhead wings.
    ctx.moveTo(tip.x, -tip.y);
    ctx.lineTo(headBase.x + perp.x * halfHeadWidth, -(headBase.y + perp.y * halfHeadWidth));
    ctx.moveTo(tip.x, -tip.y);
    ctx.lineTo(headBase.x - perp.x * halfHeadWidth, -(headBase.y - perp.y * halfHeadWidth));
    ctx.stroke();
  }

  /** True when the given CSS pixel position is over the "+" add-segment button. */
  private hitAddButton(screenX: number, screenY: number): boolean {
    const [iconX, iconY] = this.worldToScreen(this.getAddButtonPosition());
    const dx = screenX - iconX;
    const dy = screenY - iconY;
    return Math.hypot(dx, dy) <= ADD_BUTTON_HIT_RADIUS;
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
      if (this.hitAddButton(screenX, screenY)) {
        this.addSegmentEnd();
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
          // Plain click on a new point selects only it.
          this.selected = new Set([key]);
        }
        // Start dragging only if the clicked point remains in the selection.
        if (this.selected.has(key)) {
          this.isDraggingPoint = true;
          this.dragOrigin = this.sequence.path.curves[picked.curveIndex]?.[picked.pointKey].copy() ?? null;
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
    this.draw();
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && (event.key === "a" || event.key === "A")) {
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
