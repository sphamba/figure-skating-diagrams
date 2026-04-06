import { expect, test } from "vitest";
import { interpolate } from "../src/engine/interpolate";
import { Vector } from "../src/engine/vector";
import { getQuaternionFromAngleAxis } from "../src/engine/quaternion";


test("Interpolate numbers", () => {
	expect(interpolate(1, 5, 0.5)).toBe(3);
	expect(interpolate(1, 5, 0.25)).toBe(2);
});


test("Interpolate vectors", () => {
	let a = new Vector(1, 2, 3);
	let b = new Vector(4, 5, 6);

	let result = interpolate(a, b, 0.25);
	let expected = new Vector(1.75, 2.75, 3.75);

	expect(result).toEqual(expected);
});


test("Interpolate quaternions", () => {
	let angle1 = 0.1;
	let angle2 = 0.2;
	let axis = new Vector<3>(1, 2, 3).normalized();

	let a = getQuaternionFromAngleAxis(angle1, axis);
	let b = getQuaternionFromAngleAxis(angle2, axis);

	let result = interpolate(a, b, 0.25);
	let expected = getQuaternionFromAngleAxis(0.125, axis);

	const precision = 15; // decimal places
	expect(result.real).toBeCloseTo(expected.real, precision);
	expect(result.vector.x).toBeCloseTo(expected.vector.x, precision);
	expect(result.vector.y).toBeCloseTo(expected.vector.y, precision);
	expect(result.vector.z).toBeCloseTo(expected.vector.z, precision);
});
