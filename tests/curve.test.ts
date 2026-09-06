import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";


test("isPointInBoundingBox checks the box enclosing all 4 control points", () => {
  // Bounding box: x in [0, 4], y in [0, 2].
  const curve = new Curve(new Vector(0, 0), new Vector(1, 2), new Vector(3, 2), new Vector(4, 0));

  expect(curve.isPointInBoundingBox(new Vector(2, 1))).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(0, 2))).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-1, 1))).toBe(false);
  expect(curve.isPointInBoundingBox(new Vector(2, 3))).toBe(false);

  // Tolerance expands the box on every side.
  expect(curve.isPointInBoundingBox(new Vector(2, 3), 1)).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-1, 1), 1.1)).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-3, 1), 1)).toBe(false);
});

test("getClosestPoint on a straight line", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(2 / 3, 0), new Vector(4 / 3, 0), new Vector(2, 0));

  // Interior point projects perpendicularly onto the line.
  const interior = curve.getClosestPoint(new Vector(1, 0.5));
  expect(interior.distance).toBeCloseTo(0.5, 10);
  expect(interior.point.x).toBeCloseTo(1, 10);
  expect(interior.point.y).toBeCloseTo(0, 10);

  // Before the start: the closest point is the start endpoint.
  const start = curve.getClosestPoint(new Vector(-1, 0));
  expect(start.t).toBeCloseTo(0, 10);
  expect(start.point.x).toBeCloseTo(0, 10);
  expect(start.distance).toBeCloseTo(1, 10);

  // After the end: the closest point is the end endpoint.
  const end = curve.getClosestPoint(new Vector(3, 0));
  expect(end.t).toBeCloseTo(1, 10);
  expect(end.point.x).toBeCloseTo(2, 10);
  expect(end.distance).toBeCloseTo(1, 10);
});

test("getClosestPoint agrees with brute-force sampling", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(1, 3), new Vector(3, -1), new Vector(4, 2));
  const query = new Vector(3.7, 0.4);

  const steps = 2000;
  let bestDistance = Infinity;
  for (let i = 0; i <= steps; i++) {
    const position = curve.getPosition((i / steps) as Curvilinear);
    const distance = position.minus(query).lengthSquared();
    if (distance < bestDistance) bestDistance = distance;
  }

  const result = curve.getClosestPoint(query);
  // The analytic minimum is at least as good as the best sampled point.
  expect(result.distance).toBeLessThanOrEqual(Math.sqrt(bestDistance) + 1e-9);
  // The returned point really lies on the curve.
  expect(result.point.minus(curve.getPosition(result.t)).length()).toBeLessThan(1e-9);
});

test("getClosestPoint returns near-zero distance for points on the curve", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(1, 3), new Vector(3, -1), new Vector(4, 2));

  for (let i = 0; i <= 40; i++) {
    const onCurve = curve.getPosition((i / 40) as Curvilinear);
    const result = curve.getClosestPoint(onCurve);
    expect(result.distance).toBeLessThan(1e-6);
    expect(result.point.minus(onCurve).length()).toBeLessThan(1e-6);
  }
});


test("Get length", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(0.5, 0);
	let p3 = new Vector<2>(0.5, 1);
	let p4 = new Vector<2>(1, 1);
	let curve = new Curve(p1, p2, p3, p4);

	expect(curve.length).toBeCloseTo(1.5, 2);
});


test("Get position and derivatives", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(0.5, 0);
	let p3 = new Vector<2>(0.5, 1);
	let p4 = new Vector<2>(1, 1);
	let curve = new Curve(p1, p2, p3, p4);

	const precision = 15; // decimal places
	let coord = 0.2 as Curvilinear;

	let position = curve.getPosition(coord);
	expect(position.x).toBeCloseTo(0.248, precision);
	expect(position.y).toBeCloseTo(0.104, precision);

	let derivative = curve.getDerivative(coord);
	expect(derivative.x).toBeCloseTo(1.02, precision);
	expect(derivative.y).toBeCloseTo(0.96, precision);

	let secondDerivative = curve.getSecondDerivative(coord);
	expect(secondDerivative.x).toBeCloseTo(-1.8, precision);
	expect(secondDerivative.y).toBeCloseTo(3.6, precision);
});


