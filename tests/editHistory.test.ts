import { expect, test } from "vitest";
import {
  applyParts,
  applyPartsToJson,
  EditHistory,
  diffDiagram,
  labelOf,
} from "../src/engine/sequenceEditor/editHistory";
import type { DiagramOptions, EditStep, HistoryStorage, StepPart } from "../src/engine/sequenceEditor/editHistory";
import type { SequenceJSON } from "../src/engine/sequence";
import { Curve } from "../src/engine/curve";
import { Diagram } from "../src/engine/diagram";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

function makeStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  return path;
}

function makeDiagram(): Diagram {
  return new Diagram("Diagram", [new Sequence(makeStraightPath())]);
}

function makeStorage(): { storage: HistoryStorage; entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    storage: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  };
}

function makeClock() {
  let time = 0;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function persistedSteps(storage: HistoryStorage): { steps: EditStep[]; pointer: number } {
  return JSON.parse(storage.getItem("sequence-editor-history")!) as { steps: EditStep[]; pointer: number };
}

test("commit records one step with the scoped parts and a label", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  const before = JSON.stringify(diagram.toJSON());
  history.commit(before, true);
  diagram.name = "Renamed";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  expect(history.canUndo).toBe(true);
  expect(history.canRedo).toBe(false);
  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(1);
  expect(persisted.pointer).toBe(0);
  const step = persisted.steps[0]!;
  expect(step.parts).toHaveLength(1);
  expect(step.parts[0]!.kind).toBe("diagram");
  expect((step.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Diagram");
  expect((step.parts[0] as { next: DiagramOptions }).next.name).toBe("Renamed");
  expect(step.label).toBe("Diagram options");
});

test("commit with an unchanged json does not add a step", () => {
  const { storage } = makeStorage();
  const history = new EditHistory({ storage });
  const diagram = makeDiagram();
  const json = JSON.stringify(diagram.toJSON());
  history.commit(json, true);
  history.commit(json, true);
  history.commit(json, true);
  expect(storage.getItem("sequence-editor-history")).toBeNull();
  expect(history.canUndo).toBe(false);
});

test("undo returns the step and flips the flags; redo empties the redo stack", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "Renamed";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const step = history.undo();
  expect(step).not.toBeNull();
  expect((step!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Diagram");
  expect((step!.parts[0] as { next: DiagramOptions }).next.name).toBe("Renamed");
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(true);

  const redone = history.redo();
  expect(redone).not.toBeNull();
  expect((redone!.parts[0] as { next: DiagramOptions }).next.name).toBe("Renamed");
  expect(history.canRedo).toBe(false);
  expect(history.canUndo).toBe(true);
});

test("a new commit after an undo truncates the redo tail", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.name = "Two";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.name = "Three";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  clock.advance(1000);
  diagram.bpm = 130;
  history.commit(JSON.stringify(diagram.toJSON()), true);

  expect(history.canRedo).toBe(false);
  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(3);
  expect((persisted.steps[2]!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Two");
  expect((persisted.steps[2]!.parts[0] as { previous: DiagramOptions }).previous.bpm).toBeUndefined();
  expect((persisted.steps[2]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Two");
  expect((persisted.steps[2]!.parts[0] as { next: DiagramOptions }).next.bpm).toBe(130);
  const step = history.undo()!;
  expect((step.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Two");
});

test("commits inside the window with the same scope merge into one step", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "First";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(100);
  diagram.name = "Second";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(1);
  const part = persisted.steps[0]!.parts[0] as { previous: DiagramOptions; next: DiagramOptions };
  expect(part.previous.name).toBe("Diagram");
  expect(part.next.name).toBe("Second");
  expect(history.canUndo).toBe(true);
});

test("different scopes inside the window do not merge", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "Renamed";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(100);
  diagram.sequences[0]!.name = "Circles";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(2);
  expect(persisted.steps[0]!.parts[0]!.kind).toBe("diagram");
  expect(persisted.steps[1]!.parts[0]!.kind).toBe("sequence");
});

test("a commit right after an undo never merges even inside the window", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "First";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  clock.advance(100);
  diagram.name = "Second";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(1);
  const part = persisted.steps[0]!.parts[0] as { previous: DiagramOptions; next: DiagramOptions };
  // The commit diffs from the restored state, so the new step records it as previous.
  expect(part.previous.name).toBe("Diagram");
  expect(part.next.name).toBe("Second");
  expect(history.canRedo).toBe(false);
});

test("capacity keeps only the last steps", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now, capacity: 3 });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  for (const name of ["One", "Two", "Three", "Four"]) {
    clock.advance(1000);
    diagram.name = name;
    history.commit(JSON.stringify(diagram.toJSON()), true);
  }
  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(3);
  expect((persisted.steps[0]!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("One");
  expect((persisted.steps[0]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Two");
  expect((persisted.steps[2]!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Three");
  expect((persisted.steps[2]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Four");
  expect(persisted.pointer).toBe(2);
});

test("persistence round-trip restores the steps and the pointer", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.bpm = 130;
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  const liveJson = JSON.stringify(diagram.toJSON());

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(liveJson)).toBe(true);
  expect(restored.canUndo).toBe(true);
  expect(restored.canRedo).toBe(true);
  const redone = restored.redo()!;
  expect((redone.parts[0] as { next: DiagramOptions }).next.bpm).toBe(130);
});

test("rehydrate discards a stale history that mismatches the live diagram", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const stale = makeDiagram();
  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(JSON.stringify(stale.toJSON()))).toBe(false);
  expect(restored.canUndo).toBe(false);
  expect(restored.canRedo).toBe(false);
});

test("persist drops the oldest steps when the storage quota is exceeded", () => {
  const entries = new Map<string, string>();
  const storage: HistoryStorage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > 600) throw new Error("quota exceeded");
      entries.set(key, value);
    },
    removeItem: (key: string) => void entries.delete(key),
  };
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  for (const name of ["One", "Two", "Three", "Four"]) {
    clock.advance(1000);
    diagram.name = name;
    history.commit(JSON.stringify(diagram.toJSON()), true);
  }

  expect(history.canUndo).toBe(true);
  const persisted = persistedSteps(storage);
  expect(persisted.steps.length).toBeLessThan(4);
  expect((persisted.steps[persisted.steps.length - 1]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Four");
  expect(persisted.pointer).toBe(persisted.steps.length - 1);

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(JSON.stringify(diagram.toJSON()))).toBe(true);
  expect(restored.canUndo).toBe(true);
});

test("rehydrate rejects a step whose parts lack a complete sequence json", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.bpm = 90;
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  (persisted.steps[1]!.parts[0] as unknown as { next: unknown }).next = { name: "Tampered" };
  storage.setItem("sequence-editor-history", JSON.stringify(persisted));

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(JSON.stringify(diagram.toJSON()))).toBe(false);
  expect(restored.canUndo).toBe(false);
});

test("rehydrate with a redo stack keeps the stack", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.bpm = 130;
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  const undoneAgain = history.undo()!;
  applyParts(diagram, undoneAgain.parts, "previous");
  const liveJson = JSON.stringify(diagram.toJSON());

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(liveJson)).toBe(true);
  expect(restored.canUndo).toBe(false);
  expect(restored.canRedo).toBe(true);
  const redone = restored.redo()!;
  expect((redone.parts[0] as { next: DiagramOptions }).next.name).toBe("One");
});

