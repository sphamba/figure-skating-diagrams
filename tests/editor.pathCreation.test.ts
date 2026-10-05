import { expect, test, vi } from "vitest";
import { Curve } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Vector } from "../src/engine/vector";
import { Editor, type PathCreationState } from "../src/engine/sequenceEditor/editor";
import { CANVAS_SCALE } from "../src/engine/constants";
import { createStubCanvas, makeNoopContext } from "./helpers";

function makeEditor(sequences: Sequence[]): { editor: Editor; canvas: HTMLCanvasElement } {
  const canvas = createStubCanvas(makeNoopContext());
  const editor = new Editor(canvas, sequences);
  editor.mode = "path";
  return { editor, canvas };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editorRef(editor: Editor): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return editor as unknown as Record<string, any>;
}

function mouse(eventName: string, target: EventTarget, init: MouseEventInit) {
  target.dispatchEvent(new MouseEvent(eventName, init));
}

function screenMapping(editor: Editor): { sx: (wx: number) => number; sy: (wy: number) => number; zoom: number } {
  const zoom = editorRef(editor).view.zoom as number;
  return { sx: (wx: number) => 512 + wx * zoom, sy: (wy: number) => 512 - wy * zoom, zoom };
}

function click(editor: Editor, canvas: HTMLCanvasElement, wx: number, wy: number) {
  const { sx, sy } = screenMapping(editor);
  mouse("mousedown", canvas, { clientX: sx(wx), clientY: sy(wy), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
}

function state(editor: Editor): PathCreationState | null {
  return editor.getPathCreationState();
}

test("startSequenceCreation reports awaitStart with no curves and fires the change callback", () => {
  const { editor } = makeEditor([new Sequence(new Path())]);
  const onChange = vi.fn();
  editor.onPathCreationChange = onChange;

  editor.startSequenceCreation(editor.getSequences()[0]!);

  expect(state(editor)).toEqual({
    sequence: editor.getSequences()[0],
    isNew: true,
    phase: "awaitStart",
    curveCount: 0,
  });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(state(editor));
  editor.destroy();
});

test("the first click places the first anchor and switches to placing without a curve", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 1, 2);

  expect(state(editor)?.phase).toBe("placing");
  expect(state(editor)?.curveCount).toBe(0);
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(0);
  editor.destroy();
});

test("each placing click appends an anchor with auto-smooth rounded handles", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);

  const path = editor.getSequences()[0]!.path;
  expect(path.curves).toHaveLength(1);
  const curve = path.curves[0]!;
  expect(curve.p0.x).toBe(0);
  expect(curve.p3.x).toBe(3);
  for (const point of [curve.p0, curve.p1, curve.p2, curve.p3]) {
    expect(point.x * 1000).toBe(Math.round(point.x * 1000));
    expect(point.y * 1000).toBe(Math.round(point.y * 1000));
  }
  expect(curve.p1.x).toBeCloseTo(1, 3);
  expect(curve.p2.x).toBeCloseTo(2, 3);

  click(editor, canvas, 6, 2);
  expect(path.curves).toHaveLength(2);
  expect(state(editor)?.curveCount).toBe(2);
  editor.destroy();
});

test("interior joints stay G1-smooth across placements", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 1);
  click(editor, canvas, 6, 0);

  const curves = editor.getSequences()[0]!.path.curves;
  expect(curves).toHaveLength(2);
  const out = curves[0]!.p3.minus(curves[0]!.p2);
  const inComing = curves[1]!.p1.minus(curves[1]!.p0);
  expect(out.x * inComing.y - out.y * inComing.x).toBeCloseTo(0, 6);
  expect(inComing.x).toBeGreaterThan(0);
  editor.destroy();
});

