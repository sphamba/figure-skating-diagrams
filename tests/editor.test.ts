import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Vector } from "../src/engine/vector";
import { LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";

/** Build a simple known path: a straight 1 m line along the X axis. */
function makeStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)),
  );
  return path;
}

test("addSegmentEnd appends a 5 m straight curve", () => {
  const editor = {
    sequence: new Sequence(makeStraightPath()),
    addSegmentEnd() {
      this.sequence.path.addCurveEnd();
    },
  };

  const curvesBefore = editor.sequence.path.curves.length;
  editor.addSegmentEnd();

  const curves = editor.sequence.path.curves;
  expect(curves).toHaveLength(curvesBefore + 1);

  const lastCurve = curves[curves.length - 1]!;
  expect(lastCurve.length).toBeCloseTo(5, 2);
});

test("new end curve keeps the end derivative and aligns control points at equal length", () => {
  // Use a curved last segment so the direction is non-trivial.
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(0.5, 1), new Vector(1, 1)),
  );

  const endPosition = path.curves[path.curves.length - 1]!.p3.copy();
  const endDerivative = path.curves[path.curves.length - 1]!
    .getDerivative(1 as Curvilinear)
    .normalized();

  const sequence = new Sequence(path);
  sequence.path.addCurveEnd();

  const lastCurve = sequence.path.curves[sequence.path.curves.length - 1]!;

  // Start point matches previous end point.
  expect(lastCurve.p0.x).toBeCloseTo(endPosition.x);
  expect(lastCurve.p0.y).toBeCloseTo(endPosition.y);

  // Segment end is 5 m away along the end derivative.
  const dir = endDerivative;
  expect(lastCurve.p3.x).toBeCloseTo(endPosition.x + 5 * dir.x);
  expect(lastCurve.p3.y).toBeCloseTo(endPosition.y + 5 * dir.y);

  // The start control point matches the previous end handle length (0.5).
  // The middle control point sits at 5/2 along the same straight line.
  expect(lastCurve.p1.x).toBeCloseTo(endPosition.x + 0.5 * dir.x);
  expect(lastCurve.p1.y).toBeCloseTo(endPosition.y + 0.5 * dir.y);
  expect(lastCurve.p2.x).toBeCloseTo(endPosition.x + (5 / 2) * dir.x);
  expect(lastCurve.p2.y).toBeCloseTo(endPosition.y + (5 / 2) * dir.y);

  // The new start derivative matches the previous end derivative.
  const newStartDerivative = lastCurve.getDerivative(0 as Curvilinear).normalized();
  expect(newStartDerivative.x).toBeCloseTo(dir.x);
  expect(newStartDerivative.y).toBeCloseTo(dir.y);
});

// --- Multi-drag regression tests (real Editor instance) -------------------

import { Editor } from "../src/engine/sequenceEditor/editor";

/** A no-op 2D context that records nothing but accepts every call. */
const CTX_METHODS = [
  "scale", "clearRect", "save", "restore", "beginPath", "moveTo", "lineTo",
  "bezierCurveTo", "stroke", "fill", "arc", "fillRect", "strokeRect", "translate",
  "setTransform", "closePath", "rect",
];

function makeEditor() {
  const ctx: Record<string, unknown> = { width: 0, height: 0 };
  for (const m of CTX_METHODS) ctx[m] = () => {};
  const canvas = document.createElement("canvas") as HTMLCanvasElement & {
    getContext: () => Record<string, unknown>;
  };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  const editor = new Editor(canvas, new Sequence(path));
  editor.mode = "path";
  return { editor, canvas };
}

function mouse(eventName: string, target: EventTarget, init: MouseEventInit) {
  target.dispatchEvent(new MouseEvent(eventName, init));
}

