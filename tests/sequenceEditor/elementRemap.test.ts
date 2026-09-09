import { describe, expect, it } from "vitest";
import { remapUniformAtJoint } from "../../src/engine/sequenceEditor/editor";
import { Path } from "../../src/engine/path";
import { Curve, type Curvilinear } from "../../src/engine/curve";
import { Vector } from "../../src/engine/vector";
import { Sequence } from "../../src/engine/sequence";
import { createDefaultFootTurn } from "../../src/engine/element/turnTypes";

/**
 * Build a straight 9 m path of three 3 m horizontal segments: joint A at
 * x = 0, B at x = 3, C at x = 6, D at x = 9.
 */
function makePath(): Path {
  const straight = (x0: number): Curve =>
    new Curve(
      new Vector(x0, 0),
      new Vector(x0 + 1, 0),
      new Vector(x0 + 2, 0),
      new Vector(x0 + 3, 0),
    );
  const path = new Path();
  path.curves = [straight(0), straight(3), straight(6)];
  path.updateLength();
  return path;
}

/** Old and new axis tables of the path, as the editor computes them. */
function axisTables(path: Path): { starts: number[]; lengths: number[] } {
  const starts: number[] = [];
  const lengths: number[] = [];
  let cumulated = 0;
  for (const curve of path.curves) {
    starts.push(cumulated);
    lengths.push(curve.length);
    cumulated += curve.length;
  }
  return { starts, lengths };
}

