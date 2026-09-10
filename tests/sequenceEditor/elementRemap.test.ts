import { describe, expect, it } from "vitest";
import { remapUniformAtJoint } from "../../src/engine/sequenceEditor/editor";
import { Path } from "../../src/engine/path";
import { Curve, type Curvilinear } from "../../src/engine/curve";
import { Vector } from "../../src/engine/vector";
import { Sequence } from "../../src/engine/sequence";
import { createDefaultFootTurn } from "../../src/engine/element/turnTypes";

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
  const oldStarts = [0, 3, 6];
  const oldLengths = [3, 3, 3];
  const newStarts = [0, 2, 5];
  const newLengths = [2, 3, 3];

  it("keeps the ratio of a point on the curve ending at the joint", () => {
    const newU = remapUniformAtJoint(1.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(1, 10);
    expect(newU / newLengths[0]!).toBeCloseTo(1.5 / oldLengths[0]!, 10);
  });

  it("keeps the ratio of a point on the curve starting at the joint", () => {
    const newU = remapUniformAtJoint(4.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(3.5, 10);
    expect((newU - newStarts[1]!) / newLengths[1]!).toBeCloseTo((4.5 - oldStarts[1]!) / oldLengths[1]!, 10);
  });

  it("keeps the place of a point on an unaffected later curve", () => {
    const newU = remapUniformAtJoint(7.5, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(6.5, 10);
    expect((newU - newStarts[2]!) / newLengths[2]!).toBeCloseTo((7.5 - oldStarts[2]!) / oldLengths[2]!, 10);
  });

  it("keeps boundary points valid: at the joint and at the path end", () => {
    const atJoint = remapUniformAtJoint(3, oldStarts, oldLengths, newStarts, newLengths);
    expect(atJoint).toBeCloseTo(2, 10);
    const atEnd = remapUniformAtJoint(9, oldStarts, oldLengths, newStarts, newLengths);
    expect(atEnd).toBeCloseTo(8, 10);
    expect(atEnd).toBeLessThanOrEqual(8);
  });

  it("gives ratio 0 for a point on a zero-length curve", () => {
    const newU = remapUniformAtJoint(0, [0, 0, 3], [0, 3, 3], [0, 2, 5], [2, 3, 3]);
    expect(newU).toBeCloseTo(2, 10);
  });

  it("gives 0 on empty tables and clamps past-the-end points", () => {
    expect(remapUniformAtJoint(5, [], [], [], [])).toBe(0);
    const newU = remapUniformAtJoint(20, oldStarts, oldLengths, newStarts, newLengths);
    expect(newU).toBeCloseTo(8, 10);
  });
});

describe("joint move remap through the editor data flow", () => {
  it("re-bases element spans after dragging joint B", () => {
    const path = makePath();
    const sequence = new Sequence(path);
    const onAB = createDefaultFootTurn(1.5 as never, 1.6 as never);
    const onBC = createDefaultFootTurn(4 as never, 5 as never);
    const onCD = createDefaultFootTurn(7 as never, 8 as never);
    sequence.addElement(onAB);
    sequence.addElement(onBC);
    sequence.addElement(onCD);

    const before = axisTables(path);

    path.curves[0]!.p3 = new Vector(2, 0);
    path.curves[0]!.p1 = new Vector(0, 0);
    path.curves[0]!.p2 = new Vector(1, 0);
    path.curves[1]!.p0 = path.curves[0]!.p3;
    path.curves[1]!.p1 = new Vector(3, 0);
    path.curves[1]!.p2 = new Vector(4, 0);
    path.updateLength();
    const after = axisTables(path);

    const remap = (u: number): number =>
      remapUniformAtJoint(u, before.starts, before.lengths, after.starts, after.lengths);
    onAB.start = remap(onAB.start as number) as never;
    onAB.end = remap(onAB.end as number) as never;
    onBC.start = remap(onBC.start as number) as never;
    onBC.end = remap(onBC.end as number) as never;
    onCD.start = remap(onCD.start as number) as never;
    onCD.end = remap(onCD.end as number) as never;

    const newLenAB = after.lengths[0]!;
    expect(onAB.start as number).toBeCloseTo((1.5 / 3) * newLenAB, 6);
    expect(onAB.end as number).toBeCloseTo((1.6 / 3) * newLenAB, 6);
    expect(newLenAB).toBeLessThan(3);

    const newStartBC = after.starts[1]!;
    const newLenBC = after.lengths[1]!;
    expect((onBC.start as number - newStartBC) / newLenBC).toBeCloseTo((4 - 3) / 3, 6);
    expect((onBC.end as number - newStartBC) / newLenBC).toBeCloseTo((5 - 3) / 3, 6);

    const newStartCD = after.starts[2]!;
    const newLenCD = after.lengths[2]!;
    expect(newLenCD).toBeCloseTo(3, 6);
    expect((onCD.start as number - newStartCD) / newLenCD).toBeCloseTo(1 / 3, 6);
    expect((onCD.end as number - newStartCD) / newLenCD).toBeCloseTo(2 / 3, 6);

    for (const value of [onAB.start, onAB.end, onBC.start, onBC.end, onCD.start, onCD.end]) {
      expect(value as number).toBeGreaterThanOrEqual(0);
      expect(value as number).toBeLessThanOrEqual(path.length);
    }
  });

  it("keeps an element spanning the joint on its two halves", () => {
    const path = makePath();
    const sequence = new Sequence(path);
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

    expect(across.start as number).toBeCloseTo((2.1 / 3) * 4, 3);
    const newStartBC = after.starts[1]!;
    const newLenBC = after.lengths[1]!;
    expect((across.end as number - newStartBC) / newLenBC).toBeCloseTo((3.9 - 3) / 3, 6);
  });

  it("measures curves with arc length integration (Curvilinear import used)", () => {
    const path = makePath();
    expect(path.length).toBeCloseTo(9, 6);
    expect(path.curves[0]!.arcLength(0 as Curvilinear, 1 as Curvilinear)).toBeCloseTo(3, 6);
  });
});
