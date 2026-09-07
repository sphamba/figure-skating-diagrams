import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import type { PathCoordinate } from "../src/engine/coordinates";
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

test("an element traced along the path keeps its length across curves of very different lengths", () => {
	// A path whose consecutive curves have strongly different lengths and
	// curvature (a long winding S curve, a tiny curve, then a long straight).
	// This is the situation described in the editor bug report: when an element
	// (a range of the path drawn by stepping in arc length) is dragged across
	// such curves, its drawn length must stay constant.
	const path = new Path();
	path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(2, 8), new Vector(6, -8), new Vector(8, 0)));
	path.addCurveEnd(new Curve(new Vector(8, 0), new Vector(8.1, 0.3), new Vector(8.2, -0.3), new Vector(8.3, 0)));
	path.addCurveEnd(new Curve(new Vector(8.3, 0), new Vector(13.3, 0), new Vector(18.3, 0), new Vector(23.3, 0)));

	// The arc lengths of the three curves differ by an order of magnitude.
	const [c0, c1] = path.curves.map((curve) => curve.length);
	expect(c1).toBeLessThan(c0 / 10);

	// Draw a fixed-span element by sampling the path at arc-length steps, the
	// same way the sequence editor renders an element.
	const span = 5;
	const increment = 0.02;
	const drawnLength = (start: number) => {
		const points: Vector<2>[] = [];
		for (let u = start; u <= start + span; u += increment) {
			points.push(path.getPosition(u as PathCoordinate));
		}
		let length = 0;
		for (let i = 0; i < points.length - 1; i++) length += points[i]!.minus(points[i + 1]!).length();
		return length;
	};

	// The drawn length must stay close to the arc-length span everywhere on the
	// path. With the former coarse arc-length table this varied by several
	// percent (the observable "element length changes while dragging" bug).
	let min = Infinity;
	let max = -Infinity;
	for (let start = 0; start + span < path.length - 1e-9; start += 0.5) {
		const length = drawnLength(start);
		min = Math.min(min, length);
		max = Math.max(max, length);
	}
	expect(min).toBeGreaterThan(span * 0.995);
	expect(max).toBeLessThan(span * 1.005);
});

test("drawRange draws the covered sub-curves with native bezier primitives", () => {
  // A path of two horizontal curves joined at x = 2.
  const path = new Path();
  path.curves = [horizontalCurve(0), horizontalCurve(1)];
  path.updateLength();

  // Record the primitives used to draw.
  const bezierCt = { count: 0 };
  const lineCt = { count: 0 };
  const ctx = {
    beginPath: () => {},
    moveTo: () => {},
    bezierCurveTo: () => {
      bezierCt.count++;
    },
    lineTo: () => {
      lineCt.count++;
    },
    stroke: () => {},
  } as unknown as CanvasRenderingContext2DSized;

  // Range covers the second half of curve 0 and all of curve 1.
  const bound = path.getCurveAndCurvilinearCoord(path.length / 4 as PathCoordinate);
  const uStart = bound[0].length / 2;
  const uEnd = path.curves[0]!.length + path.curves[1]!.length;

  path.drawRange(ctx, uStart as PathCoordinate, uEnd as PathCoordinate);

  // Everything must be drawn with bezierCurveTo: one native draw for the
  // whole curve 1, and one for the partial second half of curve 0.
  expect(bezierCt.count).toBe(2);
  // No polyline approximation anywhere.
  expect(lineCt.count).toBe(0);
});

test("drawRange sub-bezier endpoints land exactly on the path", () => {
  // A curved single-segment path.
  const path = new Path();
  path.curves = [new Curve(new Vector(0, 0), new Vector(0.5, 1), new Vector(1.5, -1), new Vector(2, 0))];
  path.updateLength();
  const length = path.curves[0]!.length;

  let moveToPt: Vector<2> | null = null;
  let endPt: Vector<2> | null = null;
  const ctx = {
    beginPath: () => {},
    moveTo: (x: number, y: number) => {
      moveToPt = new Vector(x, -y);
    },
    bezierCurveTo: (_c1x: number, _c1y: number, _c2x: number, _c2y: number, x: number, y: number) => {
      endPt = new Vector(x, -y);
    },
    lineTo: () => {},
    stroke: () => {},
  } as unknown as CanvasRenderingContext2DSized;

  const a = length / 3;
  const b = (2 * length) / 3;
  path.drawRange(ctx, a as PathCoordinate, b as PathCoordinate);

  const expectedStart = path.getPosition(a as PathCoordinate);
  const expectedEnd = path.getPosition(b as PathCoordinate);
  expect(moveToPt!.x).toBeCloseTo(expectedStart.x, 6);
  expect(moveToPt!.y).toBeCloseTo(expectedStart.y, 6);
  expect(endPt!.x).toBeCloseTo(expectedEnd.x, 6);
  expect(endPt!.y).toBeCloseTo(expectedEnd.y, 6);
});
