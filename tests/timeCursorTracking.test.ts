import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { TimingKeyframe } from "../src/engine/keyframe";
import { Vector } from "../src/engine/vector";
import type { PathCoordinate } from "../src/engine/coordinates";
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

function makeEditor(sequences: Sequence[]) {
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const method of CTX_METHODS) ctx[method] = () => {};
  ctx.measureText = () => ({ width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { getContext: () => unknown };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });
  const editor = new Editor(canvas, sequences);
  editor.mode = "view";
  return { editor, canvas };
}

// A one metre path along x from the offset, with time running 0 s to 10 s over
// the full length, so the cursor sits at u = seconds / 10 along the path.
function timedSequenceAt(x: number, y: number): Sequence {
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(x, y), new Vector(x + 1 / 3, y), new Vector(x + 2 / 3, y), new Vector(x + 1, y)),
  );
  const sequence = new Sequence(path);
  sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
  sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 10));
  return sequence;
}

const viewOf = (editor: Editor) => (editor as unknown as { view: { center: Vector } }).view;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("followTimeCursor centers the view on the cursor and enables tracking", async () => {
  const { editor } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  const view = viewOf(editor);
  editor.followTimeCursor();
  expect(editor.tracking).toBe(true);
  // The move animates, so the first frame stays near the old center.
  editor.draw();
  expect(view.center.x).toBeLessThan(0.5);
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(0, 3);
  editor.destroy();
});

test("tracking follows the cursor with no lag while the time moves", async () => {
  const { editor } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.center.x).toBeCloseTo(0.5, 3);
  editor.videoTimeSeconds = 2;
  editor.requestDraw();
  await wait(60);
  expect(view.center.x).toBeCloseTo(0.2, 3);
  editor.destroy();
});

test("panning the canvas manually disables tracking", async () => {
  const { editor, canvas } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(editor.tracking).toBe(true);
  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 512, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 612, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mouseup", {}));
  expect(editor.tracking).toBe(false);
  const panned = { x: view.center.x, y: view.center.y };
  editor.videoTimeSeconds = 2;
  editor.requestDraw();
  await wait(60);
  expect(view.center.x).toBeCloseTo(panned.x, 3);
  expect(view.center.y).toBeCloseTo(panned.y, 3);
  editor.destroy();
});

test("hiding a sequence animates the move to the new barycenter", async () => {
  const sequenceA = timedSequenceAt(0, 0);
  const sequenceB = timedSequenceAt(0, 10);
  const { editor } = makeEditor([sequenceA, sequenceB]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(5, 3);
  editor.setHiddenSequences(new Set([sequenceB]));
  // Mid-animation: the view eases toward the remaining cursor.
  await wait(80);
  editor.draw();
  expect(view.center.y).toBeGreaterThan(0.1);
  expect(view.center.y).toBeLessThan(4.9);
  expect(view.center.x).toBeCloseTo(0.5, 1);
  await wait(400);
  editor.draw();
  expect(view.center.y).toBeCloseTo(0, 3);
  editor.destroy();
});

test("stops mid-animation when no cursor is visible and animates again when one returns", async () => {
  const sequenceA = timedSequenceAt(0, 0);
  const sequenceB = timedSequenceAt(0, 10);
  const { editor } = makeEditor([sequenceA, sequenceB]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(80);
  editor.draw();
  const view = viewOf(editor);
  editor.setHiddenSequences(new Set([sequenceA, sequenceB]));
  const stopped = { x: view.center.x, y: view.center.y };
  expect(stopped.y).toBeGreaterThan(0.05);
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(stopped.x, 3);
  expect(view.center.y).toBeCloseTo(stopped.y, 3);
  editor.setHiddenSequences(new Set([]));
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(5, 3);
  editor.destroy();
});
