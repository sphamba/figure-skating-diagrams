import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";

test("isPointInBoundingBox checks the box enclosing all 4 control points", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(1, 2), new Vector(3, 2), new Vector(4, 0));

  expect(curve.isPointInBoundingBox(new Vector(2, 1))).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(0, 2))).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-1, 1))).toBe(false);
  expect(curve.isPointInBoundingBox(new Vector(2, 3))).toBe(false);

  expect(curve.isPointInBoundingBox(new Vector(2, 3), 1)).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-1, 1), 1.1)).toBe(true);
  expect(curve.isPointInBoundingBox(new Vector(-3, 1), 1)).toBe(false);
});

test("getClosestPoint on a straight line", () => {
  const curve = new Curve(new Vector(0, 0), new Vector(2 / 3, 0), new Vector(4 / 3, 0), new Vector(2, 0));

  const interior = curve.getClosestPoint(new Vector(1, 0.5));
  expect(interior.distance).toBeCloseTo(0.5, 10);
  expect(interior.point.x).toBeCloseTo(1, 10);
  expect(interior.point.y).toBeCloseTo(0, 10);

  const start = curve.getClosestPoint(new Vector(-1, 0));
  expect(start.t).toBeCloseTo(0, 10);
  expect(start.point.x).toBeCloseTo(0, 10);
  expect(start.distance).toBeCloseTo(1, 10);

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
  expect(result.distance).toBeLessThanOrEqual(Math.sqrt(bestDistance) + 1e-9);
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
	const p1 = new Vector<2>(0, 0);
	const p2 = new Vector<2>(0.5, 0);
	const p3 = new Vector<2>(0.5, 1);
	const p4 = new Vector<2>(1, 1);
	const curve = new Curve(p1, p2, p3, p4);

	expect(curve.length).toBeCloseTo(1.5, 2);
});

test("Get position and derivatives", () => {
	const p1 = new Vector<2>(0, 0);
	const p2 = new Vector<2>(0.5, 0);
	const p3 = new Vector<2>(0.5, 1);
	const p4 = new Vector<2>(1, 1);
	const curve = new Curve(p1, p2, p3, p4);

	const precision = 15; // decimal places
	const coord = 0.2 as Curvilinear;

	const position = curve.getPosition(coord);
	expect(position.x).toBeCloseTo(0.248, precision);
	expect(position.y).toBeCloseTo(0.104, precision);

	const derivative = curve.getDerivative(coord);
	expect(derivative.x).toBeCloseTo(1.02, precision);
	expect(derivative.y).toBeCloseTo(0.96, precision);

	const secondDerivative = curve.getSecondDerivative(coord);
	expect(secondDerivative.x).toBeCloseTo(-1.8, precision);
	expect(secondDerivative.y).toBeCloseTo(3.6, precision);
});

test("Create curve intersecting points", () => {
	const p1 = new Vector<2>(0, 0);
	const p2 = new Vector<2>(10 / 27, 7 / 27);
	const p3 = new Vector<2>(17 / 27, 20 / 27);
	const p4 = new Vector<2>(1, 1);
	const curve = Curve.intersecting(p1, p2, p3, p4);

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
  const joint = new Vector<2>(0, 0);

  const A = new Curve(new Vector(2, 1), new Vector(3, 2), new Vector(1, 0.5), joint.copy());
  const B = new Curve(joint.copy(), new Vector(2, -1), new Vector(3, -2), new Vector(4, -3));

  const distanceBefore = A.p3.minus(A.p2).length();
  expect(A.p3.minus(A.p2).length()).toBeCloseTo(distanceBefore, 10);

  A.alignEnd(B);

  const toA2 = A.p2.minus(joint);
  const toB1 = B.p1.minus(joint);
  const cross = toA2.x * toB1.y - toA2.y * toB1.x;
  expect(Math.abs(cross)).toBeCloseTo(0, 10);
  expect(toA2.x * toB1.x + toA2.y * toB1.y).toBeLessThan(0);

  expect(A.p2.minus(joint).length()).toBeCloseTo(distanceBefore, 10);
});

test("alignStart keeps the start handle aligned with the preceding curve's end handle and conserves its distance to the joint", () => {
  const joint = new Vector<2>(0, 0);

  const B = new Curve(new Vector(-3, -2), new Vector(-2, -1), new Vector(-1, -0.5), joint.copy());
  const C = new Curve(joint.copy(), new Vector(1, 0.5), new Vector(2, 1.5), new Vector(3, 2));

  const distanceBefore = C.p1.minus(C.p0).length();

  C.alignStart(B);

  const toC1 = C.p1.minus(joint);
  const toB2 = B.p2.minus(joint);
  const cross = toC1.x * toB2.y - toC1.y * toB2.x;
  expect(Math.abs(cross)).toBeCloseTo(0, 10);
  expect(toC1.x * toB2.x + toC1.y * toB2.y).toBeLessThan(0);

  expect(C.p1.minus(joint).length()).toBeCloseTo(distanceBefore, 10);
});