test("a double click finishes without adding a duplicate point", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onChange = vi.fn();
  const onFinish = vi.fn();
  const onSequenceChange = vi.fn();
  editor.onPathCreationChange = onChange;
  editor.onSequenceCreationFinish = onFinish;
  editor.onSequenceChange = onSequenceChange;

  click(editor, canvas, 0, 0);
  click(editor, canvas, 4, 0);
  onChange.mockClear();
  const { sx, sy } = screenMapping(editor);
  mouse("mousedown", canvas, { clientX: sx(4) + 2, clientY: sy(0), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(editor.getSequences()[0]);
  expect(onSequenceChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(null);
  expect(state(editor)).toBeNull();
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(1);
  editor.destroy();
});

test("finishSequenceCreation is a no-op below two anchors", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onFinish = vi.fn();
  editor.onSequenceCreationFinish = onFinish;

  click(editor, canvas, 0, 0);
  expect(editor.finishSequenceCreation()).toBe(false);
  expect(onFinish).not.toHaveBeenCalled();
  expect(state(editor)?.phase).toBe("placing");

  click(editor, canvas, 4, 0);
  expect(editor.finishSequenceCreation()).toBe(true);
  expect(state(editor)).toBeNull();
  editor.destroy();
});

test("Backspace removes the last placed point and may return to awaitStart", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onChange = vi.fn();
  editor.onPathCreationChange = onChange;

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  click(editor, canvas, 6, 1);
  onChange.mockClear();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(1);
  expect(state(editor)?.phase).toBe("placing");
  expect(onChange).toHaveBeenCalledTimes(1);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(0);
  expect(state(editor)?.phase).toBe("awaitStart");
  expect(onChange).toHaveBeenCalledTimes(3);
  editor.destroy();
});

test("Delete removes the last placed point like Backspace", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(0);
  expect(state(editor)?.phase).toBe("placing");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(0);
  expect(state(editor)?.phase).toBe("awaitStart");
  editor.destroy();
});

test("Escape cancels a new sequence and fires the cancel callback", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onChange = vi.fn();
  const onCancel = vi.fn();
  editor.onPathCreationChange = onChange;
  editor.onSequenceCreationCancel = onCancel;

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  onChange.mockClear();

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

  expect(state(editor)).toBeNull();
  expect(onChange).toHaveBeenCalledWith(null);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledWith(editor.getSequences()[0]);
  editor.destroy();
});

test("switching the mode away from path cancels the creation", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onCancel = vi.fn();
  editor.onSequenceCreationCancel = onCancel;

  click(editor, canvas, 0, 0);
  editor.mode = "elements";

  expect(state(editor)).toBeNull();
  expect(onCancel).toHaveBeenCalledTimes(1);
  editor.destroy();
});

test("startSequenceExtension starts in placing and appends at the path end", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  const onChange = vi.fn();
  editor.onPathCreationChange = onChange;

  editor.startSequenceExtension(editor.getSequences()[0]!);

  expect(state(editor)).toMatchObject({ isNew: false, phase: "placing", curveCount: 1 });
  expect(onChange).toHaveBeenCalledTimes(1);

  click(editor, canvas, 6, 3);

  const curves = editor.getSequences()[0]!.path.curves;
  expect(curves).toHaveLength(2);
  expect(curves[1]!.p3.x).toBe(6);
  expect(curves[1]!.p3.y).toBe(3);
  expect(state(editor)?.curveCount).toBe(2);
  editor.destroy();
});

test("extension recomputes only the previous end handle and keeps the other handles untouched", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  const originalP1 = path.curves[0]!.p1.copy();
  const originalP0 = path.curves[0]!.p0.copy();

  editor.startSequenceExtension(editor.getSequences()[0]!);
  click(editor, canvas, 6, 3);

  const curve = editor.getSequences()[0]!.path.curves[0]!;
  expect(curve.p0.x).toBe(originalP0.x);
  expect(curve.p0.y).toBe(originalP0.y);
  expect(curve.p1.x).toBe(originalP1.x);
  expect(curve.p1.y).toBe(originalP1.y);
  // The old/new joint follows the Catmull-Rom tangent through the first new anchor.
  expect(curve.p2.x).toBeCloseTo(1, 3);
  expect(curve.p2.y).toBeCloseTo(-1, 3);

  const jointOut = curve.p3.minus(curve.p2);
  const jointIn = editor.getSequences()[0]!.path.curves[1]!.p1.minus(editor.getSequences()[0]!.path.curves[1]!.p0);
  expect(jointOut.x * jointIn.y - jointOut.y * jointIn.x).toBeCloseTo(0, 6);
  editor.destroy();
});

