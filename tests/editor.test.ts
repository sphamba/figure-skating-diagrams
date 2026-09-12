import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Vector } from "../src/engine/vector";
import { LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";
import { glideConstructorsByType, LeftForwardOutsideGlide } from "../src/engine/element/glide";
import { LeftNormalForwardInsideGlide } from "../src/engine/element/stroke";

function makeStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
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
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(0.5, 1), new Vector(1, 1)));

  const endPosition = path.curves[path.curves.length - 1]!.p3.copy();
  const endDerivative = path.curves[path.curves.length - 1]!.getDerivative(1 as Curvilinear).normalized();

  const sequence = new Sequence(path);
  sequence.path.addCurveEnd();

  const lastCurve = sequence.path.curves[sequence.path.curves.length - 1]!;

  expect(lastCurve.p0.x).toBeCloseTo(endPosition.x);
  expect(lastCurve.p0.y).toBeCloseTo(endPosition.y);

  const dir = endDerivative;
  expect(lastCurve.p3.x).toBeCloseTo(endPosition.x + 5 * dir.x);
  expect(lastCurve.p3.y).toBeCloseTo(endPosition.y + 5 * dir.y);

  expect(lastCurve.p1.x).toBeCloseTo(endPosition.x + 0.5 * dir.x);
  expect(lastCurve.p1.y).toBeCloseTo(endPosition.y + 0.5 * dir.y);
  expect(lastCurve.p2.x).toBeCloseTo(endPosition.x + (5 / 2) * dir.x);
  expect(lastCurve.p2.y).toBeCloseTo(endPosition.y + (5 / 2) * dir.y);

  const newStartDerivative = lastCurve.getDerivative(0 as Curvilinear).normalized();
  expect(newStartDerivative.x).toBeCloseTo(dir.x);
  expect(newStartDerivative.y).toBeCloseTo(dir.y);
});

import { Editor } from "../src/engine/sequenceEditor/editor";

// canvas 2D context methods, stubbed as no-ops
const CTX_METHODS = [
  "scale",
  "clearRect",
  "save",
  "restore",
  "beginPath",
  "moveTo",
  "lineTo",
  "bezierCurveTo",
  "stroke",
  "fill",
  "arc",
  "fillRect",
  "strokeRect",
  "translate",
  "setTransform",
  "closePath",
  "rect",
  "fillText",
];

const CTX_RESULT: Record<string, () => unknown> = {
  measureText: () => ({
    width: 40,
    actualBoundingBoxAscent: 8,
    actualBoundingBoxDescent: 2,
  }),
};

function makeEditor() {
  const ctx: Record<string, unknown> = { width: 0, height: 0 };
  for (const m of CTX_METHODS) ctx[m] = () => {};
  for (const [m, fn] of Object.entries(CTX_RESULT)) ctx[m] = fn;
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
  const editor = new Editor(canvas, [new Sequence(path)]);
  editor.mode = "path";
  return { editor, canvas };
}

function mouse(eventName: string, target: EventTarget, init: MouseEventInit) {
  target.dispatchEvent(new MouseEvent(eventName, init));
}

