import { expect, test } from "vitest";
import type { DynamicGlide } from "../src/engine/element/stroke.js";
import "../src/engine/element/stroke.js";
import { glideConstructorsByType, glideKindChoices } from "../src/engine/element/glide.js";

const start = 0;
const end = 2;
const T95 = 1.9;
const SPACING = 0.15;
const FREE_OFFSET = 0.4;

type Kf = { coordinate: number; data: { position?: { x: number; y: number; z: number } } };

function expectData(kf: Kf, x: number, y: number, z: number) {
	expect(kf.data.position!.x).toBeCloseTo(x, 10);
	expect(kf.data.position!.y).toBeCloseTo(y, 10);
	expect(kf.data.position!.z).toBeCloseTo(z, 10);
}

function expectAt(kfs: Kf[], index: number, coordinate: number): Kf {
	expect(kfs[index].coordinate).toBeCloseTo(coordinate, 10);
	return kfs[index];
}

function glide(typeName: string): DynamicGlide {
	return new (glideConstructorsByType[typeName] as unknown as new (start: number, end: number) => DynamicGlide)(start, end);
}

test("glide registry lists all static and dynamic glide kinds", () => {
	expect(Object.keys(glideConstructorsByType)).toHaveLength(50);
	expect(glideKindChoices).toHaveLength(50);
	expect(Object.keys(glideConstructorsByType)).toContain("LeftCrossedForwardInsideGlide");
	expect(Object.keys(glideConstructorsByType)).toContain("RightNormalBackwardOutsideGlide");
	expect(Object.keys(glideConstructorsByType)).toContain("LeftCrossedBackForwardInsideGlide");
});

test("a normal forward left glide starts on two feet and lifts the right foot at the end", () => {
	const g = glide("LeftNormalForwardInsideGlide");

	const left = g.getLeftFootKeyframes();
	expect(left).toHaveLength(3);
	expectData(expectAt(left as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(left as unknown as Kf[], 1, T95), 0, 0, 0);
	expectData(expectAt(left as unknown as Kf[], 2, end), 0, 0, 0);

	const right = g.getRightFootKeyframes();
	expect(right).toHaveLength(3);
	expectData(expectAt(right as unknown as Kf[], 0, start), 0, -SPACING, 0);
	expectData(expectAt(right as unknown as Kf[], 1, T95), -FREE_OFFSET, -2 * SPACING, 0);
	expectData(expectAt(right as unknown as Kf[], 2, end), -FREE_OFFSET, -2 * SPACING, 0.2);
});

test("a crossed forward glide swaps the sides of the centerline", () => {
	const g = glide("RightCrossedForwardGlide");

	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 0, start), 0, -SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 2, end), 0, 0, 0);
	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 2, end), -FREE_OFFSET, -2 * SPACING, 0.2);
});

test("a normal backwards glide keeps the keyframe side, the foot orientation mirrors it", () => {
	const g = glide("LeftNormalBackwardInsideGlide");

	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 0, start), 0, 0, 0);
	// The backward foot orientation mirrors the visible lateral offset, so the
	// keyframes match a forward normal glide, with the longitudinal offset flipped.
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 0, start), 0, -SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 1, T95), FREE_OFFSET, -2 * SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 2, end), FREE_OFFSET, -2 * SPACING, 0.2);
});

test("a crossed backwards glide swaps the sides like a crossed forward one", () => {
	const g = glide("LeftCrossedBackwardInsideGlide");

	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 0, start), 0, SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 1, T95), FREE_OFFSET, 2 * SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 2, end), FREE_OFFSET, 2 * SPACING, 0.2);
});

test("a crossed back glide has the same geometry as a crossed one", () => {
	for (const typeName of ["LeftCrossedBackForwardInsideGlide", "RightCrossedBackBackwardOutsideGlide"]) {
		const g = glide(typeName);
		const crossed = glide(typeName.replace("CrossedBack", "Crossed"));
		expect(g.getLeftFootKeyframes()).toEqual(crossed.getLeftFootKeyframes());
		expect(g.getRightFootKeyframes()).toEqual(crossed.getRightFootKeyframes());
	}
});

test("a crossed back glide keeps the crossed flag and reports itself", () => {
	const crossed = glide("LeftCrossedForwardInsideGlide");
	const crossedBack = glide("LeftCrossedBackForwardInsideGlide");
	const normal = glide("LeftNormalForwardInsideGlide");

	expect(crossed.crossed).toBe(true);
	expect(crossed.crossedBack).toBe(false);
	expect(crossedBack.crossed).toBe(true);
	expect(crossedBack.crossedBack).toBe(true);
	expect(normal.crossed).toBe(false);
	expect(normal.crossedBack).toBe(false);
});

test("glide types round-trip through JSON", () => {
	const typeNames = [
		"LeftNormalForwardInsideGlide",
		"LeftCrossedForwardOutsideGlide",
		"RightNormalBackwardGlide",
		"RightCrossedBackwardInsideGlide",
	];
	for (const typeName of typeNames) {
		const g = glide(typeName);
		const json = g.toJSON();
		expect(json.type).toBe(typeName);
		const decoded = glideConstructorsByType[typeName] as unknown as {
			fromJSON: (json: { type: string; start: number; end: number }) => DynamicGlide;
		};
		expect(decoded.fromJSON(json).toJSON().type).toBe(typeName);
	}
});
