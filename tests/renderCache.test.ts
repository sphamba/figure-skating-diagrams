import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import { LeftForwardInsideGlide } from "../src/engine/element/glide.js";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { Vector } from "../src/engine/vector.js";

function makePath(): Path {
  const path = new Path();
  path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)));
  return path;
}

function makeStraightCurve(): Curve {
  return new Curve(new Vector(0, -1), new Vector(1 / 3, -1), new Vector(2 / 3, 0.5), new Vector(1, 1));
}

test("getDrawFootKeyframes drops a removed element after removeElement", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideGlide(0.1 as PathCoordinate, 0.4 as PathCoordinate));
  const removed = new LeftForwardInsideThreeTurn("footL", 0.5 as PathCoordinate, 0.9 as PathCoordinate);
  sequence.addElement(removed);

  const before = sequence.getDrawFootKeyframes("footL", 2);
  expect(before.some((keyframe) => keyframe.coordinate > 0.49 && keyframe.coordinate < 0.91)).toBe(true);

  sequence.removeElement(removed);

  const after = sequence.getDrawFootKeyframes("footL", 2);
  expect(after.some((keyframe) => keyframe.coordinate > 0.49 && keyframe.coordinate < 0.91)).toBe(false);
});

test("getDrawFootKeyframes recomputes after the scale or the length change", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.3 as PathCoordinate, 0.7 as PathCoordinate));
  sequence.getDrawFootKeyframes("footL", 2);
  const first = sequence.getDrawFootKeyframes("footL", 2);
  expect(first.length).toBeGreaterThan(0);

  sequence.path.updateLength();
  const afterLength = sequence.getDrawFootKeyframes("footL", 2);
  expect(afterLength.length).toBeGreaterThan(0);
});

test("resolveTimes recomputes after invalidateTimeCaches", () => {
  const sequence = new Sequence(makePath());
  const first = sequence.resolveTimes(120);
  expect(first).toBe(sequence.resolveTimes(120));

  const anotherBpm = sequence.resolveTimes(60);
  expect(anotherBpm.map((entry) => entry.time)).toEqual([0]);

  sequence.invalidateTimeCaches();
  expect(sequence.resolveTimes(120)).not.toBe(first);
});

test("getCurvilinearCoordFromUniform matches a linear scan on a curved sample set", () => {
  const curve = makeStraightCurve();
  const coordinates = curve.uniformCoordinates;
  for (let i = 0; i <= 200; i++) {
    const u = (i / 200) * curve.length;
    const binary = curve.getCurvilinearCoordFromUniform(u);
    if (u >= curve.length) {
      expect(binary).toBe(1);
      continue;
    }
    const originalUpper = coordinates.findIndex((x: number) => x > u);
    const original =
      originalUpper <= 0
        ? 0
        : (((u - coordinates[originalUpper - 1]!) / (coordinates[originalUpper]! - coordinates[originalUpper - 1]!)) *
            (Math.min(originalUpper * 0.001, 1) -
              Math.min((originalUpper - 1) * 0.001, 1)) +
            (originalUpper - 1) * 0.001) as number;
    expect(binary as number).toBeCloseTo(original, 6);
  }
  expect(curve.getCurvilinearCoordFromUniform(curve.length)).toBe(1);
});