test("rehydrate rejects a redo stack whose oldest step mismatches the live diagram", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  const liveJson = JSON.stringify(diagram.toJSON());

  const persisted = persistedSteps(storage);
  expect(persisted.pointer).toBe(-1);
  (persisted.steps[0]!.parts[0] as unknown as { previous: unknown }).previous = { name: "Tampered" };
  storage.setItem("sequence-editor-history", JSON.stringify(persisted));

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(liveJson)).toBe(false);
  expect(restored.canRedo).toBe(false);
});

test("applyParts applies previous and next states for all three part kinds", () => {
  const diagram = makeDiagram();
  const originalSequence = diagram.sequences[0]!;
  const sequenceBefore = originalSequence.toJSON();
  const sequenceAfter = { ...sequenceBefore, name: "Circles" };
  const listAfter = [sequenceBefore, sequenceAfter];

  const parts: StepPart[] = [
    {
      kind: "diagram",
      previous: { name: "Diagram" },
      next: { name: "Renamed", bpm: 90, videoUrl: "video.mp4", backgroundImageOpacity: 0.5, symmetric: true },
    },
    { kind: "sequence", index: 0, previous: sequenceBefore, next: sequenceAfter },
    { kind: "sequences", previous: [sequenceBefore], next: listAfter },
  ];

  applyParts(diagram, parts, "previous");
  expect(diagram.name).toBe("Diagram");
  expect(diagram.bpm).toBeUndefined();
  expect(diagram.sequences).toHaveLength(1);
  expect(diagram.sequences[0]).not.toBe(originalSequence);
  expect(diagram.sequences[0] instanceof Sequence).toBe(true);

  applyParts(diagram, parts, "next");
  expect(diagram.name).toBe("Renamed");
  expect(diagram.bpm).toBe(90);
  expect(diagram.videoUrl).toBe("video.mp4");
  expect(diagram.backgroundImageOpacity).toBe(0.5);
  expect(diagram.symmetric).toBe(true);
  expect(diagram.sequences).toHaveLength(2);
  expect(diagram.sequences[0]).not.toBe(originalSequence);
  expect(diagram.sequences[0] instanceof Sequence).toBe(true);
  expect(diagram.sequences[1]!.name).toBe("Circles");
});

