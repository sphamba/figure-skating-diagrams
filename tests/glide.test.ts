import { expect, test } from "vitest";
import { DynamicGlide, glideConstructorsByType, glideKindChoices } from "../src/engine/element/glide.js";

/** A straight 2 m span of path coordinates, for known keyframe coordinates. */
const start = 0;
const end = 2;
const T95 = 1.9;
const SPACING = 0.15;
const FREE_OFFSET = 0.5;

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
	expect(Object.keys(glideConstructorsByType)).toHaveLength(38);
	expect(glideKindChoices).toHaveLength(38);
	expect(Object.keys(glideConstructorsByType)).toContain("LeftCrossedForwardInsideGlide");
	expect(Object.keys(glideConstructorsByType)).toContain("RightNormalBackwardOutsideGlide");
});

test("a normal forward left glide starts on two feet and lifts the right foot at the end", () => {
	const g = glide("LeftNormalForwardInsideGlide");

	// Left foot: centered for the whole stroke (starts already centered).
	const left = g.getLeftFootKeyframes();
	expect(left).toHaveLength(3);
	expectData(expectAt(left as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(left as unknown as Kf[], 1, T95), 0, 0, 0);
	expectData(expectAt(left as unknown as Kf[], 2, end), 0, 0, 0);

	// Right foot: both feet on the ice at the start, shifted to its right
	// side; at 95% still on the ice, shifted backwards 0.5 m along the path
	// to twice its side offset; off the ice at 100% at the same shift.
	const right = g.getRightFootKeyframes();
	expect(right).toHaveLength(3);
	expectData(expectAt(right as unknown as Kf[], 0, start), 0, -SPACING, 0);
	expectData(expectAt(right as unknown as Kf[], 1, T95), -FREE_OFFSET, -2 * SPACING, 0);
	expectData(expectAt(right as unknown as Kf[], 2, end), -FREE_OFFSET, -2 * SPACING, 0.2);
});

test("a crossed forward glide swaps the sides of the centerline", () => {
	const g = glide("RightCrossedForwardGlide");

	// Crossed: the right (gliding) foot is centered for the whole stroke;
	// the left (free) foot starts on the right side. The free foot stays on
	// its (swapped) side, doubled at the end.
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 0, start), 0, -SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 2, end), 0, 0, 0);
	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 2, end), -FREE_OFFSET, -2 * SPACING, 0.2);
});

test("a normal backwards glide swaps the sides like a crossed forward one", () => {
	const g = glide("LeftNormalBackwardInsideGlide");

	// Swapped when going backwards: the left (gliding) foot is centered for
	// the whole stroke; the free foot starts on the left side.
	expectData(expectAt(g.getLeftFootKeyframes() as unknown as Kf[], 0, start), 0, 0, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 0, start), 0, SPACING, 0);
	// Free foot shifted forwards (away from the start) to a doubled offset.
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 1, T95), FREE_OFFSET, 2 * SPACING, 0);
	expectData(expectAt(g.getRightFootKeyframes() as unknown as Kf[], 2, end), FREE_OFFSET, 2 * SPACING, 0.2);
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
