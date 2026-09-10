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
