import { expect, test } from "vitest";
import { interpolate } from "../src/engine/interpolate";
import { Vector } from "../src/engine/vector";
import { getQuaternionFromAngleAxis } from "../src/engine/quaternion";


test("Interpolate numbers", () => {
	expect(interpolate(1, 5, 0.5)).toBe(3);
	expect(interpolate(1, 5, 0.25)).toBe(2);
});


test("Interpolate vectors", () => {
	const a = new Vector(1, 2, 3);
	const b = new Vector(4, 5, 6);

	const result = interpolate(a, b, 0.25);
	const expected = new Vector(1.75, 2.75, 3.75);

	expect(result).toEqual(expected);
});


test("Interpolate quaternions", () => {
	const angle1 = 0.1;
	const angle2 = 0.2;
	const axis = new Vector<3>(1, 2, 3).normalized();

	const a = getQuaternionFromAngleAxis(angle1, axis);
	const b = getQuaternionFromAngleAxis(angle2, axis);

	const result = interpolate(a, b, 0.25);
	const expected = getQuaternionFromAngleAxis(0.125, axis);

	const precision = 15; // decimal places
	expect(result.real).toBeCloseTo(expected.real, precision);
	expect(result.vector.x).toBeCloseTo(expected.vector.x, precision);
	expect(result.vector.y).toBeCloseTo(expected.vector.y, precision);
	expect(result.vector.z).toBeCloseTo(expected.vector.z, precision);
});