test("Create curve intersecting points", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(10 / 27, 7 / 27);
	let p3 = new Vector<2>(17 / 27, 20 / 27);
	let p4 = new Vector<2>(1, 1);
	let curve = Curve.intersecting(p1, p2, p3, p4);

	const precision = 15; // decimal places
	let position: Vector<2>;

	position = curve.getPosition(0 as Curvilinear);
	expect(position.x).toBeCloseTo(0, precision);
	expect(position.y).toBeCloseTo(0, precision);

	position = curve.getPosition(1 / 3 as Curvilinear);
	expect(position.x).toBeCloseTo(p2.x, precision);
	expect(position.y).toBeCloseTo(p2.y, precision);

	position = curve.getPosition(2 / 3 as Curvilinear);
	expect(position.x).toBeCloseTo(p3.x, precision);
	expect(position.y).toBeCloseTo(p3.y, precision);

	position = curve.getPosition(1 as Curvilinear);
	expect(position.x).toBeCloseTo(1, precision);
	expect(position.y).toBeCloseTo(1, precision);
});


test("alignEnd keeps the end handle aligned with the following curve's start handle and conserves its distance to the joint", () => {
  // Simulate dragging p1 of curve B (start handle): the previous curve A's
  // end handle (p2) is aligned via A.alignEnd(B).
  const joint = new Vector<2>(0, 0);

  // Previous curve A, joint is A.p3.
  const A = new Curve(new Vector(2, 1), new Vector(3, 2), new Vector(1, 0.5), joint.copy());
  // Following (dragged) curve B, joint is B.p0.
  const B = new Curve(joint.copy(), new Vector(2, -1), new Vector(3, -2), new Vector(4, -3));

  const distanceBefore = A.p3.minus(A.p2).length();
  expect(A.p3.minus(A.p2).length()).toBeCloseTo(distanceBefore, 10);

  A.alignEnd(B);

  // A.p2 and B.p1 are on opposite rays from the joint (collinear).
  const toA2 = A.p2.minus(joint);
  const toB1 = B.p1.minus(joint);
  const cross = toA2.x * toB1.y - toA2.y * toB1.x;
  expect(Math.abs(cross)).toBeCloseTo(0, 10);
  // Opposite direction.
  expect(toA2.x * toB1.x + toA2.y * toB1.y).toBeLessThan(0);

  // Distance from the joint is conserved.
  expect(A.p2.minus(joint).length()).toBeCloseTo(distanceBefore, 10);
});

test("alignStart keeps the start handle aligned with the preceding curve's end handle and conserves its distance to the joint", () => {
  // Simulate dragging p3 (end anchor) of curve B: the next curve C's start
  // handle (p1) is aligned via C.alignStart(B).
  const joint = new Vector<2>(0, 0);

  // Preceding (dragged) curve B, joint is B.p3.
  const B = new Curve(new Vector(-3, -2), new Vector(-2, -1), new Vector(-1, -0.5), joint.copy());
  // Next curve C, joint is C.p0.
  const C = new Curve(joint.copy(), new Vector(1, 0.5), new Vector(2, 1.5), new Vector(3, 2));

  const distanceBefore = C.p1.minus(C.p0).length();

  C.alignStart(B);

  // C.p1 and B.p2 are on opposite rays from the joint (collinear).
  const toC1 = C.p1.minus(joint);
  const toB2 = B.p2.minus(joint);
  const cross = toC1.x * toB2.y - toC1.y * toB2.x;
  expect(Math.abs(cross)).toBeCloseTo(0, 10);
  // Opposite direction.
  expect(toC1.x * toB2.x + toC1.y * toB2.y).toBeLessThan(0);

  // Distance from the joint is conserved.
  expect(C.p1.minus(joint).length()).toBeCloseTo(distanceBefore, 10);
});


