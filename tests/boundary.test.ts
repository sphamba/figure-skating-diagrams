import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { LeftForwardInsideGlide } from "../src/engine/element/glide";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn";
import { Sequence } from "../src/engine/sequence";
import { MIN_SCALE_GAP } from "../src/engine/element/spanScaling";
import { Vector } from "../src/engine/vector";

function makePath(): Path {
  const p0 = new Vector(0, 0);
  const p1 = new Vector(1 / 3, 0);
  const p2 = new Vector(2 / 3, 0);
  const p3 = new Vector(1, 0);
  const path = new Path();
  path.addCurveEnd(new Curve(p0, p1, p2, p3));
  return path;
}

function glide(start: number, end: number): LeftForwardInsideGlide {
  return new LeftForwardInsideGlide(start as PathCoordinate, end as PathCoordinate);
}

function footLCoordinates(sequence: Sequence): number[] {
  return sequence.keyframes.footL.map((keyframe) => keyframe.coordinate);
}

test("adjacent element boundaries get the 0.001 m delta in the stored keyframes", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(1, 2));

  expect(footLCoordinates(sequence)).toEqual([0, 1, 1.001, 2]);
});

test("overlapping element boundaries move to their midpoint with the delta", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(0.5, 1.5));

  expect(footLCoordinates(sequence)).toEqual([0, 0.75, 0.751, 1.5]);
});

test("already separated element boundaries are left untouched", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(1.01, 2));

  expect(footLCoordinates(sequence)).toEqual([0, 1, 1.01, 2]);
});

test("a zero-size element keeps its own keyframes in place", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 0.5));
  sequence.addElement(glide(0.5, 0.5));
  sequence.addElement(glide(0.5, 1));

  expect(footLCoordinates(sequence)).toEqual([0, 0.5, 0.5, 0.5, 0.501, 1]);
});

test("scaled draw keyframes never overlap at the element boundaries", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.1 as PathCoordinate, 0.2 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.35 as PathCoordinate));

  const keyframes = sequence.getDrawFootKeyframes("footR", 3);
  const coordinates = keyframes.map((keyframe) => keyframe.coordinate);

  expect(coordinates).toEqual([
    expect.closeTo(0.076, 8),
    expect.closeTo(0.224, 8),
    expect.closeTo(0.226, 8),
    expect.closeTo(0.374, 8),
  ]);
  expect(coordinates[2] - coordinates[1]).toBeCloseTo(MIN_SCALE_GAP, 6);
  for (let index = 1; index < coordinates.length; index++) {
    expect(coordinates[index]).toBeGreaterThan(coordinates[index - 1]);
  }
});

test("draw keyframes of glides stay on the real span under a scale", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(1.05, 2));

  const keyframes = sequence.getDrawFootKeyframes("footL", 1.5);

  expect(keyframes.map((keyframe) => keyframe.coordinate)).toEqual([0, 1, 1.05, 2]);
});
