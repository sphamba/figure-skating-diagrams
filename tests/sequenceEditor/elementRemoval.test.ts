import { describe, expect, it } from "vitest";
import { remapUniformAtRemoval } from "../../src/engine/sequenceEditor/editor";
import { Path } from "../../src/engine/path";
import { Curve, type Curvilinear } from "../../src/engine/curve";
import { Vector } from "../../src/engine/vector";
import { Sequence } from "../../src/engine/sequence";
import { createDefaultFootTurn } from "../../src/engine/element/turnTypes";

/**
 * Build a straight 9 m path of three 3 m horizontal segments: joint A at
 * x = 0, B at x = 3, C at x = 6, D at x = 9. The joints B (x = 3) and
 * C (x = 6) are shared point objects between their two curves.
 */
function makePath(): Path {
  const straight = (x0: number): Curve =>
    new Curve(new Vector(x0, 0), new Vector(x0 + 1, 0), new Vector(x0 + 2, 0), new Vector(x0 + 3, 0));
  const path = new Path();
  path.curves = [straight(0), straight(3), straight(6)];
  // Connect the joints so they are one shared point object, as path.fromJSON
  // and the editor do.
  path.curves[1]!.p0 = path.curves[0]!.p3;
  path.curves[2]!.p0 = path.curves[1]!.p3;
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

describe("remapUniformAtRemoval", () => {
  // Plain tables of a removal: old curves [0..3, 3..6, 6..9, 9..12] (4 curves
  // of 3 m); curves 1 and 2 merge away into a 5 m curve. New curves:
  // [0..3, merged 3..8, 8..11]. jointOldIndex = 1, mergedOldCount = 2.
  const oldStarts = [0, 3, 6, 9];
  const oldLengths = [3, 3, 3, 3];
  const newStarts = [0, 3, 8];
  const newLengths = [3, 5, 3];

  it("keeps the ratio within an unchanged curve before the merge", () => {
    // u = 1.5 is half of old curve 0; half of new curve 0 is 1.5.
    const newU = remapUniformAtRemoval(1.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(1.5, 10);
  });

  it("measures the ratio from the merge start over the whole merged range", () => {
    // u = 4.5 on old curve 1: AP = 4.5, AC = 6 (aggregate 3 to 9), so the
    // ratio from A is 0.25, NOT the ratio within curve 1 (0.5). The merged
    // curve is 5 m: the point lands at 3 + 0.25 * 5 = 4.25.
    const newU = remapUniformAtRemoval(4.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(4.25, 10);
    // Same check on curve 2: u = 7.5 gives AP = 7.5, AC = 6, ratio 0.75, so
    // the point lands at 3 + 0.75 * 5 = 6.75.
    const newU2 = remapUniformAtRemoval(7.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU2).toBeCloseTo(6.75, 10);
  });

  it("keeps the place of a point on an unaffected later curve", () => {
    // Old curve 3 keeps its length 3 m; its start offset shifts from 9 to 8,
    // so u = 10.5 keeps its half-way place but shifts by -1.
    const newU = remapUniformAtRemoval(10.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(9.5, 10);
    expect((newU - newStarts[2]!) / newLengths[2]!).toBeCloseTo((10.5 - oldStarts[3]!) / oldLengths[3]!, 10);
  });

  it("keeps boundary points valid: merge bounds, removed joint, path end", () => {
    // u = 3 is the merge start (end of curve 0 / start of curve 1): it maps
    // to the start of the merged curve, 3.
    const atMergeStart = remapUniformAtRemoval(3, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atMergeStart).toBeCloseTo(3, 10);
    // u = 9 is the removed joint (merge end / start of curve 3): it maps to
    // the end of the merged curve (point C), 8.
    const atJoint = remapUniformAtRemoval(9, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atJoint).toBeCloseTo(8, 10);
    // u = 12 is the path end: it maps to the new total length, 11.
    const atEnd = remapUniformAtRemoval(12, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atEnd).toBeCloseTo(11, 10);
    expect(atEnd).toBeLessThanOrEqual(11);
  });

  it("gives ratio 0 for a point on a zero-length curve and clamps past the end", () => {
    // Old curve 0 has zero length (a zero-length lead curve): the merged
    // range starts at 0, so a point at the merge start maps to the start of
    // the merged curve on the new axis, 5. A point past the old axis maps to
    // the new total length.
    const zero = remapUniformAtRemoval(0, [0, 0, 3, 6], [0, 3, 3, 3], [0, 5, 8], [5, 3, 3], 1, 2);
    expect(zero).toBeCloseTo(5, 10);
    const past = remapUniformAtRemoval(20, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(past).toBeCloseTo(11, 10);
  });

  it("gives 0 on empty tables", () => {
    expect(remapUniformAtRemoval(5, [], [], [], [], 1, 2)).toBe(0);
  });
});

describe("joint removal remap through the editor data flow", () => {
  it("re-bases element spans after removing joint B", () => {
    const path = makePath();
    const sequence = new Sequence(path);
    // One element fully on AB, one fully on BC, one fully on CD.
    const onAB = createDefaultFootTurn(1.5 as never, 1.6 as never);
    const onBC = createDefaultFootTurn(4 as never, 5 as never);
    const onCD = createDefaultFootTurn(7 as never, 8 as never);
    sequence.addElement(onAB);
    sequence.addElement(onBC);
    sequence.addElement(onCD);

    // Snapshot before the removal (as makeJointDeletionSnapshot does). The
    // removed joint is B (curveBefore index 0).
    const before = axisTables(path);
    const jointOldIndex = 0;

    // Remove B (the shared joint object of curves 0 and 1).
    path.removePoint(path.curves[0]!.p3);
    const after = axisTables(path);
    expect(path.curves.length).toBe(2);

    // Editor remap step (as remapElementsAfterCurveRemoval does). The merged
    // curve carries the aggregate ratio measured from A: AP'/AC' == AP/AC.
    const aggregateOld = before.lengths[0]! + before.lengths[1]!;
    const remap = (u: number): number =>
      remapUniformAtRemoval(u, before.starts, before.lengths, after.starts, after.lengths, jointOldIndex, 2);
    onAB.start = remap(onAB.start as number) as never;
    onAB.end = remap(onAB.end as number) as never;
    onBC.start = remap(onBC.start as number) as never;
    onBC.end = remap(onBC.end as number) as never;
    onCD.start = remap(onCD.start as number) as never;
    onCD.end = remap(onCD.end as number) as never;

    // The merged curve is straight here, so its length is close to the
    // aggregate length (up to integration resolution): every point between
    // A and C keeps its exact ratio from A.
    const mergedLength = after.lengths[0]!;
    expect(mergedLength).toBeCloseTo(aggregateOld, 4);
    expect(onAB.start as number).toBeCloseTo((1.5 / aggregateOld) * mergedLength, 6);
    expect(onAB.end as number).toBeCloseTo((1.6 / aggregateOld) * mergedLength, 6);
    expect((onBC.start as number - after.starts[0]!) / mergedLength).toBeCloseTo(4 / aggregateOld, 6);
    expect((onBC.end as number - after.starts[0]!) / mergedLength).toBeCloseTo(5 / aggregateOld, 6);

    // CD is unaffected: same curve length, same place (the coordinate shifts
    // only by the merge length change, zero here).
    const newStartCD = after.starts[1]!;
    const newLenCD = after.lengths[1]!;
    expect(newLenCD).toBeCloseTo(3, 6);
    expect((onCD.start as number - newStartCD) / newLenCD).toBeCloseTo((7 - before.starts[2]!) / newLenCD, 6);
    expect((onCD.end as number - newStartCD) / newLenCD).toBeCloseTo((8 - before.starts[2]!) / newLenCD, 6);

    // Every remapped coordinate stays on the path.
    for (const value of [onAB.start, onAB.end, onBC.start, onBC.end, onCD.start, onCD.end]) {
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(path.length);
    }
  });

  it("re-bases ratios through a bent merge", () => {
    // The removed joint curve handles do not line up, so the merged curve is
    // bent: the merge keeps only the surviving control points, so its length
    // differs from the old aggregate and the ratios still hold from A.
    const path = new Path();
    const curveAB = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 0), new Vector(3, 0));
    const curveBC = new Curve(new Vector(3, 0), new Vector(4, 3), new Vector(5, 3), new Vector(6, 3));
    const curveCD = new Curve(new Vector(6, 3), new Vector(7, 3), new Vector(8, 3), new Vector(9, 3));
    path.curves = [curveAB, curveBC, curveCD];
    curveBC.p0 = curveAB.p3;
    curveCD.p0 = curveBC.p3;
    path.updateLength();

    const before = axisTables(path);
    const aggregate = before.lengths[0]! + before.lengths[1]!;
    const uOnBC = before.starts[1]! + before.lengths[1]! / 2; // mid of BC.

    // Remove B: the merged curve AC keeps AB's start handle and BC's end
    // handle, so it is bent and shorter than the straight aggregate.
    path.removePoint(path.curves[0]!.p3);
    const after = axisTables(path);
    const mergedLength = after.lengths[0]!;
    expect(mergedLength).toBeLessThan(aggregate);

    // A point at AP = 4.5 from A sits at ratio 4.5 / aggregate over the
    // merged curve at exactly the same ratio of its (new) length.
    const newU = remapUniformAtRemoval(
      uOnBC,
      before.starts,
      before.lengths,
      after.starts,
      after.lengths,
      0,
      2,
    );
    expect((newU - after.starts[0]!) / mergedLength).toBeCloseTo((uOnBC - before.starts[0]!) / aggregate, 5);
  });

  it("measures curves with arc length integration (Curvilinear import used)", () => {
    // Sanity check of the path used above: straight curves measure their
    // control-point span exactly.
    const path = makePath();
    expect(path.length).toBeCloseTo(9, 6);
    expect(path.curves[0]!.arcLength(0 as Curvilinear, 1 as Curvilinear)).toBeCloseTo(3, 6);
  });
});
