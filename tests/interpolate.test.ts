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

test("Interpolate quaternions over the 180 degree wrap through the wrap", () => {
	const a = getQuaternionFromAngleAxis(-170 * (Math.PI / 180));
	const b = getQuaternionFromAngleAxis(170 * (Math.PI / 180));

	const half = interpolate(a, b, 0.5);
	expect(Math.abs(half.real)).toBeCloseTo(0, 5);
	for (const s of [0.25, 0.5, 0.75]) {
		const value = interpolate(a, b, s);
		expect(Math.abs(value.real)).toBeLessThan(0.5);
	}
});

test("A whole turn change makes no broken intermediates: the value jumps", () => {
	const a = getQuaternionFromAngleAxis(-Math.PI);
	const b = getQuaternionFromAngleAxis(Math.PI);

	const half = interpolate(a, b, 0.5);
	expect(half.real).toBeCloseTo(a.real, 10);
	expect(half.vector.length()).toBeCloseTo(a.vector.length(), 10);
});