test("dragging multiple selected points keeps them under the cursor", () => {
  const { editor, canvas } = makeEditor();
  const curve = editor.getSequences()[0].path.curves[0]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  mouse("mousedown", canvas, { clientX: sx(1), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(editorRef(editor).getSelectedPointsFor(editorRef(editor).getSequences()[0]).size).toBe(2);

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

test("dragging a path point directly moves it without selecting it first", () => {
  const { editor, canvas } = makeEditor();
  const curve = editor.getSequences()[0].path.curves[0]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  for (let i = 1; i <= 10; i++) {
    mouse("mousemove", window, { clientX: sx(i * 0.05), clientY: sy(0) });
    expect(curve.p0.x).toBeCloseTo(i * 0.05, 6);
  }
  mouse("mouseup", window, {});

  expect(editorRef(editor).getSelectedPointsFor(editor.getSequences()[0]).size).toBe(1);
  editor.destroy();
});

test("dragging one point moves the points selected on other sequences together", () => {
  const { editor, canvas } = makeEditor();
  const first = editor.getSequences()[0];
  const path2 = new Path();
  path2.addCurveEnd(new Curve(new Vector(0, 4), new Vector(1 / 3, 4), new Vector(2 / 3, 4), new Vector(1, 4)));
  const second = new Sequence(path2);
  editor.setSequences([first, second]);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;
  const firstCurve = first.path.curves[0]!;
  const secondCurve = second.path.curves[0]!;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(4), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(editor.getSelectedPointsFor(first).size).toBe(1);
  expect(editor.getSelectedPointsFor(second).size).toBe(1);

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  for (let i = 1; i <= 8; i++) {
    mouse("mousemove", window, { clientX: sx(i * 0.1), clientY: sy(i * 0.05) });
    expect(firstCurve.p0.x).toBeCloseTo(i * 0.1, 6);
    expect(secondCurve.p0.x).toBeCloseTo(i * 0.1, 6);
    expect(secondCurve.p0.y).toBeCloseTo(4 + i * 0.05, 6);
  }
  mouse("mouseup", window, {});
  editor.destroy();
});

test("dragging an edge also drags the neighbour's supplementary control points to keep the derivative continuous", () => {
  const { editor } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0);

  const sel = editor.getSelectedCurvesFor(editor.getSequences()[0]);
  sel.clear();
  sel.add(1);
  const delta = new Vector(0.5, 0.2);
  editorRef(editor).translateSelectedCurves(delta);

  expect(c1.p0.x).toBeCloseTo(1.5, 12);
  expect(c1.p0.y).toBeCloseTo(0.2, 12);
  expect(c1.p1.x).toBeCloseTo(4 / 3 + 0.5, 12);
  expect(c1.p2.x).toBeCloseTo(5 / 3 + 0.5, 12);
  expect(c1.p3.x).toBeCloseTo(2.5, 12);
  expect(c1.p3.y).toBeCloseTo(0.2, 12);

  expect(c0.p2.x).toBeCloseTo(2 / 3 + 0.5, 12);
  expect(c0.p2.y).toBeCloseTo(0.2, 12);
  expect(c0.p1.x).toBeCloseTo(1 / 3, 12);
  expect(c0.p1.y).toBeCloseTo(0, 12);

  const d0 = c0.getDerivative(1 as Curvilinear).normalized();
  const d1 = c1.getDerivative(0 as Curvilinear).normalized();
  expect(d0.x).toBeCloseTo(d1.x, 12);
  expect(d0.y).toBeCloseTo(d1.y, 12);

  editor.destroy();
});

test("dragging the first edge drags the next curve's supplementary p1 for continuity", () => {
  const { editor } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;

  const sel = editor.getSelectedCurvesFor(editor.getSequences()[0]);
  sel.clear();
  sel.add(0);
  const delta = new Vector(0.4, -0.3);
  editorRef(editor).translateSelectedCurves(delta);

  expect(c0.p3.x).toBeCloseTo(1.4, 12);
  expect(c0.p3.y).toBeCloseTo(-0.3, 12);

  expect(c1.p1.x).toBeCloseTo(4 / 3 + 0.4, 12);
  expect(c1.p1.y).toBeCloseTo(-0.3, 12);
  expect(c1.p2.x).toBeCloseTo(5 / 3, 12);
  expect(c1.p2.y).toBeCloseTo(0, 12);

  const d0 = c0.getDerivative(1 as Curvilinear).normalized();
  const d1 = c1.getDerivative(0 as Curvilinear).normalized();
  expect(d0.x).toBeCloseTo(d1.x, 12);
  expect(d0.y).toBeCloseTo(d1.y, 12);

  editor.destroy();
});

test("dragging one of several selected curves moves them all", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.addCurveEnd(new Curve(new Vector(4, 0), new Vector(16 / 3, 0), new Vector(20 / 3, 0), new Vector(8, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  const sel = editor.getSelectedCurvesFor(editor.getSequences()[0]);
  sel.clear();
  sel.add(0);
  sel.add(1);
  expect(sel.size).toBe(2);

  const startX = sx(5);
  const startY = sy(0);
  mouse("mousedown", canvas, { clientX: startX, clientY: startY, button: 0, ctrlKey: false });
  expect(sel.size).toBe(2);

  for (let i = 1; i <= 6; i++) {
    mouse("mousemove", window, { clientX: startX + i * 4, clientY: startY - i * 3 });
  }
  mouse("mouseup", window, {});

  const expectedX = 24 / zoom;
  const expectedY = 18 / zoom;
  expect(c0.p0.x).toBeCloseTo(expectedX, 6);
  expect(c0.p0.y).toBeCloseTo(expectedY, 6);
  expect(c1.p3.x).toBeCloseTo(8 + expectedX, 6);
  expect(c1.p3.y).toBeCloseTo(expectedY, 6);

  editor.destroy();
});

test("points and curves cannot be in the same multiple selection", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const state = editorRef(editor);
  const zoom = state.view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  const seq = state.getSequences()[0];
  expect(state.getSelectedPointsFor(seq).size).toBe(1);
  expect(state.getSelectedCurvesFor(seq).size).toBe(0);

  mouse("mousedown", canvas, { clientX: sx(1.5), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.getSelectedCurvesFor(seq).size).toBe(1);
  expect(state.getSelectedPointsFor(seq).size).toBe(0);

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.getSelectedPointsFor(seq).size).toBe(1);
  expect(state.getSelectedCurvesFor(seq).size).toBe(0);

  editor.destroy();
});

test("interaction works on every visible sequence and setSequences drops the hidden one's edit state", () => {
  const { editor, canvas } = makeEditor();

  const first = editor.getSequences()[0];
  const path2 = new Path();
  path2.addCurveEnd(new Curve(new Vector(0, 4), new Vector(1 / 3, 4), new Vector(2 / 3, 4), new Vector(1, 4)));
  const second = new Sequence(path2);
  editor.setSequences([first, second]);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(4), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(editor.getSelectedPointsFor(second).size).toBe(1);
  expect(editor.getSelectedPointsFor(first).size).toBe(0);

  editor.setSequences([first]);
  expect(editor.getSelectedPointsFor(second).size).toBe(0);
  expect(editor.getSelectedPointsFor(first).size).toBe(0);
  expect(editor.getSequences()).toHaveLength(1);

  editor.destroy();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editorRef(editor: Editor): any {
  return editor;
}

test("a joint shared by two curves moves once, not twice, during a group drag", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0);
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  const sel = editor.getSelectedPointsFor(editor.getSequences()[0]);
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
    expect(sx(c0.p3.x)).toBeCloseTo(tx, 0);
    expect(sy(c0.p3.y)).toBeCloseTo(ty, 0);
    const expectedX = 1 + (tx - startX) / zoom;
    const expectedY = -(ty - startY) / zoom;
    expect(c1.p0.x).toBeCloseTo(expectedX, 3);
    expect(c1.p0.y).toBeCloseTo(expectedY, 3);
  }
  mouse("mouseup", window, {});
  editor.destroy();
});

test("dragging an element by its segment keeps its real length constant", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.curves = [new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(5, 4), new Vector(50, 0))];
  path.updateLength();
  editorRef(editor).mode = "elements";

  const startU = (path.length * 0.2) as PathCoordinate;
  const endU = (path.length * 0.4) as PathCoordinate;
  const el = new LeftForwardOutsideThreeTurn("footL", startU, endU);
  editorRef(editor).getSequences()[0].elements.push(el);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  const midU = (startU + endU) / 2;
  const mid = path.getPosition(midU as PathCoordinate);
  mouse("mousedown", canvas, { clientX: sx(mid.x), clientY: sy(mid.y), button: 0, ctrlKey: false });
  expect(editorRef(editor).isDraggingElementSegment).toBe(true);

  const initial = path.arcLengthBetween(el.start, el.end);

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
}, 20000);

test("dragging an element by its segment moves it toward the start of the path", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.curves = [new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(5, 4), new Vector(50, 0))];
  path.updateLength();
  editorRef(editor).mode = "elements";

  const startU = (path.length * 0.5) as PathCoordinate;
  const endU = (path.length * 0.7) as PathCoordinate;
  const el = new LeftForwardOutsideThreeTurn("footL", startU, endU);
  editorRef(editor).getSequences()[0].elements.push(el);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  const midU = (startU + endU) / 2;
  const mid = path.getPosition(midU as PathCoordinate);
  mouse("mousedown", canvas, { clientX: sx(mid.x), clientY: sy(mid.y), button: 0, ctrlKey: false });
  expect(editorRef(editor).isDraggingElementSegment).toBe(true);

  const initial = path.arcLengthBetween(el.start, el.end);

  for (let i = 1; i <= 40; i++) {
    const u = path.length * (0.5 - (i / 40) * 0.4);
    const p = path.getPosition(u as PathCoordinate);
    mouse("mousemove", window, { clientX: sx(p.x), clientY: sy(p.y), button: 0 });
  }
  mouse("mouseup", window, {});

  expect(el.start as number).toBeLessThan(startU as number);
  expect(el.end as number).toBeLessThan(endU as number);
  expect(path.arcLengthBetween(el.start, el.end)).toBeCloseTo(initial, 6);
  editor.destroy();
});

