import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Path } from "../src/engine/path";
import { Vector } from "../src/engine/vector";


function horizontalCurve(y: number): Curve {
  return new Curve(new Vector(0, y), new Vector(2 / 3, y), new Vector(4 / 3, y), new Vector(2, y));
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
