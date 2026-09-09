import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
import { Path } from "../src/engine/path";
import { LeftForwardInsideGlide } from "../src/engine/element/glide";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

/** A straight 1 m path, long enough for the test element ranges. */
function makePath(): Path {
  const p0 = new Vector(0, 0);
  const p1 = new Vector(1 / 3, 0);
  const p2 = new Vector(2 / 3, 0);
  const p3 = new Vector(1, 0);
  const path = new Path();
  path.addCurveEnd(new Curve(p0, p1, p2, p3));
  return path;
}

/** A static glide: two foot keyframes per foot, at the start and the end. */
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

  // The end keyframe of the first element stays at the shared boundary, the
  // start keyframe of the second element moves the delta forward.
  expect(footLCoordinates(sequence)).toEqual([0, 1, 1.001, 2]);
});

test("overlapping element boundaries move to their midpoint with the delta", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(0.5, 1.5));

  // The end keyframe of the first element and the start keyframe of the
  // second overlap; both move to their midpoint, the end at the midpoint and
  // the start 0.001 m after it. The moved pairs are (1, 0.5) ->
  // (0.75, 0.751).
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

  // A zero-size element cannot withstand a delta: its start and end keyframes
  // both stay at its single path coordinate, and only the start keyframe of
  // the next element moves behind it.
  expect(footLCoordinates(sequence)).toEqual([0, 0.5, 0.5, 0.5, 0.501, 1]);
});

test("scaled draw keyframes never overlap at the element boundaries", () => {
  const sequence = new Sequence(makePath());
  // Two turns on the left foot: the free foot list holds exactly the two
  // end keyframes of each scaled span.
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 0 as PathCoordinate, 1 as PathCoordinate));
  sequence.addElement(new LeftForwardInsideThreeTurn("footL", 1.05 as PathCoordinate, 2 as PathCoordinate));

  // Scaled up 1.5x about their middles, the first turn's end keyframe
  // lands at 1.25 and the second's start keyframe at 0.8125: they overlap.
  // The boundary pair is fixed at their midpoint with the delta.
  const keyframes = sequence.getDrawFootKeyframes("footR", 1.5);

  expect(keyframes.map((keyframe) => keyframe.coordinate).map((coordinate) => Number(coordinate.toFixed(10)))).toEqual([
    -0.25,
    1.03125,
    1.03225,
    2.2375,
  ]);
});

test("draw keyframes of glides stay on the real span under a scale", () => {
  const sequence = new Sequence(makePath());
  sequence.addElement(glide(0, 1));
  sequence.addElement(glide(1.05, 2));

  // Glides do not scale, so the keyframes keep the real span and the
  // already separated boundary is untouched.
  const keyframes = sequence.getDrawFootKeyframes("footL", 1.5);

  expect(keyframes.map((keyframe) => keyframe.coordinate)).toEqual([0, 1, 1.05, 2]);
});