test("extension cancel restores the path exactly and notifies one sequence change", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  const snapshotJson = JSON.stringify(path.toJSON());
  const onCancel = vi.fn();
  const onSequenceChange = vi.fn();
  editor.onSequenceCreationCancel = onCancel;
  editor.onSequenceChange = onSequenceChange;

  editor.startSequenceExtension(editor.getSequences()[0]!);
  click(editor, canvas, 6, 3);
  onSequenceChange.mockClear();

  editor.cancelSequenceCreation();

  expect(state(editor)).toBeNull();
  expect(JSON.stringify(editor.getSequences()[0]!.path.toJSON())).toBe(snapshotJson);
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSequenceChange).toHaveBeenCalledTimes(1);
  editor.destroy();
});

test("extension Backspace never removes points below the snapshot", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  const snapshotJson = JSON.stringify(path.toJSON());

  editor.startSequenceExtension(editor.getSequences()[0]!);
  click(editor, canvas, 6, 0);
  click(editor, canvas, 9, 1);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(2);
  expect(state(editor)?.phase).toBe("placing");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(JSON.stringify(editor.getSequences()[0]!.path.toJSON())).toBe(snapshotJson);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  expect(JSON.stringify(editor.getSequences()[0]!.path.toJSON())).toBe(snapshotJson);
  editor.destroy();
});

test("extension finish fires the finish callback with one sequence change", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  const onFinish = vi.fn();
  const onCancel = vi.fn();
  const onSequenceChange = vi.fn();
  editor.onSequenceCreationFinish = onFinish;
  editor.onSequenceCreationCancel = onCancel;
  editor.onSequenceChange = onSequenceChange;

  editor.startSequenceExtension(editor.getSequences()[0]!);
  click(editor, canvas, 6, 0);
  onSequenceChange.mockClear();

  editor.finishSequenceCreation();

  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSequenceChange).toHaveBeenCalledTimes(1);
  expect(state(editor)).toBeNull();
  editor.destroy();
});

test("the add, delete and split buttons stay hidden while a creation is active", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  path.addCurveEnd(new Curve(new Vector(3, 0), new Vector(4, 0), new Vector(5, 0), new Vector(6, 0)));
  const sequence = new Sequence(path);
  const { editor } = makeEditor([sequence]);
  editorRef(editor).getSelectedPointsFor(sequence).add("0:p3");
  editor.draw();
  const before = editorRef(editor).drawnButtons as Array<{ kind: string }>;
  expect(before.some((button) => button.kind === "add")).toBe(true);
  expect(before.some((button) => button.kind === "delete")).toBe(true);

  editor.startSequenceExtension(sequence);
  editor.draw();
  const during = editorRef(editor).drawnButtons as Array<{ kind: string }>;
  expect(during.some((button) => button.kind === "add")).toBe(false);
  expect(during.some((button) => button.kind === "delete")).toBe(false);
  expect(during.some((button) => button.kind === "split")).toBe(false);
  editor.destroy();
});

test("a creation click ignores hit-testing and never selects a control point", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const other = new Sequence(new Path());
  other.path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(new Path()), other]);

  editor.startSequenceCreation(editor.getSequences()[0]!);
  click(editor, canvas, 0, 0);

  expect(editorRef(editor).selectedPoints.size).toBe(0);
  expect(editorRef(editor).selectedCurves.size).toBe(0);
  expect(state(editor)?.phase).toBe("placing");
  editor.destroy();
});

test("pan and zoom keep working while a creation is active", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const zoomBefore = screenMapping(editor).zoom;

  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, clientX: 512, clientY: 512, cancelable: true }));
  const zoomAfter = screenMapping(editor).zoom;
  expect(zoomAfter).not.toBe(zoomBefore);
  expect(state(editor)?.phase).toBe("awaitStart");
  expect(editor.getSequences()[0]!.path.curves).toHaveLength(0);

  const { sx, sy } = screenMapping(editor);
  mouse("mousedown", canvas, { clientX: sx(2), clientY: sy(1), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});
  expect(state(editor)?.phase).toBe("placing");
  editor.destroy();
});

test("an empty sequences list draws and handles interactions without throwing", () => {
  const { editor, canvas } = makeEditor([]);
  expect(() => editor.draw()).not.toThrow();
  expect(() => {
    mouse("mousedown", canvas, { clientX: 512, clientY: 512, button: 0, ctrlKey: false });
    mouse("mouseup", window, {});
  }).not.toThrow();
  expect(() => editor.draw()).not.toThrow();
  expect(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  }).not.toThrow();
  editor.destroy();
});

