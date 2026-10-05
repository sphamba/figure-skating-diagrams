import { expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createStubCanvas, makeNoopContext, makeStraightLengthOnePath, seedStoredDiagram } from "./helpers";
import { Editor } from "../src/engine/sequenceEditor/editor";
import { Sequence } from "../src/engine/sequence";
import { LeftForwardInsideGlide, LeftForwardOutsideGlide } from "../src/engine/element/glide";
import type { PathCoordinate } from "../src/engine/coordinates";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";

function makeEditor() {
  const ctx: Record<string, unknown> = { ...makeNoopContext() };
  const canvas = createStubCanvas(ctx);
  const editor = new Editor(canvas, [], {});
  editor.mode = "path";
  return { editor, canvas };
}

function mouse(eventName: string, target: EventTarget, init: MouseEventInit) {
  target.dispatchEvent(new MouseEvent(eventName, init));
}

// Drags the first control point right through real canvas events, like the app does.
function dragPoint(editor: Editor, canvas: EventTarget, sequence: Sequence, distance: number): number {
  const zoom = editor.view.zoom;
  const sx = (wx: number) => 512 + wx * zoom;
  const curve = sequence.path.curves[0]!;
  const startX = curve.p0.x;
  mouse("mousedown", canvas, { clientX: sx(startX), clientY: 512, button: 0, ctrlKey: false });
  mouse("mousemove", window, { clientX: sx(startX + distance), clientY: 512 });
  mouse("mouseup", window, {});
  return startX + distance;
}

// Mirrors the EditorView sequences watch: the canvas editor follows the store
// when the sequence members change.
function makeSync(editor: Editor, store: ReturnType<typeof useSequenceEditorStore>) {
  let previous: Sequence[] = [];
  return () => {
    const list = store.getSequences();
    const same = list.length === previous.length && list.every((s, i) => s === previous[i]);
    previous = list;
    if (!same) editor.setSequences(list);
  };
}

