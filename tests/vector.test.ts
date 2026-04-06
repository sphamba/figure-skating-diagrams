import { expect, test } from "vitest";
import { getQuaternionFromAngleAxis, Quaternion } from "../src/engine/quaternion";
import { Vector } from "../src/engine/vector";


test("2D rotation", () => {
	let v = new Vector<2>(1, 0);
	let result = v.rotate(Math.PI / 2);
	let expected = new Vector<2>(0, 1);

	const precision = 15; // decimal places
	expect(result.x).toBeCloseTo(expected.x, precision);
	expect(result.y).toBeCloseTo(expected.y, precision);
});


test("3D rotation", () => {
	let v = new Vector<3>(1, 0, 0);
	let axis = new Vector<3>(0, 0, 1);
	let q = getQuaternionFromAngleAxis(Math.PI / 2, axis);
	let result = v.rotate(q);
	let expected = new Vector<3>(0, 1, 0);

	const precision = 15; // decimal places
	expect(result.x).toBeCloseTo(expected.x, precision);
	expect(result.y).toBeCloseTo(expected.y, precision);
	expect(result.z).toBeCloseTo(expected.z, precision);
});
