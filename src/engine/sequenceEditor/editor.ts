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
 * Only the path is editable for now: control points can be selected and
 * dragged with the left button, the canvas can be panned with a right button
 * drag, and zoomed with the mouse wheel.
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

  private selected: ControlPointSelection | null = null;
  private isPanning = false;
  private isDraggingPoint = false;
  private lastPanX = 0;
  private lastPanY = 0;

  private onWheel = (event: WheelEvent) => this.handleWheel(event);
  private onMouseDown = (event: MouseEvent) => this.handleMouseDown(event);
  private onMouseMove = (event: MouseEvent) => this.handleMouseMove(event);
  private onMouseUp = () => this.handleMouseUp();
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
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("resize", this.onWindowResize);
  }

  setSequence(sequence: Sequence) {
    this.sequence = sequence;
    this.selected = null;
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
    ctx.restore();
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

      // Control polygon guides: p0-p1 and p2-p3 only (no p1-p2 segment).
      ctx.strokeStyle = `rgba(0, 0, 0, ${POLYGON_ALPHA})`;
      ctx.lineWidth = 1 / this.view.zoom;
      for (const [a, b] of [
        [points[0]!, points[1]!],
        [points[2]!, points[3]!],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(a.x, -a.y);
        ctx.lineTo(b.x, -b.y);
        ctx.stroke();
      }

      // Handles
      const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];
      points.forEach((point, index) => {
        const isSelected = this.selected?.curveIndex === curveIndex && this.selected.pointKey === keys[index];
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

  private pickControlPoint(screenX: number, screenY: number): ControlPointSelection | null {
    const curves = this.sequence.path.curves;
    const cursor = this.screenToWorld(screenX, screenY);
    const pickRadius = PICK_RADIUS / this.view.zoom;
    const keys: ControlPointKey[] = ["p0", "p1", "p2", "p3"];

    let best: ControlPointSelection | null = null;
    let bestDistance = Infinity;

    curves.forEach((curve, curveIndex) => {
      keys.forEach((pointKey) => {
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
      this.selected = this.pickControlPoint(screenX, screenY);
      this.isDraggingPoint = this.selected !== null;
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

    if (this.isDraggingPoint && this.selected) {
      const [screenX, screenY] = this.screenPosition(event);
      const world = this.screenToWorld(screenX, screenY);
      const curve = this.sequence.path.curves[this.selected.curveIndex];
      const point = curve?.[this.selected.pointKey];
      if (!curve || !point) return;

      point.x = world.x;
      point.y = world.y;
      this.sequence.path.updateLength();
      this.draw();
    }
  }

  private handleMouseUp() {
    this.isPanning = false;
    this.isDraggingPoint = false;
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