test("applyParts skips an out-of-range sequence index", () => {
  const diagram = makeDiagram();
  const json = diagram.sequences[0]!.toJSON();
  applyParts(diagram, [{ kind: "sequence", index: 5, previous: json, next: json }], "next");
  expect(diagram.sequences).toHaveLength(1);
  expect(diagram.sequences[0]).toBeTruthy();
});

test("reset sets the baseline so the next commit diffs from it", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.reset(JSON.stringify(diagram.toJSON()));
  diagram.name = "Renamed";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(1);
  expect((persisted.steps[0]!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Diagram");
  expect(persisted.steps[0]!.label).toBe("Diagram options");
});

test("clear empties everything and removes the persisted entry", () => {
  const { storage, entries } = makeStorage();
  const history = new EditHistory({ storage });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "Renamed";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  expect(entries.has("sequence-editor-history")).toBe(true);

  history.clear();
  expect(entries.has("sequence-editor-history")).toBe(false);
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(false);
});

test("diffDiagram reports the sequence list when the counts differ", () => {
  const previous = makeDiagram();
  const next = makeDiagram();
  next.addSequence(new Sequence(makeStraightPath()));
  const parts = diffDiagram(previous.toJSON(), next.toJSON());
  expect(parts).toHaveLength(1);
  expect(parts[0]!.kind).toBe("sequences");
  expect(labelOf(parts)).toBe("Sequence list");
});

test("labelOf names the changed sequence fields", () => {
  const diagram = makeDiagram();
  const before = diagram.sequences[0]!.toJSON();
  const after = { ...before, name: "Circles", traceColorL: "#00ff00" };
  expect(labelOf([{ kind: "sequence", index: 0, previous: before, next: after }])).toBe(
    "Sequence name, Trace colors",
  );
});

function sequencePart(mutate: (json: SequenceJSON) => SequenceJSON): StepPart {
  const diagram = makeDiagram();
  const before = diagram.sequences[0]!.toJSON();
  return { kind: "sequence", index: 0, previous: before, next: mutate(before) };
}

test("labelOf names each changed sequence field", () => {
  expect(labelOf([sequencePart((json) => ({ ...json, path: { curves: [] } as typeof json.path }))])).toBe("Path");
  expect(
    labelOf([sequencePart((json) => ({ ...json, elements: [{ type: "Other", start: 0, end: 1 }] as typeof json.elements }))]),
  ).toBe("Elements");
  expect(
    labelOf([sequencePart((json) => ({ ...json, keyframes: { ...json.keyframes, time: [] as typeof json.keyframes.time } }))]),
  ).toBe("Timing");
  expect(
    labelOf([sequencePart((json) => ({ ...json, annotations: [{ title: "Note" }] as typeof json.annotations }))]),
  ).toBe("Annotations");
  // A foot keyframe edit changes no labeled field, so the fallback name applies.
  expect(
    labelOf([
      sequencePart((json) => ({
        ...json,
        keyframes: { ...json.keyframes, footL: [{ coordinate: 0 }] as typeof json.keyframes.footL },
      })),
    ]),
  ).toBe("Sequence");
});

test("a commit spanning the diagram and two sequences makes one step with three parts", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = new Diagram("Diagram", [new Sequence(makeStraightPath()), new Sequence(makeStraightPath())]);
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "Renamed";
  diagram.sequences[0]!.name = "First";
  diagram.sequences[1]!.name = "Second";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  expect(persisted.steps).toHaveLength(1);
  expect(persisted.steps[0]!.parts).toHaveLength(3);
  expect(persisted.steps[0]!.parts.map((part) => part.kind)).toEqual(["diagram", "sequence", "sequence"]);
  const labels = persisted.steps[0]!.label.split(", ");
  expect(labels).toContain("Diagram options");
  // The dedup keeps one entry for the two changed sequence names.
  expect(labels.filter((label) => label === "Sequence name")).toHaveLength(1);
});

