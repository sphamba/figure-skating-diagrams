import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { TimingKeyframe } from "../src/engine/keyframe";
import { Vector } from "../src/engine/vector";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Editor } from "../src/engine/sequenceEditor/editor";
import { Diagram, type DiagramJSON } from "../src/engine/diagram";
import { sequenceTimeRange } from "../src/engine/sequence";

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

function makeEditor(withTime: boolean) {
  const calls: string[] = [];
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const m of CTX_METHODS) {
    ctx[m] = () => calls.push(m);
  }
  ctx.measureText = () => ({ width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { getContext: () => unknown };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });

  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  const sequence = new Sequence(path);
  if (withTime) {
    sequence.addKeyframe("time", new TimingKeyframe(0 as PathCoordinate, "time", 0));
    sequence.addKeyframe("time", new TimingKeyframe(path.length as PathCoordinate, "time", 10));
  }
  const editor = new Editor(canvas, [sequence]);
  editor.mode = "view";
  return { editor, calls };
}

const counts = (calls: string[]) => ({
  clearRect: calls.filter((c) => c === "clearRect").length,
  save: calls.filter((c) => c === "save").length,
  restore: calls.filter((c) => c === "restore").length,
  scale: calls.filter((c) => c === "scale").length,
  stroke: calls.filter((c) => c === "stroke").length,
  beginPath: calls.filter((c) => c === "beginPath").length,
  bezierCurveTo: calls.filter((c) => c === "bezierCurveTo").length,
  moveTo: calls.filter((c) => c === "moveTo").length,
  lineTo: calls.filter((c) => c === "lineTo").length,
});

test("draw range below 1 renders partial beziers and keeps transforms balanced", async () => {
  const { editor, calls } = makeEditor(true);
  editor.videoTimeSeconds = 5;
  editor.drawRange = 0.25;
  editor.draw();
  // Wait for any queued animation frame, then measure one more clean draw.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const baseline = calls.length;
  editor.draw();
  const frame = calls.slice(baseline);
  const c = counts(frame);
  // Transforms stay balanced: a mid-frame error must never leave ctx.save() on the stack.
  expect(c.restore).toBe(c.save);
  // The range stroke and the clipped traces both render.
  expect(c.stroke).toBeGreaterThan(0);
  expect(c.beginPath).toBeGreaterThan(0);
  expect(c.bezierCurveTo).toBeGreaterThan(0);
});

test("draw range below 1 draws fewer trace samples than the full extent", async () => {
  const { readFileSync } = await import("fs");
  const path = "./public/diagrams/moves-in-the-field/pre_preliminary_4.json";
  const json = JSON.parse(readFileSync(path, "utf-8")) as DiagramJSON;
  const diagram = Diagram.fromJSON(json);
  const sequence = diagram.sequences[0]!;

  const draw = (range: number | undefined) => {
    const setup = makeEditor(true);
    const editor = setup.editor;
    editor.setSequences(diagram.sequences);
    editor.videoTimeSeconds = sequenceTimeRange(sequence, 120)![0]! + 0.1;
    if (range !== undefined) editor.drawRange = range;
    const before = setup.calls.length;
    editor.draw();
    return setup.calls.slice(before);
  };

  const full = counts(draw(undefined));
  const clipped = counts(draw(0.1));
  expect(full.lineTo).toBeGreaterThan(0);
  expect(clipped.lineTo).toBeGreaterThan(0);
  expect(clipped.lineTo).toBeLessThan(full.lineTo);
});