test("dragging multiple selected points keeps them under the cursor", () => {
  const { editor, canvas } = makeEditor();
  const curve = editor.getSequence().path.curves[0]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // Select p0 (plain click) then p3 (ctrl + click to add). p3 is at (1, 0).
  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  mouse("mousedown", canvas, { clientX: sx(1), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(editorRef(editor).selected.size).toBe(2);

  // Drag p0 (+ctrl-free) along a winding screen path; it must track the cursor.
  const p0 = curve.p0;
  const startX = sx(p0.x);
  const startY = sy(p0.y);
  mouse("mousedown", canvas, { clientX: startX, clientY: startY, button: 0, ctrlKey: false });
  for (let i = 1; i <= 12; i++) {
    const tx = startX + (i % 7) * 5 - 3;
    const ty = startY - i * 3 + (i % 4) * 2;
    mouse("mousemove", window, { clientX: tx, clientY: ty });
    expect(sx(p0.x)).toBeCloseTo(tx, 0);
    expect(sy(p0.y)).toBeCloseTo(ty, 0);
  }
  mouse("mouseup", window, {});

  editor.destroy();
});

test("dragging an edge also drags the neighbour's supplementary control points to keep the derivative continuous", () => {
  const { editor } = makeEditor();
  const path = editor.getSequence().path;
  // Append a straight continuation so the joint (1,0) is shared and the
  // derivative is initially continuous: c0.p3 === c1.p0 === (1,0).
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0);

  // Select curve 1 and translate the whole edge by a world delta.
  const sel = editorRef(editor).selectedCurves;
  sel.clear();
  sel.add(1);
  const delta = new Vector(0.5, 0.2);
  editorRef(editor).translateSelectedCurves(delta);

  // The dragged edge's own points moved together.
  expect(c1.p0.x).toBeCloseTo(1.5, 12);
  expect(c1.p0.y).toBeCloseTo(0.2, 12);
  expect(c1.p1.x).toBeCloseTo(4 / 3 + 0.5, 12);
  expect(c1.p2.x).toBeCloseTo(5 / 3 + 0.5, 12);
  expect(c1.p3.x).toBeCloseTo(2.5, 12);
  expect(c1.p3.y).toBeCloseTo(0.2, 12);

  // The supplementary control point of the preceding neighbour moved by the
  // same delta (keeps the joint collinear), while its other points did not.
  expect(c0.p2.x).toBeCloseTo(2 / 3 + 0.5, 12);
  expect(c0.p2.y).toBeCloseTo(0.2, 12);
  expect(c0.p1.x).toBeCloseTo(1 / 3, 12);
  expect(c0.p1.y).toBeCloseTo(0, 12);

  // The derivative stays continuous at the shared joint.
  const d0 = c0.getDerivative(1 as Curvilinear).normalized();
  const d1 = c1.getDerivative(0 as Curvilinear).normalized();
  expect(d0.x).toBeCloseTo(d1.x, 12);
  expect(d0.y).toBeCloseTo(d1.y, 12);

  editor.destroy();
});

test("dragging the first edge drags the next curve's supplementary p1 for continuity", () => {
  const { editor } = makeEditor();
  const path = editor.getSequence().path;
  // Straight continuation so the joint (1,0) is shared: c0.p3 === c1.p0.
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;

  // Select curve 0 (the first edge) and translate it.
  const sel = editorRef(editor).selectedCurves;
  sel.clear();
  sel.add(0);
  const delta = new Vector(0.4, -0.3);
  editorRef(editor).translateSelectedCurves(delta);

  // The dragged edge's own points moved.
  expect(c0.p3.x).toBeCloseTo(1.4, 12);
  expect(c0.p3.y).toBeCloseTo(-0.3, 12);

  // The next curve's supplementary p1 moved by the same delta (keeps the end
  // joint collinear), while the next curve's own p0 (shared joint) also moved.
  expect(c1.p1.x).toBeCloseTo(4 / 3 + 0.4, 12);
  expect(c1.p1.y).toBeCloseTo(-0.3, 12);
  expect(c1.p2.x).toBeCloseTo(5 / 3, 12);
  expect(c1.p2.y).toBeCloseTo(0, 12);

  // Derivative continuity is preserved at the joint.
  const d0 = c0.getDerivative(1 as Curvilinear).normalized();
  const d1 = c1.getDerivative(0 as Curvilinear).normalized();
  expect(d0.x).toBeCloseTo(d1.x, 12);
  expect(d0.y).toBeCloseTo(d1.y, 12);

  editor.destroy();
});

test("dragging one of several selected curves moves them all", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
  // Two straight segments (4 m each) sharing the joint (4,0). The curves are
  // long so that the grab point on curve 1's line sits well away from both the
  // control-point pick radius and the "+" add/split buttons that float near
  // the curve endpoints and midpoints.
  path.addCurveEnd(new Curve(new Vector(4, 0), new Vector(16 / 3, 0), new Vector(20 / 3, 0), new Vector(8, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // Select both curves first.
  const sel = editorRef(editor).selectedCurves;
  sel.clear();
  sel.add(0);
  sel.add(1);
  expect(sel.size).toBe(2);

  // Plain-click a point on curve 1's line (quarter point (5, 0), not a control
  // point nor a split/add button) and start dragging. A plain click on an
  // already selected curve must keep the whole multi-selection.
  const startX = sx(5);
  const startY = sy(0);
  mouse("mousedown", canvas, { clientX: startX, clientY: startY, button: 0, ctrlKey: false });
  expect(sel.size).toBe(2);

  // Drag: final cursor is (startX + 24, startY - 18), so the world delta is
  // (24/zoom, 18/zoom).
  for (let i = 1; i <= 6; i++) {
    mouse("mousemove", window, { clientX: startX + i * 4, clientY: startY - i * 3 });
  }
  mouse("mouseup", window, {});

  const expectedX = 24 / zoom;
  const expectedY = 18 / zoom;
  // Both curves moved together: the far ends of each curve tracked the cursor.
  expect(c0.p0.x).toBeCloseTo(expectedX, 6);
  expect(c0.p0.y).toBeCloseTo(expectedY, 6);
  expect(c1.p3.x).toBeCloseTo(8 + expectedX, 6);
  expect(c1.p3.y).toBeCloseTo(expectedY, 6);

  editor.destroy();
});

test("points and curves cannot be in the same multiple selection", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
  // A second curve so we can click a curve line that is not a control point.
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const state = editorRef(editor);
  const zoom = state.view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // Select a control point of curve 0 (p0 at (0, 0)).
  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(state.selected.size).toBe(1);
  expect(state.selectedCurves.size).toBe(0);

  // Ctrl + click a curve line (midpoint of curve 1): selecting a curve drops
  // the point selection.
  mouse("mousedown", canvas, { clientX: sx(1.5), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.selectedCurves.size).toBe(1);
  expect(state.selected.size).toBe(0);

  // Ctrl + click a control point again: selecting a point drops the curve
  // selection.
  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.selected.size).toBe(1);
  expect(state.selectedCurves.size).toBe(0);

  editor.destroy();
});

// Small helper to reach a private field of the Editor for test assertions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editorRef(editor: Editor): any {
  return editor;
}

test("a joint shared by two curves moves once, not twice, during a group drag", () => {
  const { editor, canvas } = makeEditor();
  // Build a second curve so the joint (1,0) is shared: curve0.p3 === curve1.p0.
  const path = editor.getSequence().path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0); // same object reference (shared joint)
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // Both representations of the joint are selected (e.g. ctrl+A / rectangle).
  const sel = editorRef(editor).selected;
  sel.clear();
  sel.add("0:p3");
  sel.add("1:p0");
  sel.add("1:p3");

  const startX = sx(c0.p3.x);
  const startY = sy(c0.p3.y);
  mouse("mousedown", canvas, { clientX: startX, clientY: startY, button: 0, ctrlKey: false });
  for (let i = 1; i <= 8; i++) {
    const tx = startX + i * 6 - 2;
    const ty = startY - i * 4 + 1;
    mouse("mousemove", window, { clientX: tx, clientY: ty });
    // The grabbed joint follows the cursor.
    expect(sx(c0.p3.x)).toBeCloseTo(tx, 0);
    expect(sy(c0.p3.y)).toBeCloseTo(ty, 0);
    // And it moved by exactly one delta (not double). At step i the applied
    // world delta is ((tx-startX)/zoom, -(ty-startY)/zoom) from the origin (1,0).
    const expectedX = 1 + (tx - startX) / zoom;
    const expectedY = -(ty - startY) / zoom;
    expect(c1.p0.x).toBeCloseTo(expectedX, 3);
    expect(c1.p0.y).toBeCloseTo(expectedY, 3);
  }
  mouse("mouseup", window, {});
  editor.destroy();
});