test("clicking the delete button next to a selected element removes it", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequences()[0].path;
  path.curves = [new Curve(new Vector(0, 0), new Vector(4 / 3, 0), new Vector(8 / 3, 0), new Vector(4, 0))];
  path.updateLength();
  editorRef(editor).mode = "elements";

  const startU = (path.length * 0.2) as PathCoordinate;
  const endU = (path.length * 0.6) as PathCoordinate;
  const el = new LeftForwardOutsideThreeTurn("footL", startU, endU);
  editorRef(editor).getSequences()[0].elements.push(el);

  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  expect(editorRef(editor).getElementDeleteButtonPosition()).toBeNull();

  const midU = (startU + endU) / 2;
  const mid = path.getPosition(midU as PathCoordinate);
  mouse("mousedown", canvas, { clientX: sx(mid.x), clientY: sy(mid.y), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(editorRef(editor).selectedElements.has(el)).toBe(true);
  expect(editorRef(editor).getElementDeleteButtonPosition()).not.toBeNull();

  const btn = editorRef(editor).getElementDeleteButtonPosition();
  mouse("mousedown", canvas, { clientX: sx(btn.x), clientY: sy(btn.y), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});

  expect(editorRef(editor).getSequences()[0].elements).not.toContain(el);
  expect(editorRef(editor).selectedElements.has(el)).toBe(false);
  expect(editorRef(editor).getElementDeleteButtonPosition()).toBeNull();

  editor.destroy();
});

test("a stroke label anchors between the stroke end and the following element start", () => {
  const { editor } = makeEditor();
  editorRef(editor).mode = "elements";
  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));

  const stroke = new LeftNormalForwardInsideGlide(0.2 as PathCoordinate, 0.6 as PathCoordinate);
  const following = new LeftForwardOutsideGlide(1.2 as PathCoordinate, 1.6 as PathCoordinate);
  sequence.addElement(stroke);
  sequence.addElement(following);
  editor.draw();

  const geometry = editorRef(editor).getElementLabelGeometry(sequence, stroke);
  const anchorU = ((stroke.end as number) + (following.start as number)) / 2;
  const expected = path.getPosition(anchorU as PathCoordinate);
  expect(geometry.point.x).toBeCloseTo(expected.x, 9);
  expect(geometry.point.y).toBeCloseTo(expected.y, 9);

  const spanMid = path.getPosition((((stroke.start as number) + (stroke.end as number)) / 2) as PathCoordinate);
  expect(geometry.point.x).not.toBeCloseTo(spanMid.x, 3);

  editor.destroy();
});

