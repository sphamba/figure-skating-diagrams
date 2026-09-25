import { afterAll, expect, test, vi } from "vitest";
import { Editor } from "../src/engine/sequenceEditor/editor";
import { Sequence } from "../src/engine/sequence";
import { Curve } from "../src/engine/curve";
import { LeftNormalForwardInsideGlide } from "../src/engine/element/stroke";
import { TimingKeyframe } from "../src/engine/keyframe";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Vector } from "../src/engine/vector";
import { CTX_METHODS, makeStraightLengthOnePath } from "./helpers";

// A scheduled frame would append draws after the measured window, so the
// animation frame stays unscheduled and every test drives its own draws.
vi.stubGlobal("requestAnimationFrame", () => 0);

afterAll(() => {
  vi.unstubAllGlobals();
});

// One straight path translated to the (10,0)-(11,0) region: far enough from the
// rink center that central symmetry and the zoomed culling stay measurable.
// `timed` adds timing keyframes, so a video time cursor draws on the path.
function makeSequence(timed = false) {
  const path = makeStraightLengthOnePath();
  path.curves = [new Curve(new Vector(10, 0), new Vector(10 + 1 / 3, 0), new Vector(10 + 2 / 3, 0), new Vector(11, 0))];
  path.updateLength();
  const sequence = new Sequence(path);
  const glide = new LeftNormalForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
  sequence.elements.push(glide);
  sequence.updateElementKeyframes(glide);
  if (timed) {
    // The time cursor draws for times inside the keyframe range: 1 s to 3 s at
    // the default bpm of 120.
    sequence.keyframes.time.push(
      new TimingKeyframe(0.2 as PathCoordinate, "time", 1),
      new TimingKeyframe(0.8 as PathCoordinate, "beats", 4),
    );
  }
  return sequence;
}

const FLIP_SCALE = -1;

// The canvas editor draws during construction, so warm-up frames keep the
// measured draws on identical rink, culling, and label state.
function warmUp(editor: Editor, calls: string[], scaleArgs: number[][], frames = 4) {
  for (let index = 0; index < frames; index++) editor.draw();
  // The construction draw's label exits linger in real time and can complete
  // between two draws under suite load, so settling them keeps every measured
  // draw on the same settled label state.
  editor.finishLabelTransitions();
  calls.length = 0;
  scaleArgs.length = 0;
}