test("a canvas edit round-trips through undo, redo and undo", () => {
  localStorage.clear();
  seedStoredDiagram([[-2.5, 0, -0.5, 0, 0.5, 0, 2.5, 0]]);
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const { editor, canvas } = makeEditor();
  const sync = makeSync(editor, store);
  sync();
  editor.onSequenceChange = () => store.saveToStorage();

  const initialJson = JSON.stringify(store.getDiagram().toJSON());
  const sequence = store.getSequences()[0] as Sequence;

  dragPoint(editor, canvas, sequence, 0.2);
  const afterEdit = JSON.stringify(store.getDiagram().toJSON());
  expect(afterEdit).not.toBe(initialJson);
  expect(store.canUndo).toBe(true);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(initialJson);
  const rebuilt = editor.getSequences()[0] as Sequence;
  expect(rebuilt).not.toBe(sequence);
  expect(rebuilt.path.curves[0]!.p0.x).toBeCloseTo(-2.5, 6);

  expect(store.redo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(afterEdit);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(initialJson);
  expect(store.canRedo).toBe(true);

  editor.destroy();
});

test("two quick canvas edits make two steps and walk back one at a time", () => {
  localStorage.clear();
  seedStoredDiagram([[-2.5, 0, -0.5, 0, 0.5, 0, 2.5, 0]]);
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const { editor, canvas } = makeEditor();
  const sync = makeSync(editor, store);
  sync();
  editor.onSequenceChange = () => store.saveToStorage();

  const initialJson = JSON.stringify(store.getDiagram().toJSON());
  const sequence = store.getSequences()[0] as Sequence;

  dragPoint(editor, canvas, sequence, 0.1);
  const afterEdit1 = JSON.stringify(store.getDiagram().toJSON());
  dragPoint(editor, canvas, editor.getSequences()[0] as Sequence, 0.1);
  const afterEdit2 = JSON.stringify(store.getDiagram().toJSON());
  expect(afterEdit2).not.toBe(afterEdit1);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(afterEdit1);
  const live = editor.getSequences()[0] as Sequence;
  expect(live.path.curves[0]!.p0.x).toBeCloseTo(-2.4, 6);

  expect(store.redo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(afterEdit2);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(afterEdit1);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(initialJson);

  editor.destroy();
});

test("a canvas edit after an undo edits the rebuilt sequence and undos back to it", () => {
  localStorage.clear();
  seedStoredDiagram([[-2.5, 0, -0.5, 0, 0.5, 0, 2.5, 0]]);
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const { editor, canvas } = makeEditor();
  const sync = makeSync(editor, store);
  sync();
  editor.onSequenceChange = () => store.saveToStorage();

  const initialJson = JSON.stringify(store.getDiagram().toJSON());
  const sequence = store.getSequences()[0] as Sequence;

  dragPoint(editor, canvas, sequence, 0.1);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(initialJson);

  // The second edit works on the rebuilt sequence the canvas editor holds.
  dragPoint(editor, canvas, editor.getSequences()[0] as Sequence, 0.3);
  const afterEdit2 = JSON.stringify(store.getDiagram().toJSON());
  expect(afterEdit2).not.toBe(initialJson);
  expect(store.canRedo).toBe(false);

  expect(store.undo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(initialJson);

  expect(store.redo()).not.toBeNull();
  sync();
  expect(JSON.stringify(store.getDiagram().toJSON())).toBe(afterEdit2);
  expect((editor.getSequences()[0] as Sequence).path.curves[0]!.p0.x).toBeCloseTo(-2.2, 6);

  editor.destroy();
});

test("rapid store input commits merge while canvas edits stay separate", () => {
  localStorage.clear();
  seedStoredDiagram([[-2.5, 0, -0.5, 0, 0.5, 0, 2.5, 0]]);
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const { editor, canvas } = makeEditor();
  const sync = makeSync(editor, store);
  sync();
  editor.onSequenceChange = () => store.saveToStorage();

  // Two rapid bpm commits merge into one step, so one undo reverts both.
  store.setDiagramBpm(90);
  store.setDiagramBpm(100);
  expect(store.undo()).not.toBeNull();
  expect(store.getDiagram().bpm).toBeUndefined();
  expect(store.canUndo).toBe(false);

  // Two canvas edits inside the same window still make two steps.
  const sequence = store.getSequences()[0] as Sequence;
  dragPoint(editor, canvas, sequence, 0.1);
  dragPoint(editor, canvas, editor.getSequences()[0] as Sequence, 0.1);
  expect(store.undo()).not.toBeNull();
  sync();
  expect((editor.getSequences()[0] as Sequence).path.curves[0]!.p0.x).toBeCloseTo(-2.4, 6);
  expect(store.undo()).not.toBeNull();
  sync();
  expect((editor.getSequences()[0] as Sequence).path.curves[0]!.p0.x).toBeCloseTo(-2.5, 6);

  editor.destroy();
});

function makeLabelEditor() {
  const ctx: Record<string, unknown> = { ...makeNoopContext() };
  const canvas = createStubCanvas(ctx);
  const editor = new Editor(canvas, [], {});
  editor.mode = "view";
  const drawn: string[] = [];
  ctx.fillText = (text: string) => {
    drawn.push(String(text));
  };
  return { editor, drawn };
}

test("an undo-style rebuild keeps element labels settled through setSequences", () => {
  const { editor, drawn } = makeLabelEditor();
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addElement(new LeftForwardOutsideGlide(0.2 as PathCoordinate, 0.6 as PathCoordinate));
  editor.setSequences([sequence]);
  editor.draw();
  editor.finishLabelTransitions();
  editor.draw();
  expect(drawn).toContain("LFO");

  // The undo applies Sequence.fromJSON, so every owner is a new object.
  drawn.length = 0;
  editor.setSequences([Sequence.fromJSON(sequence.toJSON())]);
  editor.draw();
  expect(drawn).toContain("LFO");

  // A label that just moves keeps its state too.
  drawn.length = 0;
  const moved = Sequence.fromJSON(sequence.toJSON());
  const element = moved.elements[0]!;
  element.start = 0.3 as PathCoordinate;
  element.end = 0.7 as PathCoordinate;
  editor.setSequences([moved]);
  editor.draw();
  expect(drawn).toContain("LFO");

  // A genuinely new label starts hidden and fades in.
  drawn.length = 0;
  const withExtra = Sequence.fromJSON(sequence.toJSON());
  withExtra.addElement(new LeftForwardInsideGlide(0.7 as PathCoordinate, 0.9 as PathCoordinate));
  editor.setSequences([withExtra]);
  editor.draw();
  expect(drawn).not.toContain("LFI");
  editor.finishLabelTransitions();
  editor.draw();
  expect(drawn).toContain("LFI");

  editor.destroy();
});
