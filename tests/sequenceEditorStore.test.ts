import { expect, test } from "vitest";
import { computed, nextTick, watch } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";
import type { Sequence } from "../src/engine/sequence";

test("the visible list chain updates when a sequence is added", async () => {
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  // Mirror the editor view: a list computed over the store, a visible filter over it.
  const sequences = computed(() => store.getSequences());
  const visible = computed(() => sequences.value.filter((sequence) => store.isVisible(sequence)));
  expect(visible.value).toHaveLength(1);

  let visibleRuns = 0;
  const stop = watch(visible, () => visibleRuns++);
  store.addSequence();
  await nextTick();
  stop();

  expect(sequences.value).toHaveLength(2);
  expect(visible.value).toHaveLength(2);
  expect(visibleRuns).toBe(1);
});

test("structural changes rebuild the sequences array so the chain keeps propagating", () => {
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const first = store.getSequences()[0] as Sequence;
  store.addSequence();
  const second = store.getSequences()[1] as Sequence;
  const arrayAfterAdd = store.getSequences();
  expect(arrayAfterAdd).not.toBe(first.path.curves); // sanity: unrelated objects differ

  store.renameSequence(second, "Circles");
  expect(store.getSequences()).toBe(arrayAfterAdd); // a rename keeps the array identity
  store.removeSequence(second);
  expect(store.getSequences()).not.toBe(arrayAfterAdd); // a structural change rebuilds it
  expect(store.getSequences()[0]).toBe(first);
});

test("removing sequences never leaves an empty diagram and keeps one visible", () => {
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.removeSequence(store.getSequences()[0] as Sequence);
  expect(store.getSequences()).toHaveLength(1);
  expect(store.getSequences()[0] as Sequence).toBeTruthy();
  expect(store.getActiveSequence()).toBe(store.getSequences()[0]);
});

test("the short draw range state defaults to off and mirrors the setter", () => {
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  expect(store.getShortDrawRange()).toBe(false);
  store.setShortDrawRange(true);
  expect(store.getShortDrawRange()).toBe(true);
});

const EXAMPLE_IMAGE = "data:image/png;base64,AAAA";

test("the background image and its opacity persist to local storage", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  store.setDiagramBackgroundImageOpacity(0.55);

  const stored = JSON.parse(localStorage.getItem("sequence-editor") as string) as {
    backgroundImage?: string;
    backgroundImageOpacity?: number;
  };
  expect(stored.backgroundImage).toBe(EXAMPLE_IMAGE);
  expect(stored.backgroundImageOpacity).toBeCloseTo(0.55);
});

test("a blank string clears the background image from the diagram and the storage", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.setDiagramBackgroundImage(EXAMPLE_IMAGE);
  store.setDiagramBackgroundImage("");

  expect(store.getDiagram().backgroundImage).toBeUndefined();
  const stored = JSON.parse(localStorage.getItem("sequence-editor") as string) as {
    backgroundImage?: string;
  };
  expect(stored.backgroundImage).toBeUndefined();
});

test("the background image opacity stays inside the 0-1 range", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.setDiagramBackgroundImageOpacity(2);
  expect(store.getDiagram().backgroundImageOpacity).toBe(1);
  store.setDiagramBackgroundImageOpacity(-1);
  expect(store.getDiagram().backgroundImageOpacity).toBe(0);
  store.setDiagramBackgroundImageOpacity(Number.NaN);
  expect(store.getDiagram().backgroundImageOpacity).toBe(0);
});