function makeEditor(sequences?: Sequence[]) {
  const calls: string[] = [];
  const scaleArgs: number[][] = [];
  const ctx: Record<string, unknown> = { width: 0, height: 0, globalAlpha: 1 };
  for (const method of [...CTX_METHODS, "arcTo", "clip", "closePath", "setLineDash"]) {
    ctx[method] = () => calls.push(method);
  }
  // The symmetric pass flips the context with scale(-1, -1), so the scale
  // arguments decide whether the pass drew.
  ctx.scale = (...args: number[]) => {
    calls.push("scale");
    scaleArgs.push(args);
  };
  ctx.measureText = () => ({ width: 40, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
  const canvas = document.createElement("canvas") as HTMLCanvasElement & { getContext: () => unknown };
  Object.defineProperty(canvas, "clientWidth", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "clientHeight", { value: 1024, configurable: true });
  Object.defineProperty(canvas, "getContext", { value: () => ctx, configurable: true });
  Object.defineProperty(canvas, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    configurable: true,
  });
  const editor = new Editor(canvas, sequences ?? []);
  editor.mode = "view";
  // New labels would add texts outside both passes, so they stay off here.
  editor.showLabels = false;
  return { editor, calls, scaleArgs };
}

// Every comparison runs inside one editor across two consecutive draws, so the
// labels lingering from the construction draw (their exits never advance under
// the stubbed frame) cancel out instead of polluting the stroke counts.
const flips = (scaleArgs: number[][]) =>
  scaleArgs.filter((args) => args[0] === FLIP_SCALE && args[1] === FLIP_SCALE).length;
const strokes = (calls: string[]) => calls.filter((call) => call === "stroke").length;
const lineTos = (calls: string[]) => calls.filter((call) => call === "lineTo").length;
const closePaths = (calls: string[]) => calls.filter((call) => call === "closePath").length;
const fillTexts = (calls: string[]) => calls.filter((call) => call === "fillText").length;

test("the symmetric option draws every foot trace a second time", () => {
  const { editor, calls, scaleArgs } = makeEditor([makeSequence()]);
  warmUp(editor, calls, scaleArgs);

  editor.draw();
  const plainStrokes = strokes(calls);
  const plainTexts = fillTexts(calls);
  const plainFlips = flips(scaleArgs);

  calls.length = 0;
  scaleArgs.length = 0;
  editor.symmetric = true;
  editor.draw();

  expect(plainFlips).toBe(0);
  // One mirrored pass per sequence, wrapped in scale(-1, -1).
  expect(flips(scaleArgs)).toBeGreaterThan(0);
  // The rink markings draw once, the traces draw twice, so the strokes grow.
  expect(strokes(calls)).toBeGreaterThan(plainStrokes);
  // Labels, time, and annotations never redraw in the second pass.
  expect(fillTexts(calls)).toBe(plainTexts);
  editor.destroy();
});

test("the zoomed culling mirrors through the center, so the mirrored half stays drawn", () => {
  // A zoomed view around (-10.5, 0) shows nothing of the curve at (10,0)-(11,0):
  // only the mirrored half can appear, and only when the culling box mirrors too.
  const { editor, calls, scaleArgs } = makeEditor([makeSequence()]);
  (editor as unknown as { view: unknown }).view = { center: new Vector(-10.5, 0), zoom: 2000, rotation: 0 };
  warmUp(editor, calls, scaleArgs);

  editor.draw();
  const culledStrokes = strokes(calls);

  calls.length = 0;
  scaleArgs.length = 0;
  editor.symmetric = true;
  editor.draw();
  // Without the mirrored culling box the second pass would wrongly skip every
  // curve, because the un-mirrored viewport holds nothing of the curve either.
  expect(strokes(calls)).toBeGreaterThan(culledStrokes);
  editor.destroy();
});

test("the mirrored pass culls traces that stay outside the mirrored view", () => {
  // A zoomed view around (30, 30) shows neither the curve nor its mirror, so
  // both passes stay culled and the two draws share the same stroke count.
  const { editor, calls, scaleArgs } = makeEditor([makeSequence()]);
  (editor as unknown as { view: unknown }).view = { center: new Vector(30, 30), zoom: 2000, rotation: 0 };
  warmUp(editor, calls, scaleArgs);

  editor.draw();
  const plainStrokes = strokes(calls);

  calls.length = 0;
  scaleArgs.length = 0;
  editor.symmetric = true;
  editor.draw();

  expect(strokes(calls)).toBe(plainStrokes);
  // The mirrored pass runs everywhere, it just draws nothing here.
  expect(flips(scaleArgs)).toBeGreaterThan(0);
  editor.destroy();
});

test("the edit modes show the mirrored ghost of the traces and path lines", () => {
  // One editor, one edit mode per draw pair: the ghost mirrors the traces and
  // the path line on top of the same editable path state.
  const modes = ["elements", "path"] as const;
  for (const mode of modes) {
    const { editor, calls, scaleArgs } = makeEditor([makeSequence()]);
    editor.mode = mode;
    warmUp(editor, calls, scaleArgs);

    editor.draw();
    const plainStrokes = strokes(calls);
    const plainFlips = flips(scaleArgs);
    expect(plainFlips).toBe(0);

    calls.length = 0;
    scaleArgs.length = 0;
    editor.symmetric = true;
    editor.draw();

    // The ghost mirrors through the rink center with one flip per sequence.
    expect(flips(scaleArgs)).toBeGreaterThan(0);
    // The ghost adds the mirrored path line and traces on top of the originals.
    expect(strokes(calls)).toBeGreaterThan(plainStrokes);
    editor.destroy();
  }
});

test("every drawn time cursor gets a passive symmetric outline in the same shape", () => {
  const { editor, calls, scaleArgs } = makeEditor([makeSequence(true)]);
  editor.symmetric = true;
  // The cursor draws for times inside the keyframe range: 1 s to 3 s at bpm 120.
  editor.videoTimeSeconds = 1.5;
  warmUp(editor, calls, scaleArgs);

  editor.draw();
  const cursorStrokes = strokes(calls);
  const cursorFlips = flips(scaleArgs);
  const cursorLineTos = lineTos(calls);
  const cursorClosePaths = closePaths(calls);

  calls.length = 0;
  scaleArgs.length = 0;
  // The cursor disappears: this draw keeps the same symmetric traces but no
  // symmetric cursor outline, because the short draw range is off and the
  // traces never depend on the time cursor.
  editor.videoTimeSeconds = null;
  editor.draw();
  const bareStrokes = strokes(calls);
  const bareFlips = flips(scaleArgs);
  const bareLineTos = lineTos(calls);
  const bareClosePaths = closePaths(calls);

  // Exactly two extra strokes: the symmetric half outlines, while the original
  // cursor keeps drawing with two fills instead of strokes.
  expect(cursorStrokes).toBe(bareStrokes + 2);
  // Exactly one extra flip: the cursor's own scale(-1, -1) wrapper.
  expect(cursorFlips).toBe(bareFlips + 1);
  // The with-cursor draw carries the two filled half triangles and the two
  // mirrored open polylines, so the lineTo delta is two lineTos per shape
  // (four shapes, a straight-line outline would sit at +4) and the closePath
  // delta is exactly two closed paths: only the filled halves close off,
  // while the mirrored outlines draw open with no centerline.
  expect(cursorLineTos).toBe(bareLineTos + 8);
  expect(cursorClosePaths).toBe(bareClosePaths + 2);
  editor.destroy();
});

test("every time cursor half carries the foot trace color of the sequence", () => {
  const sequence = makeSequence(true);
  sequence.traceColorL = "#123456";
  sequence.traceColorR = "#abcdef";
  const { editor, calls, scaleArgs } = makeEditor([sequence]);
  editor.symmetric = true;
  // The cursor draws for times inside the keyframe range: 1 s to 3 s at bpm 120.
  editor.videoTimeSeconds = 1.5;
  warmUp(editor, calls, scaleArgs);

  const fills: string[] = [];
  const styleStrokes: string[] = [];
  Object.defineProperty(editor.ctx, "fillStyle", {
    set: (value: string) => fills.push(String(value)),
    get: () => fills[fills.length - 1] ?? "",
  });
  Object.defineProperty(editor.ctx, "strokeStyle", {
    set: (value: string) => styleStrokes.push(String(value)),
    get: () => styleStrokes[styleStrokes.length - 1] ?? "",
  });
  editor.draw();
  editor.destroy();

  // The left and right halves of the plain cursor fill in the trace colors,
  // and the mirrored half outlines stroke in the same two colors.
  const cursorFill = fills.filter((fill) => fill === "rgba(18, 52, 86, 0.2)").length;
  const rightFill = fills.filter((fill) => fill === "rgba(171, 205, 239, 0.2)").length;
  const leftStroke = styleStrokes.filter((stroke) => stroke === "rgba(18, 52, 86, 0.2)").length;
  const rightStroke = styleStrokes.filter((stroke) => stroke === "rgba(171, 205, 239, 0.2)").length;
  expect(cursorFill).toBe(1);
  expect(rightFill).toBe(1);
  expect(leftStroke).toBe(1);
  expect(rightStroke).toBe(1);
});