describe("remapUniformAtJoint", () => {
  // Three 3 m curves before (starts 0, 3, 6); after dragging B from x = 3 to
  // x = 2 uniformly: curve 0 is 2 m, curve 1 keeps 3 m, curve 2 keeps 3 m.
  const oldStarts = [0, 3, 6];
  const oldLengths = [3, 3, 3];
  const newStarts = [0, 2, 5];
  const newLengths = [2, 3, 3];

  it("keeps the ratio of a point on the curve ending at the joint", () => {
    // u = 1.5 is half of the old curve 0; half of the new curve 0 is 1.
    const newU = remapUniformAtJoint(1.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(1, 10);
    expect(newU / newLengths[0]!).toBeCloseTo(1.5 / oldLengths[0]!, 10);
  });

  it("keeps the ratio of a point on the curve starting at the joint", () => {
    // u = 4.5 is half of the old curve 1; half of the new curve 1 is 3.5.
    const newU = remapUniformAtJoint(4.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(3.5, 10);
    expect((newU - newStarts[1]!) / newLengths[1]!).toBeCloseTo((4.5 - oldStarts[1]!) / oldLengths[1]!, 10);
  });

  it("keeps the place of a point on an unaffected later curve", () => {
    // Curve 2 keeps its length; its start offset shifts from 6 to 5, so
    // u = 7.5 keeps its half-way place but shifts by -1.
    const newU = remapUniformAtJoint(7.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(6.5, 10);
    expect((newU - newStarts[2]!) / newLengths[2]!).toBeCloseTo((7.5 - oldStarts[2]!) / oldLengths[2]!, 10);
  });

  it("keeps boundary points valid: at the joint and at the path end", () => {
    const atJoint = remapUniformAtJoint(3, oldStarts, oldLengths, newStarts, newLengths);
    expect(atJoint).toBeCloseTo(2, 10); // The new joint position.
    const atEnd = remapUniformAtJoint(9, oldStarts, oldLengths, newStarts, newLengths);
    expect(atEnd).toBeCloseTo(8, 10); // The new total length.
    expect(atEnd).toBeLessThanOrEqual(8);
  });

  it("gives ratio 0 for a point on a zero-length curve", () => {
    // Curve 0 has zero length, so the joint sits at its start. A point there
    // maps to the start of the new curve 1 with no within-curve ratio.
    const newU = remapUniformAtJoint(0, [0, 0, 3], [0, 3, 3], [0, 2, 5], [2, 3, 3]);
    expect(newU).toBeCloseTo(2, 10);
  });

  it("gives 0 on empty tables and clamps past-the-end points", () => {
    expect(remapUniformAtJoint(5, [], [], [], [])).toBe(0);
    // A point past the end of the old axis maps to the new total length.
    const newU = remapUniformAtJoint(20, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(8, 10);
  });
});

describe("joint move remap through the editor data flow", () => {
  it("re-bases element spans after dragging joint B", () => {
    const path = makePath();
    const sequence = new Sequence(path);
    // One element fully on AB, one fully on BC, one fully on CD.
    const onAB = createDefaultFootTurn(1.5 as never, 1.6 as never);
    const onBC = createDefaultFootTurn(4 as never, 5 as never);
    const onCD = createDefaultFootTurn(7 as never, 8 as never);
    sequence.addElement(onAB);
    sequence.addElement(onBC);
    sequence.addElement(onCD);

    // Snapshot the axis before the move (as makeJointMoveSnapshot does).
    const before = axisTables(path);

    // Simulate dragging joint B from x = 3 to x = 2: the flanking handles
    // move with the anchor (alignNeighbors translates them by the delta).
    path.curves[0]!.p3 = new Vector(2, 0);
    path.curves[0]!.p1 = new Vector(0, 0);
    path.curves[0]!.p2 = new Vector(1, 0);
    // Curve BC starts at B'= x = 2; its handles keep their offsets: p1 = 4,
    // p2 = 5 shift to 3 and 4. Its end (joint C) stays at x = 6.
    path.curves[1]!.p0 = path.curves[0]!.p3;
    path.curves[1]!.p1 = new Vector(3, 0);
    path.curves[1]!.p2 = new Vector(4, 0);
    path.updateLength();
    const after = axisTables(path);

    // Editor remap step (as remapElementsAfterJointMove does).
    const remap = (u: number): number =>
      remapUniformAtJoint(u, before.starts, before.lengths, after.starts, after.lengths);
    onAB.start = remap(onAB.start as number) as never;
    onAB.end = remap(onAB.end as number) as never;
    onBC.start = remap(onBC.start as number) as never;
    onBC.end = remap(onBC.end as number) as never;
    onCD.start = remap(onCD.start as number) as never;
    onCD.end = remap(onCD.end as number) as never;

    // AB shrank (its old length 3 m): the ratios within it are preserved,
    // using the actual recomputed curve length.
    const newLenAB = after.lengths[0]!;
    expect(onAB.start as number).toBeCloseTo((1.5 / 3) * newLenAB, 6);
    expect(onAB.end as number).toBeCloseTo((1.6 / 3) * newLenAB, 6);
    expect(newLenAB).toBeLessThan(3); // B moved closer to A, so AB shrank.

    // The place within BC is preserved (BC length changed: a rigid handle
    // translation keeps the old handle offsets, so the arc is not straight).
    const newStartBC = after.starts[1]!;
    const newLenBC = after.lengths[1]!;
    expect((onBC.start as number - newStartBC) / newLenBC).toBeCloseTo((4 - 3) / 3, 6);
    expect((onBC.end as number - newStartBC) / newLenBC).toBeCloseTo((5 - 3) / 3, 6);

    // CD keeps its real length and its place: only the start offset shifts.
    const newStartCD = after.starts[2]!;
    const newLenCD = after.lengths[2]!;
    expect(newLenCD).toBeCloseTo(3, 6);
    expect((onCD.start as number - newStartCD) / newLenCD).toBeCloseTo(1 / 3, 6);
    expect((onCD.end as number - newStartCD) / newLenCD).toBeCloseTo(2 / 3, 6);

    // Every remapped coordinate stays on the path.
    for (const value of [onAB.start, onAB.end, onBC.start, onBC.end, onCD.start, onCD.end]) {
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(path.length);
    }
  });

  it("keeps an element spanning the joint on its two halves", () => {
    const path = makePath();
    const sequence = new Sequence(path);
    // The element starts on AB and ends on BC, across the joint at u = 3.
    const across = createDefaultFootTurn(2.1 as never, 3.9 as never);
    sequence.addElement(across);

    const before = axisTables(path);
    path.curves[0]!.p3 = new Vector(4, 0);
    path.curves[0]!.p1 = new Vector(1.33333, 0);
    path.curves[0]!.p2 = new Vector(2.66667, 0);
    path.curves[1]!.p0 = path.curves[0]!.p3;
    path.curves[1]!.p1 = new Vector(5, 0);
    path.curves[1]!.p2 = new Vector(6, 0);
    path.updateLength();
    const after = axisTables(path);

    const remap = (u: number): number =>
      remapUniformAtJoint(u, before.starts, before.lengths, after.starts, after.lengths);
    across.start = remap(across.start as number) as never;
    across.end = remap(across.end as number) as never;

    // The start keeps its ratio within AB (0.7 of 3 m now of 4 m).
    expect(across.start as number).toBeCloseTo((2.1 / 3) * 4, 3);
    // The end keeps its ratio within BC (0.3 of 3 m, BC translated rigidly).
    const newStartBC = after.starts[1]!;
    const newLenBC = after.lengths[1]!;
    expect((across.end as number - newStartBC) / newLenBC).toBeCloseTo((3.9 - 3) / 3, 6);
  });

  it("measures curves with arc length integration (Curvilinear import used)", () => {
    // Sanity check of the path used above: straight curves measure their
    // control-point span exactly.
    const path = makePath();
    expect(path.length).toBeCloseTo(9, 6);
    expect(path.curves[0]!.arcLength(0 as Curvilinear, 1 as Curvilinear)).toBeCloseTo(3, 6);
  });
});