test("a stroke with no following element anchors its label at the path end", () => {
  const { editor } = makeEditor();
  editorRef(editor).mode = "elements";
  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  const stroke = new LeftNormalForwardInsideGlide(0.2 as PathCoordinate, 0.6 as PathCoordinate);
  sequence.addElement(stroke);
  editor.draw();

  const geometry = editorRef(editor).getElementLabelGeometry(sequence, stroke);
  // The path end substitutes for the following element start in the midpoint.
  const anchorU = ((stroke.end as number) + path.length) / 2;
  const expected = path.getPosition(anchorU as PathCoordinate);
  expect(geometry.point.x).toBeCloseTo(expected.x, 9);
  expect(geometry.point.y).toBeCloseTo(expected.y, 9);
  // The anchor lies past the stroke end, before the path end, and past the
  // span center, so the fallback anchor is discriminated from other choices.
  expect(geometry.point.x).toBeGreaterThan(stroke.end as number);
  expect(geometry.point.x).toBeLessThan(path.length);
  expect(geometry.point.x).toBeGreaterThan(0.4);

  editor.destroy();
});

test("a crossed stroke draws a second 12px label anchored to the element middle, shifted inside", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  ctx.fillText = (text: string, x: number, y: number) => {
    drawn.push({ text, x, y, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const crossed = new (glideConstructorsByType["LeftCrossedBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, 0.6 as PathCoordinate);
  const crossedBack = new (glideConstructorsByType["LeftCrossedBackBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.7 as PathCoordinate, 1.0 as PathCoordinate);
  sequence.addElement(crossed);
  sequence.addElement(crossedBack);
  editor.draw();

  const crossedLabels = drawn.filter((label) => label.text === "XF" || label.text === "XB");
  expect(crossedLabels.map((label) => label.text)).toEqual(["XF", "XB"]);

  const mainLabels = drawn.filter((label) => label.text === "LBI");
  expect(mainLabels.length).toBe(2);
  const px = (font: string) => Number(font.replace("px sans-serif", ""));
  expect(px(crossedLabels[0]!.font) * 14).toBeCloseTo(px(mainLabels[0]!.font) * 12, 9);

  // Anchors sit on the path line, so the inside shift mirrors the main label:
  // the crossed label is on the opposite side of the path.
  expect(crossedLabels[0]!.x).toBeCloseTo(0.4 * 20, 6);
  expect(crossedLabels.map((label) => label.y)).toEqual(mainLabels.map((label) => -label.y));

  editor.destroy();
});

test("a forward crossed stroke draws no cross label when the curvature keeps its sign", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  ctx.fillText = (text: string, x: number, y: number) => {
    drawn.push({ text, x, y, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const forward = new (glideConstructorsByType["LeftCrossedForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, 0.4 as PathCoordinate);
  const forwardBack = new (glideConstructorsByType["LeftCrossedBackForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.45 as PathCoordinate, 0.65 as PathCoordinate);
  const backward = new (glideConstructorsByType["LeftCrossedBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.7 as PathCoordinate, 0.9 as PathCoordinate);
  sequence.addElement(forward);
  sequence.addElement(forwardBack);
  sequence.addElement(backward);
  editor.draw();

  const crossedLabels = drawn.filter((label) => ["XF", "XB", "XS"].includes(label.text));
  expect(crossedLabels.map((label) => label.text)).toEqual(["XB", "XF"]);

  editor.destroy();
});

test("an inflection point covered by an element draws no inflection label", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; font: string }[] = [];
  ctx.fillText = (text: string) => {
    drawn.push({ text, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  // Cubic with curvature numerator linear in t: inflects exactly at t = 0.5.
  path.curves = [new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 1), new Vector(3, 1))];
  path.updateLength();
  const curve = path.curves[0]!;
  expect(curve.getInflections()).toHaveLength(1);

  // The element spans the whole path, so it covers the inflection coordinate.
  sequence.addElement(new LeftForwardOutsideGlide(0 as PathCoordinate, path.length as PathCoordinate));
  editor.draw();

  expect(drawn.filter((label) => label.text === "CE")).toHaveLength(0);
  // Other labels are still drawn, so the single-curve path drew labels at all.
  expect(drawn.filter((label) => /px/.test(label.font)).length).toBeGreaterThan(0);

  editor.destroy();
});

test("an uncovered inflection point draws one small inflection label", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; font: string }[] = [];
  ctx.fillText = (text: string) => {
    drawn.push({ text, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  // Cubic with curvature numerator linear in t: inflects exactly at t = 0.5.
  path.curves = [new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 1), new Vector(3, 1))];
  path.updateLength();
  const curve = path.curves[0]!;
  expect(curve.getInflections()).toHaveLength(1);
  const inflectionU = curve.getUniformCoordFromCurvilinear(curve.getInflections()[0]!);
  expect(inflectionU).toBeGreaterThan(0);

  // The element ends before the inflection coordinate, so no element covers it.
  sequence.addElement(new LeftForwardOutsideGlide(0 as PathCoordinate, (inflectionU - 0.1) as PathCoordinate));
  editor.draw();

  const inflectionLabels = drawn.filter((label) => label.text === "CE");
  expect(inflectionLabels).toHaveLength(1);

  const px = (font: string) => Number(font.replace("px sans-serif", ""));
  const mainLabels = drawn.filter((label) => label.text === "LFO");
  expect(mainLabels.length).toBeGreaterThan(0);
  expect(px(inflectionLabels[0]!.font) * 14).toBeCloseTo(px(mainLabels[0]!.font) * 12, 9);

  editor.destroy();
});

test("a path joint whose curvature changes sign draws one uncovered CE label", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; font: string }[] = [];
  ctx.fillText = (text: string) => {
    drawn.push({ text, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  // Neither curve inflects, but the end curvature of the first curve (+9) and
  // the start curvature of the second curve (−18) have opposite signs.
  const first = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0.5), new Vector(3, 1.5));
  const second = new Curve(new Vector(3, 1.5), new Vector(4, 2.5), new Vector(5, 2.5), new Vector(6, 2));
  path.curves = [first, second];
  path.updateLength();
  expect(first.getCurvature(1 as Curvilinear) * second.getCurvature(0 as Curvilinear)).toBeLessThan(0);
  expect(first.getInflections()).toHaveLength(0);
  expect(second.getInflections()).toHaveLength(0);

  // No elements, so the joint is uncovered and draws exactly one CE label.
  editor.draw();
  expect(drawn.filter((label) => label.text === "CE")).toHaveLength(1);

  editor.destroy();
});

test("a path joint covered by an element draws no CE label", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; font: string }[] = [];
  ctx.fillText = (text: string) => {
    drawn.push({ text, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  const first = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0.5), new Vector(3, 1.5));
  const second = new Curve(new Vector(3, 1.5), new Vector(4, 2.5), new Vector(5, 2.5), new Vector(6, 2));
  path.curves = [first, second];
  path.updateLength();
  expect(first.getCurvature(1 as Curvilinear) * second.getCurvature(0 as Curvilinear)).toBeLessThan(0);

  // The element spans the whole path, so it covers the joint coordinate.
  sequence.addElement(new LeftForwardOutsideGlide(0 as PathCoordinate, path.length as PathCoordinate));
  editor.draw();
  expect(drawn.filter((label) => label.text === "CE")).toHaveLength(0);

  editor.destroy();
});

test("a path joint whose curvature keeps its sign draws no CE label", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; font: string }[] = [];
  ctx.fillText = (text: string) => {
    drawn.push({ text, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  // Both curves bend the same way around the joint (+9 and +9).
  const first = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0.5), new Vector(3, 1.5));
  const second = new Curve(new Vector(3, 1.5), new Vector(4, 2.5), new Vector(5, 4), new Vector(6, 6));
  path.curves = [first, second];
  path.updateLength();
  expect(first.getCurvature(1 as Curvilinear) * second.getCurvature(0 as Curvilinear)).toBeGreaterThan(0);
  expect(first.getInflections()).toHaveLength(0);
  expect(second.getInflections()).toHaveLength(0);

  editor.draw();
  expect(drawn.filter((label) => label.text === "CE")).toHaveLength(0);

  editor.destroy();
});

test("a curvature sign change draws XS for forward crossed strokes and replaces XB for backward crossed-back ones", () => {
  const { editor, canvas } = makeEditor();
  editorRef(editor).mode = "elements";
  const ctx = canvas.getContext() as unknown as Record<string, unknown>;
  const drawn: { text: string; x: number; y: number; font: string }[] = [];
  ctx.fillText = (text: string, x: number, y: number) => {
    drawn.push({ text, x, y, font: String(ctx.font) });
  };

  const sequence = editor.getSequences()[0];
  const curve = sequence.path.curves[0]!;
  curve.p1 = new Vector(1 / 3, 0.3);
  curve.p2 = new Vector(2 / 3, 0.3);
  sequence.path.updateLength();
  sequence.path.addCurveEnd(
    new Curve(new Vector(1, 0), new Vector(4 / 3, -0.3), new Vector(5 / 3, -0.3), new Vector(2, 0)),
  );
  const firstCurve = sequence.path.curves[0]!;
  const secondCurve = sequence.path.curves[1]!;
  const endU = (firstCurve.length + secondCurve.length / 2) as PathCoordinate;

  const forward = new (glideConstructorsByType["LeftCrossedForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, endU);
  const backwardBack = new (glideConstructorsByType["LeftCrossedBackBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, endU);
  const backward = new (glideConstructorsByType["LeftCrossedBackwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, endU);
  const forwardBack = new (glideConstructorsByType["LeftCrossedBackForwardInsideGlide"] as unknown as new (
    start: number,
    end: number,
  ) => LeftNormalForwardInsideGlide)(0.2 as PathCoordinate, endU);
  sequence.addElement(forward);
  sequence.addElement(backwardBack);
  sequence.addElement(backward);
  sequence.addElement(forwardBack);
  editor.draw();

  const crossedLabels = drawn.filter((label) => ["XF", "XB", "XS"].includes(label.text));
  expect(crossedLabels.map((label) => label.text)).toEqual(["XS", "XS", "XF", "XB"]);

  editor.destroy();
});

test("a glide label keeps the span midpoint anchor", () => {
  const { editor } = makeEditor();
  editorRef(editor).mode = "elements";
  const sequence = editor.getSequences()[0];
  const path = sequence.path;
  const glide = new LeftForwardOutsideGlide(0.2 as PathCoordinate, 0.6 as PathCoordinate);
  sequence.addElement(glide);
  editor.draw();

  const geometry = editorRef(editor).getElementLabelGeometry(sequence, glide);
  const mid = path.getPosition(0.4 as PathCoordinate);
  expect(geometry.point.x).toBeCloseTo(mid.x, 9);
  expect(geometry.point.y).toBeCloseTo(mid.y, 9);

  editor.destroy();
});

test("a zero-size element does not hang drawing and picking in elements mode", () => {
  const { editor } = makeEditor();
  editor.mode = "elements";
  const path = editor.getSequences()[0].path;
  editor.getSequences()[0].addElement(new LeftForwardOutsideGlide(0.5 as PathCoordinate, 0.5 as PathCoordinate));
  const start = Date.now();
  editor.draw();
  const cursor = editorRef(editor).screenToWorld(512, 512);
  expect(editorRef(editor).pickElement(512, 512)).toBeNull();
  expect(cursor).not.toBeNull();
  expect(Date.now() - start).toBeLessThan(5000);
  expect(path.length).toBeCloseTo(1);
  editor.destroy();
});
