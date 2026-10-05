import { expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";
import { seedStoredDiagram } from "./helpers";
import type { DiagramJSON } from "../src/engine/diagram";
import type { Sequence } from "../src/engine/sequence";

test("a rename records a step; undo and redo restore the name on rebuilt sequences", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;
  const formerName = first.name;

  store.renameSequence(first, "Circles");
  expect(store.canUndo).toBe(true);
  expect(store.canRedo).toBe(false);

  const label = store.undo();
  expect(label).not.toBeNull();
  expect((store.getSequences()[0] as Sequence).name).toBe(formerName);
  expect(store.canRedo).toBe(true);

  store.redo();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");
  expect(store.canRedo).toBe(false);
});

test("a bpm change records a step; undo restores the previous bpm", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();

  store.setDiagramBpm(90);
  expect(store.getDiagram().bpm).toBe(90);
  expect(store.canUndo).toBe(true);

  store.undo();
  expect(store.getDiagram().bpm).toBeUndefined();
  expect(store.canRedo).toBe(true);
});

test("adding a sequence records a list step; undo removes it and redo brings it back", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();

  store.addSequence();
  expect(store.getSequences()).toHaveLength(2);
  expect(store.canUndo).toBe(true);

  store.undo();
  expect(store.getSequences()).toHaveLength(1);
  expect(store.canRedo).toBe(true);

  store.redo();
  expect(store.getSequences()).toHaveLength(2);
});

test("loading a diagram deletes the history", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;

  store.renameSequence(first, "Circles");
  expect(store.canUndo).toBe(true);
  const json = JSON.parse(store.getJSON()) as DiagramJSON;
  store.loadFromJSON(json);
  expect(store.canUndo).toBe(false);
  expect(store.canRedo).toBe(false);
});

test("creating a new diagram deletes the history", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;

  store.renameSequence(first, "Circles");
  expect(store.canUndo).toBe(true);
  store.clear();
  expect(store.canUndo).toBe(false);
  expect(store.canRedo).toBe(false);
});

test("the history survives a store rebuild and keeps walking back", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  let store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;
  const formerName = first.name;

  store.renameSequence(first, "Circles");
  store.setDiagramBpm(90);
  store.renameSequence(store.getSequences()[0] as Sequence, "Spirals");
  expect(store.undo()).not.toBeNull();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");

  setActivePinia(createPinia());
  store = useSequenceEditorStore();
  expect(store.canUndo).toBe(true);
  expect(store.undo()).not.toBeNull();
  expect(store.getDiagram().bpm).toBeUndefined();
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");

  expect(store.undo()).not.toBeNull();
  expect((store.getSequences()[0] as Sequence).name).toBe(formerName);
  expect(store.canUndo).toBe(false);
});

test("undo does not record itself; a new edit after an undo drops the redo stack", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;
  const formerName = first.name;

  store.renameSequence(first, "Circles");
  expect(store.undo()).not.toBeNull();

  store.renameSequence(store.getSequences()[0] as Sequence, "Spirals");
  expect(store.canRedo).toBe(false);
  expect(store.canUndo).toBe(true);

  expect(store.undo()).not.toBeNull();
  // The new edit records the restored state as previous, so its undo returns there.
  expect((store.getSequences()[0] as Sequence).name).toBe(formerName);
});

test("a non-list undo keeps hidden sequences at their index", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.addSequence();
  const first = store.getSequences()[0] as Sequence;
  const second = store.getSequences()[1] as Sequence;
  store.toggleVisible(second);
  expect(store.isVisible(second)).toBe(false);

  store.renameSequence(first, "Circles");
  expect(store.undo()).not.toBeNull();
  // Only the changed sequence rebuilds; the untouched second keeps its object.
  expect(store.getSequences()[0]).not.toBe(first);
  expect(store.getSequences()[1]).toBe(second);
  // The remap keeps the untouched second sequence hidden.
  expect(store.isVisible(second)).toBe(false);
  expect(store.isVisible(store.getSequences()[0] as Sequence)).toBe(true);
});

test("a list undo clears the hidden set", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.addSequence();
  const second = store.getSequences()[1] as Sequence;
  store.toggleVisible(second);
  store.addSequence();
  expect(store.getSequences()).toHaveLength(3);

  expect(store.undo()).not.toBeNull();
  expect(store.getSequences()).toHaveLength(2);
  // The stale set would keep a dead object hidden, so the list undo clears it.
  expect(store.isVisible(store.getSequences()[0] as Sequence)).toBe(true);
  expect(store.isVisible(store.getSequences()[1] as Sequence)).toBe(true);
});

test("undoing past the saved baseline keeps the unsaved indicator on", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;
  const formerName = first.name;

  store.renameSequence(first, "Circles");
  expect(store.isUnsaved()).toBe(true);
  store.markSaved();
  expect(store.isUnsaved()).toBe(false);

  store.undo();
  // The undo restores a state before the saved one, which differs from it.
  expect((store.getSequences()[0] as Sequence).name).toBe(formerName);
  expect(store.isUnsaved()).toBe(true);
});

test("undoing back to the saved state clears the unsaved indicator", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;

  store.renameSequence(first, "Circles");
  store.markSaved();
  expect(store.isUnsaved()).toBe(false);

  store.renameSequence(store.getSequences()[0] as Sequence, "Spirals");
  expect(store.isUnsaved()).toBe(true);

  store.undo();
  // The indicator is a live comparison, so the restored saved state reads saved.
  expect((store.getSequences()[0] as Sequence).name).toBe("Circles");
  expect(store.isUnsaved()).toBe(false);
});
