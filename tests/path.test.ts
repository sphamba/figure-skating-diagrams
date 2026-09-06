import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Vector } from "../src/engine/vector";


function horizontalCurve(y: number): Curve {
  return new Curve(new Vector(0, y), new Vector(2 / 3, y), new Vector(4 / 3, y), new Vector(2, y));
}

/** Fine numerical arc length of `curve` between the curvilinear coords a and b. */
function integrateArcLength(curve: Curve, a: number, b: number): number {
  const steps = 10000;
  const dt = (b - a) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    sum += curve.getDerivative((a + dt * i) as Curvilinear).length() * dt;
  }
  return sum;
}

test("pickCurve finds the closest curve within tolerance", () => {
  // Two disconnected parallel horizontal curves at y = 0 and y = 1, x in [0, 2].
  const path = new Path();
  path.curves = [horizontalCurve(0), horizontalCurve(1)];
  path.updateLength();

  // Click nearer the lower curve.
  const lower = path.pickCurve(new Vector(1, 0.1), 0.2);
  expect(lower).not.toBeNull();
  expect(lower!.curveIndex).toBe(0);
  expect(lower!.distance).toBeCloseTo(0.1, 10);

  // Click nearer the upper curve.
  const upper = path.pickCurve(new Vector(1, 0.9), 0.2);
  expect(upper!.curveIndex).toBe(1);

  // Far from every curve: no candidate.
  expect(path.pickCurve(new Vector(1, 5), 0.2)).toBeNull();

  // Within tolerance of none of the curves.
  expect(path.pickCurve(new Vector(1, 0.3), 0.1)).toBeNull();
});

test("pickCurve returns null on an empty path", () => {
  const path = new Path();
  expect(path.pickCurve(new Vector(0, 0), 1)).toBeNull();
});


test("Cut and merge", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(0.5, 0);
	let p3 = new Vector<2>(0.5, 1);
	let p4 = new Vector<2>(1, 1);
	let curve = new Curve(p1, p2, p3, p4);

	let path = new Path();
	path.addCurveEnd(curve);

	// Test cut
	path.cut(0, 0.2 as Curvilinear);

	// Test merge
	let midpoint = path.curves[0].p3;
	path.removePoint(midpoint);
});

test("removePoint keeps the surviving control points and drops the joint", () => {
	const path = new Path();
	path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(1, 1), new Vector(2, 2), new Vector(3, 3)));
	path.addCurveEnd(new Curve(new Vector(3, 3), new Vector(5, 5), new Vector(7, 7), new Vector(8, 8)));

	const joint = path.curves[0].p3;
	path.removePoint(joint);

	expect(path.curves).toHaveLength(1);
	const merged = path.curves[0]!;
	// Outer control points are reused unchanged.
	expect(merged.p0.x).toBeCloseTo(0, 10);
	expect(merged.p0.y).toBeCloseTo(0, 10);
	expect(merged.p1.x).toBeCloseTo(1, 10);
	expect(merged.p1.y).toBeCloseTo(1, 10);
	expect(merged.p2.x).toBeCloseTo(7, 10);
	expect(merged.p2.y).toBeCloseTo(7, 10);
	expect(merged.p3.x).toBeCloseTo(8, 10);
	expect(merged.p3.y).toBeCloseTo(8, 10);
	// The removed joint is gone.
	expect(path.curves.some((c) => c.p3 === joint)).toBe(false);
});

test("splitting a curve at its arc-length midpoint keeps the path shape", () => {
	const path = new Path();
	const original = new Curve(
		new Vector(0, 0),
		new Vector(0.5, 0.5),
		new Vector(1.5, -0.5),
		new Vector(2, 0),
	);
	path.addCurveEnd(original);

	// The midpoint of the curve, measured along its real arc length.
	const mid = original.getHalfLengthCoordinate();
	const expectedPoint = original.getPosition(mid);
	path.cut(0, mid);

	expect(path.curves).toHaveLength(2);

	// The new joint coincides with the true half-length point of the original.
	const joint = path.curves[0]!.p3;
	expect(joint.x).toBeCloseTo(expectedPoint.x, 10);
	expect(joint.y).toBeCloseTo(expectedPoint.y, 10);

	// Path endpoints are unchanged.
	expect(path.curves[0]!.p0.x).toBeCloseTo(0, 10);
	expect(path.curves[1]!.p3.x).toBeCloseTo(2, 10);

	// The two halves stay connected.
	expect(path.curves[1]!.p0).toBe(joint);

	// The joint sits at half the REAL arc length: the arc length from the
	// start of the path to the joint equals the arc length from the joint to
	// the end, within the integration resolution.
	const arcToJoint = integrateArcLength(original, 0, mid);
	const arcAfterJoint = integrateArcLength(original, mid, 1);
	expect(arcToJoint).toBeCloseTo(arcAfterJoint, 2);
});

test("removeEndCurve and removeStartCurve shorten the path at the ends", () => {
	const path = new Path();
	path.addCurveEnd(horizontalCurve(0));
	path.addCurveEnd(horizontalCurve(1));
	path.addCurveEnd(horizontalCurve(2));
	expect(path.curves).toHaveLength(3);

	const first = path.curves[0]!;
	const last = path.curves[2]!;

	path.removeEndCurve();
	expect(path.curves).toHaveLength(2);
	expect(path.curves[path.curves.length - 1]).not.toBe(last);

	path.removeStartCurve();
	expect(path.curves).toHaveLength(1);
	expect(path.curves[0]).not.toBe(first);
});