test("dragging an element by its segment keeps its real length constant", () => {
  // A strongly non-uniform single curve: the arc length covered per unit of
  // the Bezier parameter varies hugely along it, so the path-coordinate span
  // is only a poor proxy for the real drawn length. This is exactly the case
  // where the editor used to let an element's length drift while dragging by
  // its segment.
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
  path.curves = [new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(5, 4), new Vector(50, 0))];
  path.updateLength();
  editorRef(editor).mode = "elements";

  const startU = (path.length * 0.2) as PathCoordinate;
  const endU = (path.length * 0.4) as PathCoordinate;
  const el = new LeftForwardOutsideThreeTurn("footL", startU, endU);
  editorRef(editor).sequence.elements.push(el);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // Grab the element by the middle of its segment.
  const midU = (startU + endU) / 2;
  const mid = path.getPosition(midU as PathCoordinate);
  mouse("mousedown", canvas, { clientX: sx(mid.x), clientY: sy(mid.y), button: 0, ctrlKey: false });
  expect(editorRef(editor).isDraggingElementSegment).toBe(true);

  const initial = path.arcLengthBetween(el.start, el.end);

  // Drag the grabbed point along almost the whole curve, checking at several
  // points that the element's real (geometric) length stays constant even when
  // the element is pushed against the path boundaries.
  for (let i = 1; i <= 200; i++) {
    const u = path.length * (0.02 + (i / 200) * 0.96);
    const p = path.getPosition(u as PathCoordinate);
    mouse("mousemove", window, { clientX: sx(p.x), clientY: sy(p.y), button: 0 });
    if (i % 40 === 0) {
      expect(path.arcLengthBetween(el.start, el.end)).toBeCloseTo(initial, 6);
    }
  }
  mouse("mouseup", window, {});
  editor.destroy();
});