test("applyPartsToJson applies both directions without touching the input json", () => {
  const json = new Diagram("Diagram", [new Sequence(makeStraightPath()), new Sequence(makeStraightPath())]).toJSON();
  const jsonBefore = JSON.stringify(json);
  const sequenceBefore = json.sequences[0]!;
  const parts: StepPart[] = [
    { kind: "diagram", previous: { name: "Diagram" }, next: { name: "Renamed", bpm: 90 } },
    {
      kind: "sequences",
      previous: [sequenceBefore],
      next: [sequenceBefore, { ...json.sequences[1]!, name: "Second" }],
    },
    { kind: "sequence", index: 0, previous: sequenceBefore, next: { ...sequenceBefore, name: "First" } },
    // Out-of-range indices are ignored in both directions.
    { kind: "sequence", index: 5, previous: sequenceBefore, next: sequenceBefore },
    { kind: "sequence", index: -1, previous: sequenceBefore, next: sequenceBefore },
  ];

  const applied = applyPartsToJson(json, parts, "next");
  expect(applied).not.toBe(json);
  expect(JSON.stringify(json)).toBe(jsonBefore);
  expect(applied.name).toBe("Renamed");
  expect(applied.bpm).toBe(90);
  expect(applied.sequences[0]!.name).toBe("First");
  expect(applied.sequences).toHaveLength(2);
  expect(applied.sequences[1]!.name).toBe("Second");

  const reverted = applyPartsToJson(applied, parts, "previous");
  expect(reverted).not.toBe(applied);
  expect(reverted.name).toBe("Diagram");
  expect(reverted.bpm).toBeUndefined();
  expect(reverted.sequences[0]!.name).toBe(sequenceBefore.name ?? "Sequence");
  expect(reverted.sequences).toHaveLength(1);
});

test("rehydrate rejects corrupt json", () => {
  const { storage } = makeStorage();
  storage.setItem("sequence-editor-history", "not json{{");
  const restored = new EditHistory({ storage });
  expect(restored.rehydrate(JSON.stringify(makeDiagram().toJSON()))).toBe(false);
  expect(restored.canUndo).toBe(false);
  expect(restored.canRedo).toBe(false);
});

test("rehydrate rejects a wrong persisted version", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = JSON.parse(storage.getItem("sequence-editor-history")!) as { version: number };
  persisted.version = 999;
  storage.setItem("sequence-editor-history", JSON.stringify(persisted));

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(JSON.stringify(diagram.toJSON()))).toBe(false);
  expect(restored.canUndo).toBe(false);
  expect(restored.canRedo).toBe(false);
});