test("setSequences with an empty list clears an active creation silently", () => {
  const { editor } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const onCancel = vi.fn();
  const onChange = vi.fn();
  editor.onSequenceCreationCancel = onCancel;
  editor.onPathCreationChange = onChange;

  editor.setSequences([]);

  expect(state(editor)).toBeNull();
  expect(onCancel).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith(null);
  editor.destroy();
});

test("a placed coordinate is rounded to three decimals", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  const { zoom, sx, sy } = screenMapping(editor);
  const wx = 1 / (3 * zoom) + 2;
  const wy = -1 / (7 * zoom) + 1;
  mouse("mousedown", canvas, { clientX: sx(wx), clientY: sy(wy), button: 0, ctrlKey: false });
  mouse("mouseup", window, {});

  const path = editor.getSequences()[0]!.path;
  const anchor = path.curves[0]!.p3;
  expect(anchor.x * 1000).toBe(Math.round(anchor.x * 1000));
  expect(anchor.y * 1000).toBe(Math.round(anchor.y * 1000));
  expect(anchor.x).toBeCloseTo(wx, 3);
  expect(anchor.y).toBeCloseTo(wy, 3);
  expect(path.curves[0]!.length).toBeGreaterThan(0);
  editor.destroy();
});

test("a placed coordinate resolves on the drawn path", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 4, 0);
  const path = editor.getSequences()[0]!.path;
  expect(path.getPosition(path.length as PathCoordinate).x).toBeCloseTo(4, 3);
  expect(path.length).toBeGreaterThan(0);
  editor.destroy();
});

test("setSequences keeps an active creation whose sequence stays in the list", () => {
  const sequence = new Sequence(new Path());
  const other = new Sequence(new Path());
  const { editor, canvas } = makeEditor([sequence, other]);
  editor.startSequenceCreation(sequence);
  click(editor, canvas, 0, 0);
  const onChange = vi.fn();
  editor.onPathCreationChange = onChange;

  editor.setSequences([other, sequence]);

  expect(state(editor)).toEqual({
    sequence,
    isNew: true,
    phase: "placing",
    curveCount: 0,
  });
  expect(onChange).not.toHaveBeenCalled();
  editor.destroy();
});

test("the addSequence flow keeps the creation started on the new sequence", () => {
  const existing = new Sequence(new Path());
  const { editor } = makeEditor([existing]);
  const added = new Sequence(new Path());

  editor.startSequenceCreation(added);
  editor.setSequences([existing, added]);

  expect(state(editor)).toEqual({
    sequence: added,
    isNew: true,
    phase: "awaitStart",
    curveCount: 0,
  });
  editor.destroy();
});

test("setSequences clears the creation when its sequence leaves the list", () => {
  const sequence = new Sequence(new Path());
  const replacement = new Sequence(new Path());
  const { editor } = makeEditor([sequence]);
  editor.startSequenceCreation(sequence);
  const onChange = vi.fn();
  editor.onPathCreationChange = onChange;

  editor.setSequences([replacement]);

  expect(state(editor)).toBeNull();
  expect(onChange).toHaveBeenCalledWith(null);
  editor.destroy();
});

test("a mousemove during awaitStart previews one provisional point under the cursor", () => {
  const { editor } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const { sx, sy } = screenMapping(editor);

  mouse("mousemove", window, { clientX: sx(2), clientY: sy(3) });

  const preview = editor.getPathCreationPreview();
  expect(preview?.points).toHaveLength(0);
  expect(preview?.provisionalPoints).toHaveLength(1);
  expect(preview?.provisionalPoints[0]!.x).toBe(2);
  expect(preview?.provisionalPoints[0]!.y).toBe(3);
  expect(preview?.curve).toBeNull();
  expect(preview?.previousCurve).toBeNull();
  editor.destroy();
});

