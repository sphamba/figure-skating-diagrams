import { expect, test } from "vitest";
import { Curve, Curvilinear } from "../src/engine/curve";
import { Vector } from "../src/engine/vector";


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
