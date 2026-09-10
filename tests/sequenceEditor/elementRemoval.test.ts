import { describe, expect, it } from "vitest";
import { remapUniformAtRemoval } from "../../src/engine/sequenceEditor/editor";
import { Path } from "../../src/engine/path";
import { Curve, type Curvilinear } from "../../src/engine/curve";
import { Vector } from "../../src/engine/vector";
import { Sequence } from "../../src/engine/sequence";
import { createDefaultFootTurn } from "../../src/engine/element/turnTypes";

function makePath(): Path {
  const straight = (x0: number): Curve =>
    new Curve(new Vector(x0, 0), new Vector(x0 + 1, 0), new Vector(x0 + 2, 0), new Vector(x0 + 3, 0));
  const path = new Path();
  path.curves = [straight(0), straight(3), straight(6)];
  path.curves[1]!.p0 = path.curves[0]!.p3;
  path.curves[2]!.p0 = path.curves[1]!.p3;
  path.updateLength();
  return path;
}

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
  const oldStarts = [0, 3, 6, 9];
  const oldLengths = [3, 3, 3, 3];
  const newStarts = [0, 3, 8];
  const newLengths = [3, 5, 3];

  it("keeps the ratio within an unchanged curve before the merge", () => {
    const newU = remapUniformAtRemoval(1.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(1.5, 10);
  });

  it("measures the ratio from the merge start over the whole merged range", () => {
    const newU = remapUniformAtRemoval(4.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(4.25, 10);
    const newU2 = remapUniformAtRemoval(7.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU2).toBeCloseTo(6.75, 10);
  });

  it("keeps the place of a point on an unaffected later curve", () => {
    const newU = remapUniformAtRemoval(10.5, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(newU).toBeCloseTo(9.5, 10);
    expect((newU - newStarts[2]!) / newLengths[2]!).toBeCloseTo((10.5 - oldStarts[3]!) / oldLengths[3]!, 10);
  });

  it("keeps boundary points valid: merge bounds, removed joint, path end", () => {
    const atMergeStart = remapUniformAtRemoval(3, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atMergeStart).toBeCloseTo(3, 10);
    const atJoint = remapUniformAtRemoval(9, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atJoint).toBeCloseTo(8, 10);
    const atEnd = remapUniformAtRemoval(12, oldStarts, oldLengths, newStarts, newLengths, 1, 2);
    expect(atEnd).toBeCloseTo(11, 10);
    expect(atEnd).toBeLessThanOrEqual(11);
  });

  it("gives ratio 0 for a point on a zero-length curve and clamps past the end", () => {
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
    const onAB = createDefaultFootTurn(1.5 as never, 1.6 as never);
    const onBC = createDefaultFootTurn(4 as never, 5 as never);
    const onCD = createDefaultFootTurn(7 as never, 8 as never);
    sequence.addElement(onAB);
    sequence.addElement(onBC);
    sequence.addElement(onCD);

    const before = axisTables(path);
    const jointOldIndex = 0;

    path.removePoint(path.curves[0]!.p3);
    const after = axisTables(path);
    expect(path.curves.length).toBe(2);

    const aggregateOld = before.lengths[0]! + before.lengths[1]!;
    const remap = (u: number): number =>
      remapUniformAtRemoval(u, before.starts, before.lengths, after.starts, after.lengths, jointOldIndex, 2);
    onAB.start = remap(onAB.start as number) as never;
    onAB.end = remap(onAB.end as number) as never;
    onBC.start = remap(onBC.start as number) as never;
    onBC.end = remap(onBC.end as number) as never;
    onCD.start = remap(onCD.start as number) as never;
    onCD.end = remap(onCD.end as number) as never;

    const mergedLength = after.lengths[0]!;
    expect(mergedLength).toBeCloseTo(aggregateOld, 4);
    expect(onAB.start as number).toBeCloseTo((1.5 / aggregateOld) * mergedLength, 6);
    expect(onAB.end as number).toBeCloseTo((1.6 / aggregateOld) * mergedLength, 6);
    expect((onBC.start as number - after.starts[0]!) / mergedLength).toBeCloseTo(4 / aggregateOld, 6);
    expect((onBC.end as number - after.starts[0]!) / mergedLength).toBeCloseTo(5 / aggregateOld, 6);

    const newStartCD = after.starts[1]!;
    const newLenCD = after.lengths[1]!;
    expect(newLenCD).toBeCloseTo(3, 6);
    expect((onCD.start as number - newStartCD) / newLenCD).toBeCloseTo((7 - before.starts[2]!) / newLenCD, 6);
    expect((onCD.end as number - newStartCD) / newLenCD).toBeCloseTo((8 - before.starts[2]!) / newLenCD, 6);

    for (const value of [onAB.start, onAB.end, onBC.start, onBC.end, onCD.start, onCD.end]) {
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(path.length);
    }
  });

  it("re-bases ratios through a bent merge", () => {
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
    const uOnBC = before.starts[1]! + before.lengths[1]! / 2;

    path.removePoint(path.curves[0]!.p3);
    const after = axisTables(path);
    const mergedLength = after.lengths[0]!;
    expect(mergedLength).toBeLessThan(aggregate);

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
    const path = makePath();
    expect(path.length).toBeCloseTo(9, 6);
    expect(path.curves[0]!.arcLength(0 as Curvilinear, 1 as Curvilinear)).toBeCloseTo(3, 6);
  });
});