test("a mousemove during placing previews the placed points, the cursor point and the provisional curve", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  const { sx, sy } = screenMapping(editor);
  mouse("mousemove", window, { clientX: sx(6), clientY: sy(2) });

  const preview = editor.getPathCreationPreview();
  // The latest anchor and the cursor point render provisional, the earlier one normal.
  expect(preview?.points).toEqual([new Vector(0, 0)]);
  expect(preview?.provisionalPoints).toEqual([new Vector(3, 0), new Vector(6, 2)]);
  const curve = preview?.curve;
  expect(curve?.p0.x).toBe(3);
  expect(curve?.p0.y).toBe(0);
  expect(curve?.p3.x).toBe(6);
  expect(curve?.p3.y).toBe(2);

  // The previous curve renders with its would-be recomputed incoming handle.
  const previous = preview?.previousCurve;
  expect(previous?.p0.x).toBe(0);
  expect(previous?.p1.x).toBe(1);
  expect(previous?.p3.x).toBe(3);

  // A real placement at the hover point computes the same auto-smooth handles.
  click(editor, canvas, 6, 2);
  const placed = editor.getSequences()[0]!.path.curves[1]!;
  expect(placed.p1.x).toBeCloseTo(curve!.p1.x, 2);
  expect(placed.p1.y).toBeCloseTo(curve!.p1.y, 2);
  expect(placed.p2.x).toBeCloseTo(curve!.p2.x, 2);
  expect(placed.p2.y).toBeCloseTo(curve!.p2.y, 2);
  const rebuiltPrevious = editor.getSequences()[0]!.path.curves[0]!;
  expect(rebuiltPrevious.p2.x).toBeCloseTo(previous!.p2.x, 2);
  expect(rebuiltPrevious.p2.y).toBeCloseTo(previous!.p2.y, 2);

  // The preview recomputes from the new last anchor without another mousemove.
  click(editor, canvas, 6, 0);
  const next = editor.getPathCreationPreview();
  expect(next?.curve?.p0.x).toBe(6);
  expect(next?.curve?.p0.y).toBe(0);
  expect(next?.curve?.p3.x).toBe(6);
  expect(next?.curve?.p3.y).toBe(2);
  editor.destroy();
});

test("the extension preview runs from the path end anchor to the cursor", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor } = makeEditor([new Sequence(path)]);
  editor.startSequenceExtension(editor.getSequences()[0]!);
  const { sx, sy } = screenMapping(editor);

  mouse("mousemove", window, { clientX: sx(6), clientY: sy(3) });

  const preview = editor.getPathCreationPreview();
  expect(preview?.points).toHaveLength(1);
  expect(preview?.provisionalPoints).toEqual([new Vector(3, 0), new Vector(6, 3)]);
  expect(preview?.curve?.p0.x).toBe(3);
  expect(preview?.curve?.p0.y).toBe(0);
  expect(preview?.curve?.p3.x).toBe(6);
  expect(preview?.curve?.p3.y).toBe(3);
  editor.destroy();
});

test("the extension preview recomputes the previous end handle like a placement would", () => {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0)));
  const { editor, canvas } = makeEditor([new Sequence(path)]);
  editor.startSequenceExtension(editor.getSequences()[0]!);
  const { sx, sy } = screenMapping(editor);

  mouse("mousemove", window, { clientX: sx(6), clientY: sy(3) });
  const previous = editor.getPathCreationPreview()?.previousCurve;
  expect(previous?.p0.x).toBe(0);
  expect(previous?.p1.x).toBe(1);
  expect(previous?.p3.x).toBe(3);

  click(editor, canvas, 6, 3);
  const joint = editor.getSequences()[0]!.path.curves[0]!;
  expect(joint.p2.x).toBeCloseTo(previous!.p2.x, 2);
  expect(joint.p2.y).toBeCloseTo(previous!.p2.y, 2);
  editor.destroy();
});

test("mouseleave hides the preview until the mouse returns", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const { sx, sy } = screenMapping(editor);

  mouse("mousemove", window, { clientX: sx(2), clientY: sy(3) });
  expect(editor.getPathCreationPreview()).not.toBeNull();

  mouse("mouseleave", canvas, {});
  expect(editor.getPathCreationPreview()).toBeNull();

  mouse("mousemove", window, { clientX: sx(2), clientY: sy(3) });
  expect(editor.getPathCreationPreview()).not.toBeNull();
  editor.destroy();
});

