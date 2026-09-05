import { expect, test } from "vitest";
import type { PathCoordinate, Time } from "../src/engine/coordinates";
import { Curve } from "../src/engine/curve";
import { TimeKeyframe } from "../src/engine/keyframe";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

function makeStraightLengthOnePath(): Path {
  const p0 = new Vector(0, 0);
  const p1 = new Vector(1 / 3, 0);
  const p2 = new Vector(2 / 3, 0);
  const p3 = new Vector(1, 0);

  const path = new Path();
  path.addCurveEnd(new Curve(p0, p1, p2, p3));
  return path;
}

test("Clock maps path coordinate to time and back", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  // Clock samples: t = 0 at u = 0, t = 2 at u = 1.
  sequence.addKeyframe("time", new TimeKeyframe(2 as Time, { pathCoordinate: 1 as PathCoordinate }));

  expect(sequence.getPathCoordinateFromTime(1 as Time)).toBeCloseTo(0.5);
  expect(sequence.getTimeFromPathCoordinate(0.5 as PathCoordinate)).toBeCloseTo(1);
});

test("Clock inverse and forward mapping are consistent", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimeKeyframe(2 as Time, { pathCoordinate: 1 as PathCoordinate }));

  for (const t of [0.1, 0.4, 0.75, 1.3, 1.9]) {
    const u = sequence.getPathCoordinateFromTime(t as Time);
    expect(sequence.getTimeFromPathCoordinate(u)).toBeCloseTo(t);
  }
});

test("Clock clamps outside the defined range", () => {
  const sequence = new Sequence(makeStraightLengthOnePath());
  sequence.addKeyframe("time", new TimeKeyframe(2 as Time, { pathCoordinate: 1 as PathCoordinate }));

  expect(sequence.getTimeFromPathCoordinate((-0.5) as PathCoordinate)).toBeCloseTo(0);
  expect(sequence.getTimeFromPathCoordinate(5 as PathCoordinate)).toBeCloseTo(2);
  expect(sequence.getPathCoordinateFromTime((-0.3) as Time)).toBeCloseTo(0);
  expect(sequence.getPathCoordinateFromTime(3 as Time)).toBeCloseTo(1);
});
