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
  "rotate",
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

const viewOf = (editor: Editor) =>
  (editor as unknown as { view: { center: Vector; rotation: number } }).view;

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

test("clicking again tracks each cursor upright, then returns to the barycenter", async () => {
  const sequenceA = timedSequenceAt(0, 0);
  const sequenceB = timedSequenceAt(0, 10);
  const { editor } = makeEditor([sequenceA, sequenceB]);
  editor.videoTimeSeconds = 5;
  const view = viewOf(editor);
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  expect(view.rotation).toBeCloseTo(0, 5);
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(5, 3);

  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(0, 3);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);

  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(10, 3);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);

  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  expect(view.center.x).toBeCloseTo(0.5, 3);
  expect(view.center.y).toBeCloseTo(5, 3);
  expect(view.rotation).toBeCloseTo(0, 3);
  editor.destroy();
});

test("the tracked cursor rotation eases instead of jumping", async () => {
  const { editor } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  const view = viewOf(editor);
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  editor.followTimeCursor();
  await wait(80);
  editor.draw();
  expect(view.rotation).toBeGreaterThan(0.1);
  expect(view.rotation).toBeLessThan(Math.PI / 2);
  await wait(400);
  editor.draw();
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);
  editor.destroy();
});

test("panning while a cursor is tracked restores the rotation smoothly", async () => {
  const { editor, canvas } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(400);
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);
  expect(editor.tracking).toBe(true);

  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 512, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 612, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mouseup", {}));
  expect(editor.tracking).toBe(false);
  const panned = { x: view.center.x, y: view.center.y };
  await wait(60);
  editor.draw();
  expect(view.rotation).toBeGreaterThan(0.1);
  expect(view.rotation).toBeLessThan(Math.PI / 2);
  await wait(400);
  editor.draw();
  expect(view.rotation).toBeCloseTo(0, 3);
  expect(view.center.x).toBeCloseTo(panned.x, 3);
  expect(view.center.y).toBeCloseTo(panned.y, 3);
  editor.videoTimeSeconds = 2;
  editor.requestDraw();
  await wait(60);
  expect(view.center.x).toBeCloseTo(panned.x, 3);
  editor.destroy();
});

test("pinch panning keeps the panned center while the rotation restores", async () => {
  const { editor } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  await wait(400);
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);

  const pinch = (editor as unknown as { pinchZoomAndPan(touches: unknown[]): void }).pinchZoomAndPan.bind(editor);
  pinch([
    { clientX: 512, clientY: 412 },
    { clientX: 612, clientY: 412 },
  ]);
  pinch([
    { clientX: 512, clientY: 512 },
    { clientX: 612, clientY: 512 },
  ]);
  // The touch end cancels the suspended tracking and restores the rotation.
  expect(editor.tracking).toBe(true);
  (editor as unknown as { handleMouseUp(): void }).handleMouseUp();
  expect(editor.tracking).toBe(false);
  await wait(400);
  editor.draw();
  expect(view.rotation).toBeCloseTo(0, 3);
  const panned = { x: view.center.x, y: view.center.y };
  editor.videoTimeSeconds = 2;
  editor.requestDraw();
  await wait(60);
  expect(view.center.x).toBeCloseTo(panned.x, 3);
  expect(view.center.y).toBeCloseTo(panned.y, 3);
  editor.destroy();
});

test("the rotated view round-trips between screen and world coordinates", () => {
  const { editor } = makeEditor([]);
  const access = editor as unknown as {
    screenToWorld(screenX: number, screenY: number): Vector;
    worldToScreen(world: Vector): [number, number];
  };
  const view = viewOf(editor);
  const points = [new Vector(0, 0), new Vector(-2, 1.5), new Vector(4, -3)];
  const views: [number, number][] = [
    [0, 100],
    [Math.PI / 2, 150],
    [-Math.PI / 3, 40],
    [Math.PI, 500],
  ];
  for (const [rotation, zoom] of views) {
    view.rotation = rotation;
    view.zoom = zoom;
    for (const point of points) {
      const [screenX, screenY] = access.worldToScreen(point);
      const world = access.screenToWorld(screenX, screenY);
      expect(world.x).toBeCloseTo(point.x, 6);
      expect(world.y).toBeCloseTo(point.y, 6);
    }
  }
  editor.destroy();
});

