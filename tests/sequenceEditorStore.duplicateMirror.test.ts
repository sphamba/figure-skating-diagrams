import { expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { Annotation } from "../src/engine/annotation";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { useSequenceEditorStore } from "../src/stores/sequenceEditor";
import { Vector } from "../src/engine/vector";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn";

test("duplicateSequence appends a copy with a unique name and makes it active", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const original = store.getSequences()[0] as Sequence;
  original.name = "Spirals";
  store.addSequence();
  const second = store.getSequences()[1] as Sequence;
  second.addAnnotation(new Annotation(0 as PathCoordinate, 1 as PathCoordinate, "Loop"));

  store.duplicateSequence(second);

  const sequences = store.getSequences();
  expect(sequences).toHaveLength(3);
  const copy = sequences[2] as Sequence;
  expect(copy).not.toBe(second);
  expect(copy.name).toBe("Sequence 3");
  expect(store.getActiveSequence()).toBe(copy);

  expect(copy.path.curves).toHaveLength(second.path.curves.length);
  const originalPoints = second.path.curves.flatMap((curve) => [curve.p0, curve.p1, curve.p2, curve.p3]);
  const copyPoints = copy.path.curves.flatMap((curve) => [curve.p0, curve.p1, curve.p2, curve.p3]);
  expect(copyPoints).toHaveLength(originalPoints.length);
  for (let index = 0; index < originalPoints.length; index++) {
    expect(copyPoints[index]!.x).toBeCloseTo(originalPoints[index]!.x + 5, 10);
    expect(copyPoints[index]!.y).toBeCloseTo(originalPoints[index]!.y - 5, 10);
  }
  expect(copy.elements).toHaveLength(second.elements.length);
  expect(copy.annotations).toHaveLength(1);
  expect(copy.annotations[0]!.title).toBe("Loop");
  expect(copy.annotations[0]).not.toBe(second.annotations[0]);
  expect(store.isVisible(copy)).toBe(true);
});

test("duplicateSequence persists the copy to local storage", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  store.duplicateSequence(store.getSequences()[0] as Sequence);

  const stored = JSON.parse(localStorage.getItem("sequence-editor") as string) as {
    sequences?: { name?: string }[];
  };
  expect(stored.sequences).toHaveLength(2);
  expect(stored.sequences![1]!.name).toBe("Sequence 2");
});

test("duplicateSequence keeps the diagram unchanged for a sequence outside the diagram", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const foreign = new Sequence(new Path());

  store.duplicateSequence(foreign);

  expect(store.getSequences()).toHaveLength(1);
  expect(store.getActiveSequence()).toBe(store.getSequences()[0]);
});

function setOffCenterPath(sequence: Sequence) {
  // The default path is symmetric about the origin, so an off-center box pins the mirror line.
  sequence.path.curves = [new Curve(new Vector(1, 0), new Vector(2, 2), new Vector(3, -1), new Vector(4, 0))];
  sequence.path.updateLength();
}

test("mirrorSequence mirrors the path x through the bounding box center and persists", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  setOffCenterPath(sequence);

  store.mirrorSequence(sequence, "horizontal");

  // The bounding box spans x in [1, 4], so the center line sits at x = 2.5.
  const curve = sequence.path.curves[0]!;
  expect(curve.p0.x).toBeCloseTo(4, 10);
  expect(curve.p0.y).toBeCloseTo(0, 10);
  expect(curve.p1.x).toBeCloseTo(3, 10);
  expect(curve.p1.y).toBeCloseTo(2, 10);
  expect(curve.p2.x).toBeCloseTo(2, 10);
  expect(curve.p2.y).toBeCloseTo(-1, 10);
  expect(curve.p3.x).toBeCloseTo(1, 10);
  expect(curve.p3.y).toBeCloseTo(0, 10);

  const stored = JSON.parse(localStorage.getItem("sequence-editor") as string) as {
    sequences?: { path?: { curves?: { points?: number[] }[] }[] }[];
  };
  expect(stored.sequences![0]!.path!.curves![0]!.points).toEqual([4, 0, 3, 2, 2, -1, 1, 0]);
});

test("mirrorSequence mirrors the path y through the bounding box center", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  setOffCenterPath(sequence);

  store.mirrorSequence(sequence, "vertical");

  // The bounding box spans y in [-1, 2], so the center line sits at y = 0.5.
  const curve = sequence.path.curves[0]!;
  expect(curve.p0.x).toBeCloseTo(1, 10);
  expect(curve.p0.y).toBeCloseTo(1, 10);
  expect(curve.p1.x).toBeCloseTo(2, 10);
  expect(curve.p1.y).toBeCloseTo(-1, 10);
  expect(curve.p2.x).toBeCloseTo(3, 10);
  expect(curve.p2.y).toBeCloseTo(2, 10);
  expect(curve.p3.x).toBeCloseTo(4, 10);
  expect(curve.p3.y).toBeCloseTo(1, 10);
});

test("mirrorSequence swaps the element sides and mirrors the path", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  setOffCenterPath(sequence);
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.4 as PathCoordinate, 2.4 as PathCoordinate));

  store.mirrorSequence(sequence, "horizontal");

  // The bounding box spans x in [1, 4], so the center line sits at x = 2.5.
  expect(sequence.path.curves[0]!.p0.x).toBeCloseTo(4, 10);
  expect(sequence.elements[0]!.type).toBe("BothForwardGlide");
  expect(sequence.elements[1]!.type).toBe("RightForwardInsideThreeTurn");
  expect(sequence.elements[1]!.start).toBe(0.4 as PathCoordinate);
  expect(sequence.elements[1]!.end).toBe(2.4 as PathCoordinate);
});

test("mirrorSequence twice restores the original geometry", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  setOffCenterPath(sequence);
  const original = sequence.path.curves[0]!.toJSON();

  store.mirrorSequence(sequence, "vertical");
  store.mirrorSequence(sequence, "vertical");
  expect(sequence.path.curves[0]!.toJSON()).toEqual(original);

  store.mirrorSequence(sequence, "horizontal");
  store.mirrorSequence(sequence, "horizontal");
  expect(sequence.path.curves[0]!.toJSON()).toEqual(original);
});

test("mirrorSequence treats an unknown axis as vertical", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const sequence = store.getSequences()[0] as Sequence;
  setOffCenterPath(sequence);

  store.mirrorSequence(sequence, "diagonal" as "horizontal" | "vertical");

  const curve = sequence.path.curves[0]!;
  expect(curve.p1.x).toBeCloseTo(2, 10);
  expect(curve.p1.y).toBeCloseTo(-1, 10);
});

test("mirrorSequence keeps the diagram unchanged for a sequence outside the diagram", () => {
  localStorage.clear();
  setActivePinia(createPinia());
  const store = useSequenceEditorStore();
  const foreign = new Sequence(new Path());
  setOffCenterPath(foreign);

  store.mirrorSequence(foreign, "horizontal");

  expect(foreign.path.curves[0]!.p0.x).toBeCloseTo(1, 10);
  expect(store.getSequences()).toHaveLength(1);
});