test("clicking the delete button next to a selected element removes it", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
  // A longer straight path so the element centre button floats clear of the
  // element's endpoint control points and the "+" add button.
  path.curves = [new Curve(new Vector(0, 0), new Vector(4 / 3, 0), new Vector(8 / 3, 0), new Vector(4, 0))];
  path.updateLength();
  editorRef(editor).mode = "elements";

  const startU = (path.length * 0.2) as PathCoordinate;
  const endU = (path.length * 0.6) as PathCoordinate;
  const el = new LeftForwardOutsideThreeTurn("footL", startU, endU);
  editorRef(editor).sequence.elements.push(el);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  // No button while nothing is selected.
  expect(editorRef(editor).getElementDeleteButtonPosition()).toBeNull();

  // Select the element by clicking on it.
  const midU = (startU + endU) / 2;
  const mid = path.getPosition(midU as PathCoordinate);
  mouse("mousedown", canvas, { clientX: sx(mid.x), clientY: sy(mid.y), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(editorRef(editor).selectedElements.has(el)).toBe(true);
  expect(editorRef(editor).getElementDeleteButtonPosition()).not.toBeNull();

  // Click on the delete button that now sits next to the element's centre.
  const btn = editorRef(editor).getElementDeleteButtonPosition();
  mouse("mousedown", canvas, { clientX: sx(btn.x), clientY: sy(btn.y), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});

  expect(editorRef(editor).sequence.elements).not.toContain(el);
  expect(editorRef(editor).selectedElements.has(el)).toBe(false);
  // After removal the selection is empty, so no delete button remains.
  expect(editorRef(editor).getElementDeleteButtonPosition()).toBeNull();

  editor.destroy();
});
