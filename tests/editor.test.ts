import { expect, test } from "vitest";
import { Curve } from "../src/engine/curve";
import type { Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Sequence } from "../src/engine/sequence";
import { Vector } from "../src/engine/vector";

/** Build a simple known path: a straight 1 m line along the X axis. */
function makeStraightPath(): Path {
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(0, 0), new Vector(1 / 3, 0), new Vector(2 / 3, 0), new Vector(1, 0)),
  );
  return path;
}

test("addSegmentEnd appends a 1 m straight curve", () => {
  const editor = {
    sequence: new Sequence(makeStraightPath()),
    addSegmentEnd() {
      this.sequence.path.addCurveEnd();
    },
  };

  const curvesBefore = editor.sequence.path.curves.length;
  editor.addSegmentEnd();

  const curves = editor.sequence.path.curves;
  expect(curves).toHaveLength(curvesBefore + 1);

  const lastCurve = curves[curves.length - 1]!;
  expect(lastCurve.length).toBeCloseTo(1, 2);
});

test("new end curve keeps the end derivative and aligns control points at 1/2 and 1/2", () => {
  // Use a curved last segment so the direction is non-trivial.
  const path = new Path();
  path.addCurveEnd(
    new Curve(new Vector(0, 0), new Vector(0.5, 0), new Vector(0.5, 1), new Vector(1, 1)),
  );

  const endPosition = path.curves[path.curves.length - 1]!.p3.copy();
  const endDerivative = path.curves[path.curves.length - 1]!
    .getDerivative(1 as Curvilinear)
    .normalized();

  const sequence = new Sequence(path);
  sequence.path.addCurveEnd();

  const lastCurve = sequence.path.curves[sequence.path.curves.length - 1]!;

  // Start point matches previous end point.
  expect(lastCurve.p0.x).toBeCloseTo(endPosition.x);
  expect(lastCurve.p0.y).toBeCloseTo(endPosition.y);

  // Segment end is 1 m away along the end derivative.
  const dir = endDerivative;
  expect(lastCurve.p3.x).toBeCloseTo(endPosition.x + dir.x);
  expect(lastCurve.p3.y).toBeCloseTo(endPosition.y + dir.y);

  // Both control points sit at 1/2 along the same straight line.
  expect(lastCurve.p1.x).toBeCloseTo(endPosition.x + dir.x / 2);
  expect(lastCurve.p1.y).toBeCloseTo(endPosition.y + dir.y / 2);
  expect(lastCurve.p2.x).toBeCloseTo(endPosition.x + dir.x / 2);
  expect(lastCurve.p2.y).toBeCloseTo(endPosition.y + dir.y / 2);

  // The new start derivative matches the previous end derivative.
  const newStartDerivative = lastCurve.getDerivative(0 as Curvilinear).normalized();
  expect(newStartDerivative.x).toBeCloseTo(dir.x);
  expect(newStartDerivative.y).toBeCloseTo(dir.y);
});