test("translating an anchor (p0/p3) with its flanking handles by the same delta keeps the joint derivative continuous", () => {
  // Two connected curves sharing the joint (curve0.p3 = curve1.p0).
  const c0 = new Curve(new Vector(0, 0), new Vector(1, 0.5), new Vector(1.5, 0.5), new Vector(2, 0));
  const c1 = new Curve(new Vector(2, 0), new Vector(2.5, -0.5), new Vector(3, -0.5), new Vector(4, 0));

  // Before: derivative is already continuous at the joint.
  expect(c0.getDerivative(1 as Curvilinear).x).toBeCloseTo(c1.getDerivative(0 as Curvilinear).x, 12);
  expect(c0.getDerivative(1 as Curvilinear).y).toBeCloseTo(c1.getDerivative(0 as Curvilinear).y, 12);

  const beforeIn = c0.getDerivative(1 as Curvilinear);
  const beforeOut = c1.getDerivative(0 as Curvilinear);

  // Editor behavior when dragging the p3 anchor of the first curve: the
  // anchor and both flanking handles move by the same delta (this curve's p2
  // and the next curve's p1).
  const delta = new Vector(0.7, -0.3);
  c0.p3 = c0.p3.plus(delta);
  c1.p0 = c1.p0.plus(delta); // the shared joint
  c0.p2 = c0.p2.plus(delta);
  c1.p1 = c1.p1.plus(delta);

  // Pure translation: the derivatives at the joint are unchanged, so
  // continuity is preserved exactly.
  const afterIn = c0.getDerivative(1 as Curvilinear);
  const afterOut = c1.getDerivative(0 as Curvilinear);
  expect(afterIn.x).toBeCloseTo(beforeIn.x, 12);
  expect(afterIn.y).toBeCloseTo(beforeIn.y, 12);
  expect(afterOut.x).toBeCloseTo(beforeOut.x, 12);
  expect(afterOut.y).toBeCloseTo(beforeOut.y, 12);
  expect(afterIn.x).toBeCloseTo(afterOut.x, 12);
  expect(afterIn.y).toBeCloseTo(afterOut.y, 12);
});



test("Cut curve", () => {
	let p1 = new Vector<2>(0, 0);
	let p2 = new Vector<2>(0.5, 0);
	let p3 = new Vector<2>(0.5, 1);
	let p4 = new Vector<2>(1, 1);
	let curve = new Curve(p1, p2, p3, p4);
	let [newCurve1, newCurve2] = curve.cut(0.2 as Curvilinear);

	const precision = 15; // decimal places
	const coordsOriginal = [0, 0.2, 0.2, 1] as Curvilinear[];
	const coordsNew = [0, 1, 0, 1] as Curvilinear[];
	const newCurves = [newCurve1, newCurve1, newCurve2, newCurve2];
	const derivativeScales = [0.2, 0.2, 0.8, 0.8];

	for (let i = 0; i < 4; i++) {
		let coordOriginal = coordsOriginal[i];
		let coordNew = coordsNew[i];
		let newCurve = newCurves[i];
		let scale = derivativeScales[i];

		let positionOriginal = curve.getPosition(coordOriginal);
		let positionNew = newCurve.getPosition(coordNew);
		expect(positionOriginal.x).toBeCloseTo(positionNew.x, precision);
		expect(positionOriginal.y).toBeCloseTo(positionNew.y, precision);

		let derivativeOriginal = curve.getDerivative(coordOriginal);
		let derivativeNew = newCurve.getDerivative(coordNew);
		expect(derivativeOriginal.x * scale).toBeCloseTo(derivativeNew.x, precision);
		expect(derivativeOriginal.y * scale).toBeCloseTo(derivativeNew.y, precision);
	}
});