test("translating an anchor (p0/p3) with its flanking handles by the same delta keeps the joint derivative continuous", () => {
  const c0 = new Curve(new Vector(0, 0), new Vector(1, 0.5), new Vector(1.5, 0.5), new Vector(2, 0));
  const c1 = new Curve(new Vector(2, 0), new Vector(2.5, -0.5), new Vector(3, -0.5), new Vector(4, 0));

  expect(c0.getDerivative(1 as Curvilinear).x).toBeCloseTo(c1.getDerivative(0 as Curvilinear).x, 12);
  expect(c0.getDerivative(1 as Curvilinear).y).toBeCloseTo(c1.getDerivative(0 as Curvilinear).y, 12);

  const beforeIn = c0.getDerivative(1 as Curvilinear);
  const beforeOut = c1.getDerivative(0 as Curvilinear);

  const delta = new Vector(0.7, -0.3);
  c0.p3 = c0.p3.plus(delta);
  c1.p0 = c1.p0.plus(delta);
  c0.p2 = c0.p2.plus(delta);
  c1.p1 = c1.p1.plus(delta);

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
	const p1 = new Vector<2>(0, 0);
	const p2 = new Vector<2>(0.5, 0);
	const p3 = new Vector<2>(0.5, 1);
	const p4 = new Vector<2>(1, 1);
	const curve = new Curve(p1, p2, p3, p4);
	const [newCurve1, newCurve2] = curve.cut(0.2 as Curvilinear);

	const px = curve.getPosition(0.2 as Curvilinear);
	const dx = curve.getDerivative(0.2 as Curvilinear).times(1 / 3);
	const precision = 15; // decimal places

	expect(newCurve1.p0.x).toBeCloseTo(p1.x, precision);
	expect(newCurve1.p0.y).toBeCloseTo(p1.y, precision);
	expect(newCurve1.p1.x).toBeCloseTo(p2.x, precision);
	expect(newCurve1.p1.y).toBeCloseTo(p2.y, precision);
	expect(newCurve2.p2.x).toBeCloseTo(p3.x, precision);
	expect(newCurve2.p2.y).toBeCloseTo(p3.y, precision);
	expect(newCurve2.p3.x).toBeCloseTo(p4.x, precision);
	expect(newCurve2.p3.y).toBeCloseTo(p4.y, precision);

	expect(newCurve1.p3.x).toBeCloseTo(px.x, precision);
	expect(newCurve1.p3.y).toBeCloseTo(px.y, precision);
	expect(newCurve2.p0.x).toBeCloseTo(px.x, precision);
	expect(newCurve2.p0.y).toBeCloseTo(px.y, precision);

	const common = Math.min(0.2, 0.8);
	const handle1 = px.minus(dx.normalized().times(dx.length() * common));
	const handle2 = px.plus(dx.normalized().times(dx.length() * common));
	expect(newCurve1.p2.x).toBeCloseTo(handle1.x, precision);
	expect(newCurve1.p2.y).toBeCloseTo(handle1.y, precision);
	expect(newCurve2.p1.x).toBeCloseTo(handle2.x, precision);
	expect(newCurve2.p1.y).toBeCloseTo(handle2.y, precision);

	expect(newCurve1.p3.minus(newCurve1.p2).length()).toBeCloseTo(
		newCurve2.p1.minus(newCurve2.p0).length(),
		precision,
	);

	const derivativeScales = [
		[curve.getDerivative(0 as Curvilinear), newCurve1.getDerivative(0 as Curvilinear)],
		[curve.getDerivative(1 as Curvilinear), newCurve2.getDerivative(1 as Curvilinear)],
	];
	for (const [derivativeOriginal, derivativeNew] of derivativeScales) {
		expect(derivativeOriginal.x).toBeCloseTo(derivativeNew.x, precision);
		expect(derivativeOriginal.y).toBeCloseTo(derivativeNew.y, precision);
	}
});

test("getInflections finds the single inflection of a linear-numerator curve", () => {
  // cross(t) = 18·(1 − 2t), inflection at t = 1/2
  const curve = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 1), new Vector(3, 1));

  const inflections = curve.getInflections();
  expect(inflections).toHaveLength(1);
  expect(inflections[0]).toBeCloseTo(0.5, 6);

  const t = inflections[0] as Curvilinear;
  const before = (t - 0.05) as Curvilinear;
  const after = (t + 0.05) as Curvilinear;
  expect(curve.getCurvature(before) * curve.getCurvature(after)).toBeLessThan(0);
});

test("getInflections finds both inflections of a serpentine curve", () => {
  // Verified construction: cross(t) ∝ (t − 0.3)·(t − 0.7)
  const curve = new Curve(
    new Vector(0, 0),
    new Vector(21 / 2, 0),
    new Vector(21, 1),
    new Vector(-37 / 2, -37 / 21),
  );

  const inflections = curve.getInflections();
  expect(inflections).toHaveLength(2);
  expect(inflections[0]).toBeCloseTo(0.3, 6);
  expect(inflections[1]).toBeCloseTo(0.7, 6);
});

test("getInflections returns nothing when the curvature does not change sign", () => {
  // cross(t) = 18·(1 − t + 3t²), discriminant < 0
  const noRoot = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 1), new Vector(0, 2));
  expect(noRoot.getInflections()).toHaveLength(0);

  // Common a·b < 0 trap: cross(t) = 18·(1 − 3t + 3t²), discriminant < 0
  const quadraticNumerator = new Curve(new Vector(0, 0), new Vector(1, 0), new Vector(2, 1), new Vector(0, 0));
  expect(quadraticNumerator.getInflections()).toHaveLength(0);

  // Collinear control polygon: cross(t) ≡ 0
  const line = new Curve(new Vector(0, 0), new Vector(1, 1), new Vector(2, 2), new Vector(3, 3));
  expect(line.getInflections()).toHaveLength(0);
});
