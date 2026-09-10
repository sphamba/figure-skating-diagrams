import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Vector } from "../src/engine/vector";
import { LeftForwardOutsideThreeTurn } from "../src/engine/element/threeTurn";
import { LeftForwardOutsideGlide } from "../src/engine/element/glide";

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
  "scale", "clearRect", "save", "restore", "beginPath", "moveTo", "lineTo",
  "bezierCurveTo", "stroke", "fill", "arc", "fillRect", "strokeRect", "translate",
  "setTransform", "closePath", "rect", "fillText",
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

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  mouse("mousedown", canvas, { clientX: sx(1), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(editorRef(editor).selected.size).toBe(2);

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
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0);

  const sel = editorRef(editor).selectedCurves;
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
  const path = editor.getSequence().path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;

  const sel = editorRef(editor).selectedCurves;
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
  const path = editor.getSequence().path;
  path.addCurveEnd(new Curve(new Vector(4, 0), new Vector(16 / 3, 0), new Vector(20 / 3, 0), new Vector(8, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  const sel = editorRef(editor).selectedCurves;
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
  const path = editor.getSequence().path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const state = editorRef(editor);
  const zoom = state.view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(state.selected.size).toBe(1);
  expect(state.selectedCurves.size).toBe(0);

  mouse("mousedown", canvas, { clientX: sx(1.5), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.selectedCurves.size).toBe(1);
  expect(state.selected.size).toBe(0);

  mouse("mousedown", canvas, { clientX: sx(0), clientY: sy(0), button: 0, ctrlKey: true });
  mouse("mouseup", window, {});
  expect(state.selected.size).toBe(1);
  expect(state.selectedCurves.size).toBe(0);

  editor.destroy();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editorRef(editor: Editor): any {
  return editor;
}

test("a joint shared by two curves moves once, not twice, during a group drag", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
  path.addCurveEnd(new Curve(new Vector(1, 0), new Vector(4 / 3, 0), new Vector(5 / 3, 0), new Vector(2, 0)));
  const c0 = path.curves[0]!;
  const c1 = path.curves[1]!;
  expect(c0.p3).toBe(c1.p0);
  const zoom = editorRef(editor).view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const sy = (wy: number) => 512 - wy * zoom;

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
});

test("clicking the delete button next to a selected element removes it", () => {
  const { editor, canvas } = makeEditor();
  const path = editor.getSequence().path;
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

  expect(editorRef(editor).sequence.elements).not.toContain(el);
  expect(editorRef(editor).selectedElements.has(el)).toBe(false);
  expect(editorRef(editor).getElementDeleteButtonPosition()).toBeNull();

  editor.destroy();
});

test("a zero-size element does not hang drawing and picking in elements mode", () => {
  const { editor } = makeEditor();
  editor.mode = "elements";
  const path = editor.getSequence().path;
  editor.getSequence().addElement(
    new LeftForwardOutsideGlide(0.5 as PathCoordinate, 0.5 as PathCoordinate),
  );
  const start = Date.now();
  editor.draw();
  const cursor = editorRef(editor).screenToWorld(512, 512);
  expect(editorRef(editor).pickElement(512, 512)).toBeNull();
  expect(cursor).not.toBeNull();
  expect(Date.now() - start).toBeLessThan(5000);
  expect(path.length).toBeCloseTo(1);
  editor.destroy();
});