test("rehydrate rejects a bad pointer", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "One";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  const liveJson = JSON.stringify(diagram.toJSON());

  const persisted = JSON.parse(storage.getItem("sequence-editor-history")!) as { steps: unknown[]; pointer: number };
  for (const pointer of [1.5, -2, persisted.steps.length]) {
    persisted.pointer = pointer;
    storage.setItem("sequence-editor-history", JSON.stringify(persisted));
    const restored = new EditHistory({ storage, now: clock.now });
    expect(restored.rehydrate(liveJson), `pointer ${pointer}`).toBe(false);
    expect(restored.canUndo, `pointer ${pointer}`).toBe(false);
    expect(restored.canRedo, `pointer ${pointer}`).toBe(false);
  }
});

test("a commit right after a redo never merges even inside the window", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  diagram.name = "First";
  history.commit(JSON.stringify(diagram.toJSON()), true);
  clock.advance(1000);
  diagram.name = "Second";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const undone = history.undo()!;
  applyParts(diagram, undone.parts, "previous");
  const redone = history.redo()!;
  applyParts(diagram, redone.parts, "next");
  clock.advance(50);
  diagram.name = "Third";
  history.commit(JSON.stringify(diagram.toJSON()), true);

  const persisted = persistedSteps(storage);
  // The redo marks the last operation, so the third commit is a separate step.
  expect(persisted.steps).toHaveLength(3);
  expect((persisted.steps[1]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Second");
  expect((persisted.steps[2]!.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Second");
  expect((persisted.steps[2]!.parts[0] as { next: DiagramOptions }).next.name).toBe("Third");
  expect(history.canRedo).toBe(false);
});

test("capacity with undos walks back to the trimmed boundary and redoes forward", () => {
  const { storage } = makeStorage();
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now, capacity: 3 });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  for (const name of ["One", "Two", "Three", "Four", "Five"]) {
    clock.advance(1000);
    diagram.name = name;
    history.commit(JSON.stringify(diagram.toJSON()), true);
  }

  expect(history.canUndo).toBe(true);
  const undone = [history.undo()!, history.undo()!, history.undo()!];
  expect(undone.map((step) => (step.parts[0] as { previous: DiagramOptions }).previous.name)).toEqual([
    "Four",
    "Three",
    "Two",
  ]);
  expect(history.undo()).toBeNull();
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(true);

  const redone = [history.redo()!, history.redo()!, history.redo()!];
  expect(redone.map((step) => (step.parts[0] as { next: DiagramOptions }).next.name)).toEqual([
    "Three",
    "Four",
    "Five",
  ]);
  expect(history.redo()).toBeNull();
});

test("a quota drop during an undo clamps the pointer and the result rehydrates", () => {
  const entries = new Map<string, string>();
  const storage: HistoryStorage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      // The full history exceeds the quota; a halved copy fits.
      if ((JSON.parse(value) as { steps: unknown[] }).steps.length > 2) throw new Error("quota exceeded");
      entries.set(key, value);
    },
    removeItem: (key: string) => void entries.delete(key),
  };
  const clock = makeClock();
  const history = new EditHistory({ storage, now: clock.now });
  const diagram = makeDiagram();
  history.commit(JSON.stringify(diagram.toJSON()), true);
  for (const name of ["One", "Two", "Three", "Four"]) {
    clock.advance(1000);
    diagram.name = name;
    history.commit(JSON.stringify(diagram.toJSON()), true);
  }

  const first = history.undo()!;
  applyParts(diagram, first.parts, "previous");
  const second = history.undo()!;
  applyParts(diagram, second.parts, "previous");
  expect((first.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Three");
  expect((second.parts[0] as { previous: DiagramOptions }).previous.name).toBe("Two");
  expect(diagram.name).toBe("Two");

  const persisted = JSON.parse(storage.getItem("sequence-editor-history")!) as {
    steps: unknown[];
    pointer: number;
  };
  expect(persisted.pointer).toBe(-1);
  expect(persisted.steps).toHaveLength(2);

  const restored = new EditHistory({ storage, now: clock.now });
  expect(restored.rehydrate(JSON.stringify(diagram.toJSON()))).toBe(true);
  expect(restored.canUndo).toBe(false);
  expect(restored.canRedo).toBe(true);
  const redone = restored.redo()!;
  expect((redone.parts[0] as { next: DiagramOptions }).next.name).toBe("Three");
});
