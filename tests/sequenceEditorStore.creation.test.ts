import { expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";
import type { DiagramJSON } from "../src/engine/diagram";
import type { Sequence } from "../src/engine/sequence";

test("a fresh store starts with an empty diagram and no active sequence", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  expect(store.getSequences()).toHaveLength(0);
  expect(store.getActiveSequence()).toBeNull();
});

test("addSequence creates an empty sequence and hands a creation request to the view", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();

  store.addSequence();
  const first = store.getSequences()[0] as Sequence;
  expect(first.name).toBe("Sequence 1");
  expect(first.path.curves).toHaveLength(0);
  expect(first.elements).toHaveLength(0);
  expect(store.getActiveSequence()).toBe(first);
  expect(store.creationRequest).toBe(first);

  // The view consumes the request once and empty requests read as null.
  expect(store.consumeCreationRequest()).toBe(first);
  expect(store.creationRequest).toBeNull();
  expect(store.consumeCreationRequest()).toBeNull();

  store.addSequence();
  const second = store.getSequences()[1] as Sequence;
  expect(second.name).toBe("Sequence 2");
  expect(store.creationRequest).toBe(second);
});

test("clear resets to an empty diagram and loading an empty diagram stays empty", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.addSequence();
  store.consumeCreationRequest();

  store.clear();
  expect(store.getSequences()).toHaveLength(0);
  expect(store.getActiveSequence()).toBeNull();

  store.loadFromJSON({ name: "Empty", sequences: [] } as never);
  expect(store.getSequences()).toHaveLength(0);
  expect(store.getActiveSequence()).toBeNull();
  expect(JSON.parse(store.getJSON()) as DiagramJSON).toEqual({ name: "Empty", sequences: [] });
});