test("the preview hides when the creation finishes or cancels", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const { sx, sy } = screenMapping(editor);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 4, 0);
  mouse("mousemove", window, { clientX: sx(6), clientY: sy(1) });
  expect(editor.getPathCreationPreview()).not.toBeNull();

  editor.finishSequenceCreation();
  expect(editor.getPathCreationPreview()).toBeNull();

  editor.startSequenceCreation(editor.getSequences()[0]!);
  mouse("mousemove", window, { clientX: sx(6), clientY: sy(1) });
  expect(editor.getPathCreationPreview()).not.toBeNull();

  editor.cancelSequenceCreation();
  expect(editor.getPathCreationPreview()).toBeNull();
  editor.destroy();
});

test("the hover preview keeps the latest anchor provisional above the control handles", () => {
  const { canvas, arcs } = makeRecordingCanvas();
  const editor = new Editor(canvas, [new Sequence(new Path())]);
  editor.mode = "path";
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  const { sx, sy } = screenMapping(editor);
  mouse("mousemove", window, { clientX: sx(6), clientY: sy(2) });
  arcs.length = 0;
  editor.draw();

  const second = arcs.filter((arc) => arc.x === 3 * CANVAS_SCALE && arc.y === 0);
  expect(second.length).toBeGreaterThanOrEqual(1);
  expect(second[second.length - 1]!.color).toBe("#1976d2");
  editor.destroy();
});

test("a touch move during creation places but never previews", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);
  const touch = { identifier: 1, clientX: 512, clientY: 512, target: canvas };

  canvas.dispatchEvent(new TouchEvent("touchstart", { touches: [touch] } as unknown as TouchEventInit));
  canvas.dispatchEvent(new TouchEvent("touchmove", { touches: [touch] } as unknown as TouchEventInit));

  expect(state(editor)?.phase).toBe("placing");
  expect(editor.getPathCreationPreview()).toBeNull();
  editor.destroy();
});

// Records every arc call with the fill style set at call time, so a test can
// assert the drawn point markers and their colors.
function makeRecordingCanvas(): { canvas: HTMLCanvasElement; arcs: Array<{ color: unknown; x: number; y: number }> } {
  const ctx = makeNoopContext();
  const arcs: Array<{ color: unknown; x: number; y: number }> = [];
  ctx.arc = (...args: unknown[]) => {
    arcs.push({ color: ctx.fillStyle, x: args[0] as number, y: args[1] as number });
  };
  return { canvas: createStubCanvas(ctx), arcs };
}

test("the base draw renders a placed creation anchor without hover", () => {
  const { canvas, arcs } = makeRecordingCanvas();
  const editor = new Editor(canvas, [new Sequence(new Path())]);
  editor.mode = "path";
  editor.startSequenceCreation(editor.getSequences()[0]!);
  arcs.length = 0;

  click(editor, canvas, 1, 2);
  arcs.length = 0;
  editor.draw();

  expect(editor.getPathCreationPreview()).toBeNull();
  const anchorArcs = arcs.filter((arc) => arc.x === 1 * CANVAS_SCALE && arc.y === -2 * CANVAS_SCALE);
  expect(anchorArcs).toHaveLength(1);
  expect(anchorArcs[0]!.color).toBe("#1976d2");
  editor.destroy();
});

test("the base draw renders the latest creation anchor provisional and the earlier ones normal", () => {
  const { canvas, arcs } = makeRecordingCanvas();
  const editor = new Editor(canvas, [new Sequence(new Path())]);
  editor.mode = "path";
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);
  arcs.length = 0;
  editor.draw();

  const first = arcs.filter((arc) => arc.x === 0 && arc.y === 0);
  const second = arcs.filter((arc) => arc.x === 3 * CANVAS_SCALE && arc.y === 0);
  // The creation anchors draw above the control handles, so the last fill at
  // each anchor keeps the required style.
  expect(first[first.length - 1]!.color).toBe("#444");
  expect(second[second.length - 1]!.color).toBe("#1976d2");
  editor.destroy();
});

// First derivative of the cubic Bezier at parameter t.
function bezierDerivative(curve: { p0: Vector; p1: Vector; p2: Vector; p3: Vector }, t: number): Vector {
  const mt = 1 - t;
  return curve.p1
    .minus(curve.p0)
    .times(3 * mt * mt)
    .plus(curve.p2.minus(curve.p1).times(6 * mt * t))
    .plus(curve.p3.minus(curve.p2).times(3 * t * t));
}

