import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

/** Build a simple known path: a straight 1 m line along the X axis. */
function makeStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)),
  );
  return path;
}

test("addSegmentEnd appends a 1 m straight curve", () => {
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
  expect(lastCurve.length).toBeCloseTo(1, 2);
});

test("new end curve keeps the end derivative and aligns control points at 1/2 and 1/2", () => {
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

  // Segment end is 1 m away along the end derivative.
  const dir = endDerivative;
  expect(lastCurve.p3.x).toBeCloseTo(endPosition.x + dir.x);
  expect(lastCurve.p3.y).toBeCloseTo(endPosition.y + dir.y);

  // Both control points sit at 1/2 along the same straight line.
  expect(lastCurve.p1.x).toBeCloseTo(endPosition.x + dir.x / 2);
  expect(lastCurve.p1.y).toBeCloseTo(endPosition.y + dir.y / 2);
  expect(lastCurve.p2.x).toBeCloseTo(endPosition.x + dir.x / 2);
  expect(lastCurve.p2.y).toBeCloseTo(endPosition.y + dir.y / 2);

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