test("trackingStage reports the cycle stage through clicks and pan", async () => {
  const { editor, canvas } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  expect(editor.trackingStage).toBe("off");
  editor.followTimeCursor();
  expect(editor.trackingStage).toBe("barycenter");
  editor.followTimeCursor();
  expect(editor.trackingStage).toBe("cursor");
  editor.followTimeCursor();
  expect(editor.trackingStage).toBe("barycenter");
  editor.followTimeCursor();
  expect(editor.trackingStage).toBe("cursor");
  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 512, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 612, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mouseup", {}));
  expect(editor.trackingStage).toBe("off");
  editor.destroy();
});

test("dragging a time cursor freezes tracking and resumes on release", async () => {
  const { editor, canvas } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);
  expect(view.center.x).toBeCloseTo(0.5, 3);
  const access = editor as unknown as { worldToScreen(world: Vector): [number, number] };
  const [cursorX, cursorY] = access.worldToScreen(new Vector(0.5, 0));

  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: cursorX, clientY: cursorY }));
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: cursorX - 40, clientY: cursorY }));
  expect(editor.tracking).toBe(true);
  const frozen = { x: view.center.x, y: view.center.y, rotation: view.rotation };
  expect(editor.videoTimeSeconds).not.toBe(5);
  editor.videoTimeSeconds = editor.videoTimeSeconds ?? 5;
  editor.requestDraw();
  await wait(60);
  editor.draw();
  expect(view.center.x).toBeCloseTo(frozen.x, 3);
  expect(view.center.y).toBeCloseTo(frozen.y, 3);
  expect(view.rotation).toBeCloseTo(frozen.rotation, 3);

  window.dispatchEvent(new MouseEvent("mouseup", {}));
  expect(editor.tracking).toBe(true);
  await wait(400);
  editor.draw();
  // The tracking resumes at the cursor the drag moved to, upright again.
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);
  expect(view.center.x).toBeCloseTo((editor.videoTimeSeconds ?? 0) / 10, 3);
  editor.destroy();
});

test("dragging the rink keeps tracking frozen until the mouse is released", async () => {
  const { editor, canvas } = makeEditor([timedSequenceAt(0, 0)]);
  editor.videoTimeSeconds = 5;
  editor.followTimeCursor();
  editor.followTimeCursor();
  await wait(400);
  editor.draw();
  const view = viewOf(editor);
  expect(view.rotation).toBeCloseTo(Math.PI / 2, 3);

  canvas.dispatchEvent(new MouseEvent("mousedown", { button: 2, clientX: 512, clientY: 512 }));
  expect(editor.tracking).toBe(true);
  const frozen = { x: view.center.x, y: view.center.y, rotation: view.rotation };
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 612, clientY: 512 }));
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: 712, clientY: 512 }));
  expect(editor.tracking).toBe(true);
  editor.videoTimeSeconds = 2;
  editor.requestDraw();
  await wait(60);
  editor.draw();
  expect(view.center.x).toBeCloseTo(frozen.x, 3);
  expect(view.center.y).toBeCloseTo(frozen.y + 200 / view.zoom, 3);
  expect(view.rotation).toBeCloseTo(frozen.rotation, 3);
  window.dispatchEvent(new MouseEvent("mouseup", {}));
  expect(editor.tracking).toBe(false);
  await wait(400);
  editor.draw();
  expect(view.rotation).toBeCloseTo(0, 3);
  editor.videoTimeSeconds = 5;
  editor.requestDraw();
  await wait(60);
  expect(view.center.y).toBeCloseTo(frozen.y + 200 / view.zoom, 3);
  editor.destroy();
});
