import { expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";
import { seedStoredDiagram } from "./helpers";
import { Sequence } from "../src/engine/sequence";

function firstNameOf(store: ReturnType<typeof useSequenceEditorStore>): string {
  return (store.getSequences()[0] as Sequence).name;
}

test("two renames undo in reverse order and redo reapplies both", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  try {
    const store = useSequenceEditorStore();
    const initial = firstNameOf(store);

    store.renameSequence(store.getSequences()[0] as Sequence, "Alpha");
    expect(firstNameOf(store)).toBe("Alpha");
    expect(store.canUndo).toBe(true);
    // Space the second rename past the coalesce window, so it records its own step.
    vi.advanceTimersByTime(1000);
    store.renameSequence(store.getSequences()[0] as Sequence, "Beta");
    expect(firstNameOf(store)).toBe("Beta");
    expect(store.canRedo).toBe(false);

    expect(store.undo()).not.toBeNull();
    expect(firstNameOf(store)).toBe("Alpha");
    expect(store.undo()).not.toBeNull();
    expect(firstNameOf(store)).toBe(initial);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);

    expect(store.redo()).not.toBeNull();
    expect(firstNameOf(store)).toBe("Alpha");
    expect(store.redo()).not.toBeNull();
    expect(firstNameOf(store)).toBe("Beta");
    expect(store.canRedo).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("a rename after an undo records the restored state; the redo stack is gone", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const former = firstNameOf(store);

  store.renameSequence(store.getSequences()[0] as Sequence, "Alpha");
  expect(store.undo()).not.toBeNull();
  expect(firstNameOf(store)).toBe(former);

  store.renameSequence(store.getSequences()[0] as Sequence, "Beta");
  expect(store.canRedo).toBe(false);
  expect(store.canUndo).toBe(true);

  expect(store.undo()).not.toBeNull();
  expect(firstNameOf(store)).toBe(former);
  expect(store.canUndo).toBe(false);
});

test("a change spanning two sequences reverts as one step", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();

  store.addSequence();
  expect(store.getSequences()).toHaveLength(2);
  const first = store.getSequences()[0] as Sequence;
  const second = store.getSequences()[1] as Sequence;
  const firstName = first.name;
  const secondName = second.name;

  first.name = "First renamed";
  second.name = "Second renamed";
  store.saveToStorage();
  expect(store.canUndo).toBe(true);
  expect(store.canRedo).toBe(false);

  expect(store.undo()).not.toBeNull();
  const rebuiltFirst = store.getSequences()[0] as Sequence;
  const rebuiltSecond = store.getSequences()[1] as Sequence;
  expect(rebuiltFirst.name).toBe(firstName);
  expect(rebuiltSecond.name).toBe(secondName);
  expect(rebuiltFirst).not.toBe(first);
  expect(rebuiltSecond).not.toBe(second);

  const active = store.getActiveSequence();
  expect(active instanceof Sequence).toBe(true);
  expect(store.getSequences().includes(active as Sequence)).toBe(true);
  expect(store.canRedo).toBe(true);

  expect(store.redo()).not.toBeNull();
  expect((store.getSequences()[0] as Sequence).name).toBe("First renamed");
  expect((store.getSequences()[1] as Sequence).name).toBe("Second renamed");
});

test("a diagram options edit and a sequence edit undo in reverse order", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const former = firstNameOf(store);

  store.setDiagramBpm(90);
  store.renameSequence(store.getSequences()[0] as Sequence, "Circles");

  expect(store.undo()).not.toBeNull();
  expect(firstNameOf(store)).toBe(former);
  expect(store.getDiagram().bpm).toBe(90);

  expect(store.undo()).not.toBeNull();
  expect(store.getDiagram().bpm).toBeUndefined();
  expect(firstNameOf(store)).toBe(former);
  expect(store.canUndo).toBe(false);
  expect(store.canRedo).toBe(true);
});

test("removing a sequence keeps it undoable at its index", () => {
  localStorage.clear();
  seedStoredDiagram();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();

  store.addSequence();
  store.renameSequence(store.getSequences()[1] as Sequence, "Second");
  store.removeSequence(store.getSequences()[1] as Sequence);
  expect(store.getSequences()).toHaveLength(1);
  expect(store.canUndo).toBe(true);

  expect(store.undo()).not.toBeNull();
  expect(store.getSequences()).toHaveLength(2);
  expect((store.getSequences()[1] as Sequence).name).toBe("Second");
  expect(store.canRedo).toBe(true);

  expect(store.redo()).not.toBeNull();
  expect(store.getSequences()).toHaveLength(1);
  expect(store.canRedo).toBe(false);
});