function cross(a: Vector, b: Vector): number {
  return a.x * b.y - a.y * b.x;
}

// An inflection flips the tangent rotation direction, so successive derivative
// cross products would change sign along the curve.
function inflectionFree(curve: { p0: Vector; p1: Vector; p2: Vector; p3: Vector }): boolean {
  const samples = 200;
  const derivatives: Vector[] = [];
  for (let step = 0; step <= samples; step++) derivatives.push(bezierDerivative(curve, step / samples));
  let sign = 0;
  for (let step = 0; step < samples; step++) {
    const value = cross(derivatives[step]!, derivatives[step + 1]!);
    if (Math.abs(value) < 1e-12) continue;
    const next = Math.sign(value);
    if (sign === 0) sign = next;
    else if (next !== sign) return false;
  }
  return true;
}

test("the newest preview curve keeps its second handle on the departure segment", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 1);
  const { sx, sy } = screenMapping(editor);
  mouse("mousemove", window, { clientX: sx(1.5), clientY: sy(-1) });

  const curve = editor.getPathCreationPreview()!.curve!;
  const departure = curve.p1;
  const expectedP2 = departure.plus(new Vector(1.5, -1).minus(departure).times(0.5));
  expect(curve.p2.x).toBeCloseTo(expectedP2.x, 6);
  expect(curve.p2.y).toBeCloseTo(expectedP2.y, 6);
  editor.destroy();
});

test("the committed newest curve uses the same on-segment second handle as the preview", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 1);
  const { sx, sy } = screenMapping(editor);
  mouse("mousemove", window, { clientX: sx(1.5), clientY: sy(-1) });
  const preview = editor.getPathCreationPreview()!.curve!;

  click(editor, canvas, 1.5, -1);
  const curve = editor.getSequences()[0]!.path.curves[1]!;
  // The stored curve rounds to 3 decimals, the preview does not.
  expect(curve.p2.x).toBeCloseTo(preview.p2.x, 2);
  expect(curve.p2.y).toBeCloseTo(preview.p2.y, 2);
  // p2 is the midpoint of the departure→end segment.
  expect(curve.p2.x).toBeCloseTo(2.5, 2);
  expect(curve.p2.y).toBeCloseTo(-1 / 6, 2);
  const toP2 = curve.p2.minus(curve.p1);
  const toEnd = curve.p3.minus(curve.p1);
  // The rounding to 3 decimals keeps the handle on the segment only up to ~1e-3.
  expect(Math.abs(toP2.x * toEnd.y - toP2.y * toEnd.x)).toBeLessThan(5e-3);
  editor.destroy();
});

test("a collinear first segment keeps the two-thirds end handle", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 0);

  const curve = editor.getSequences()[0]!.path.curves[0]!;
  expect(curve.p1.x).toBeCloseTo(1, 3);
  expect(curve.p2.x).toBeCloseTo(2, 3);
  expect(curve.p2.y).toBeCloseTo(0, 3);
  editor.destroy();
});

test("the provisional curve never inflects for adversarial cursor positions", () => {
  const { editor, canvas } = makeEditor([new Sequence(new Path())]);
  editor.startSequenceCreation(editor.getSequences()[0]!);

  click(editor, canvas, 0, 0);
  click(editor, canvas, 3, 1);
  const { sx, sy } = screenMapping(editor);
  // Behind the last anchor, a perpendicular approach and a straight continuation.
  const hovers: Array<[number, number]> = [
    [0.5, 0.2],
    [1.5, -1],
    [2.7, 1.9],
    [6, 2],
    [6, 0],
  ];
  for (const [wx, wy] of hovers) {
    mouse("mousemove", window, { clientX: sx(wx), clientY: sy(wy) });
    const curve = editor.getPathCreationPreview()!.curve;
    expect(curve, `the preview should show a curve at (${wx}, ${wy})`).not.toBeNull();
    expect(inflectionFree(curve!), `the curve at (${wx}, ${wy}) should stay inflection-free`).toBe(true);
  }
  editor.destroy();
});
