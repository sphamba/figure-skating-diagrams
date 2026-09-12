import { expect, test } from "vitest";
import { jumpConstructorsByType, Jump, parseJumpType } from "../src/engine/element/jump";
import { changeElementType } from "../src/engine/element/turnTypes";
import { offIceFootHeight, halfFeetSpacing } from "../src/engine/element/glide";

const start = 0;
const end = 2; // span 2 m: 10% = 0.2, 50% = 1.0, 95% = 1.9


function jump(typeName: string): Jump {
	return new (jumpConstructorsByType[typeName] as unknown as new (start: number, end: number) => Jump)(start, end);
}

test("jumps scale visually along the path line with the span scale like turns", () => {
	const toeLoop = jump("ToeLoop1");
	expect(toeLoop.scalable).toBe(true);
	for (const keyframes of [toeLoop.getLeftFootKeyframes(2), toeLoop.getRightFootKeyframes(2)]) {
		expect(keyframes.map((keyframe) => keyframe.coordinate)).toEqual(
			[expect.closeTo(-1, 10), expect.closeTo(-0.6, 10), expect.closeTo(1, 10), expect.closeTo(2.8, 10), expect.closeTo(3, 10)],
		);
	}
	expect(toeLoop.getHipsKeyframes(2).map((keyframe) => keyframe.coordinate)).toEqual(
		[expect.closeTo(-1, 10), expect.closeTo(3, 10)],
	);
});

test("span scaling only moves the coordinates, the keyframe data stays unchanged", () => {
	const toeLoop = jump("ToeLoop1");
	const scaled = toeLoop.getRightFootKeyframes(2);
	expect(scaled).toHaveLength(5);
	expect(scaled[0]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(scaled[1]!.data.contactPoint).toBe(1);
	expect(scaled[0]!.data.position!.z).toBeCloseTo(0, 10);
	expect(scaled[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	// The same-foot landing still happens on ice with the shifted landing pose.
	expect(scaled[3]!.data.position!.z).toBeCloseTo(0, 10);
	expect(scaled[3]!.data.contactPoint).toBe(1);
	expect(scaled[3]!.data.toePick).toBe(true);
	expect(scaled[4]!.data.position!.z).toBeCloseTo(0, 10);
	expect(scaled[4]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(scaled[4]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(scaled[4]!.data.toePick).toBe(false);
	// Only the 95% landing pick carries toePick true.
	expect(scaled.filter((keyframe, index) => index !== 3).every((keyframe) => keyframe.data.toePick === false)).toBe(true);
});

test("jump registry exposes every jump with its revolution counts", () => {
	expect(Object.keys(jumpConstructorsByType)).toHaveLength(28);
	expect(Object.keys(jumpConstructorsByType)).toEqual(
		expect.arrayContaining([
			"ToeLoop1", "ToeLoop2", "ToeLoop3", "ToeLoop4",
			"Salchow1", "Loop2", "Flip3", "Lutz4", "Axel4", "Euler1",
		]),
	);
	for (const constructor of Object.values(jumpConstructorsByType)) {
		expect(new (constructor as unknown as new (start: number, end: number) => Jump)(start, end)).toBeInstanceOf(Jump);
	}
});

test("rotations follow the selected revolution count", () => {
	expect(jump("ToeLoop1").rotations).toBe(1);
	expect(jump("ToeLoop2").rotations).toBe(2);
	expect(jump("ToeLoop4").rotations).toBe(4);
	expect(jump("Euler1").rotations).toBe(1);
});

test("parseJumpType splits the type name into a jump and its revolutions", () => {
	expect(parseJumpType("ToeLoop2")).toEqual({ jump: "ToeLoop", revolutions: 2 });
	expect(parseJumpType("Loop1")).toEqual({ jump: "Loop", revolutions: 1 });
	expect(parseJumpType("LeftForwardOutsideLoop")).toBeUndefined();
	expect(parseJumpType("ToeLoop5")).toBeUndefined();
	expect(parseJumpType("ToeLoop")).toBeUndefined();
});

test("jumps round-trip through JSON", () => {
	for (const typeName of ["ToeLoop1", "Lutz3", "Euler1"]) {
		const original = jump(typeName);
		const json = original.toJSON();
		const restored = Jump.fromJSON(json);
		expect(restored.toJSON()).toEqual(json);
		expect(restored).toBeInstanceOf(Jump);
	}
});

test("ToeLoop take-off foot: on ice at start, toe at 10%, airborne from 50%, picks at 95%, lands on the take-off foot", () => {
	const toeLoop = jump("ToeLoop1");
	const right = toeLoop.getRightFootKeyframes();
	expect(right).toHaveLength(5);
	expect(right[0]!.coordinate).toBeCloseTo(start, 10);
	expect(right[1]!.coordinate).toBeCloseTo(0.2, 10);
	expect(right[2]!.coordinate).toBeCloseTo(1, 10);
	expect(right[3]!.coordinate).toBeCloseTo(1.9, 10);
	expect(right[4]!.coordinate).toBeCloseTo(end, 10);
	expect(right[0]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[0]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(right[0]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[1]!.data.contactPoint).toBe(1);
	expect(right[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	// The landing foot picks the toe at 95% before rolling to the full blade at 100%.
	expect(right[3]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.x).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[3]!.data.contactPoint).toBe(1);
	expect(right[3]!.data.toePick).toBe(true);
	// ToeLoop lands on the same foot it took off from: back on ice at 100%, backward orientation,
	// shifted outside from the centerline like every landing.
	expect(right[4]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[4]!.data.position!.x).toBeCloseTo(0, 10);
	expect(right[4]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[4]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(right[4]!.data.toePick).toBe(false);
	// Only the 95% landing pick has toePick true.
	expect(right.filter((keyframe, index) => index !== 3).every((keyframe) => keyframe.data.toePick === false)).toBe(true);
});

test("Loop1 lands on its take-off foot like ToeLoop1", () => {
	const loop = jump("Loop1");
	const right = loop.getRightFootKeyframes();
	expect(right).toHaveLength(5);
	expect(right[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(right[3]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.x).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[3]!.data.contactPoint).toBe(1);
	expect(right[3]!.data.toePick).toBe(true);
	expect(right[4]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[4]!.data.position!.x).toBeCloseTo(0, 10);
	expect(right[4]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[4]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(right[4]!.data.toePick).toBe(false);
	// The left foot is the free leg and never lands for Loop1.
	const left = loop.getLeftFootKeyframes();
	expect(left).toHaveLength(5);
	expect(left[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[3]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[4]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[3]!.data.toePick).toBe(false);
	expect(left[4]!.data.toePick).toBe(false);
});

test("ToeLoop free leg stays off-ice; only the landing foot comes down at 100%", () => {
	const toeLoop = jump("ToeLoop1");
	const left = toeLoop.getLeftFootKeyframes();
	expect(left).toHaveLength(5);
	expect(left[0]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[1]!.data.position!.z).toBeCloseTo(0, 10);
	expect(left[1]!.data.contactPoint).toBe(1);
	expect(left[1]!.data.toePick).toBe(true);
	expect(left[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[2]!.data.toePick).toBe(false);
	// The left foot is the free leg for ToeLoop1: it stays off-ice through 95% and 100%.
	expect(left[3]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[3]!.data.toePick).toBe(false);
	expect(left[4]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(left[4]!.data.toePick).toBe(false);
});

test("Salchow never picks a toe on its take-off foot and keeps the free foot off-ice at 10%", () => {
	const salchow = jump("Salchow1");
	// The take-off foot (left) never carries toePick true; the landing foot (right) picks at 95%.
	expect(salchow.getLeftFootKeyframes().every((keyframe) => keyframe.data.toePick === false)).toBe(true);
	expect(salchow.getRightFootKeyframes().filter((keyframe, index) => index !== 3).every((keyframe) => keyframe.data.toePick === false)).toBe(true);
	expect(salchow.toePick).toBe(false);
	const right = salchow.getRightFootKeyframes();
	expect(right).toHaveLength(5);
	expect(right[1]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(right[2]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	// Salchow takes off from the left foot: on-ice start on the left, off-ice start on the right.
	expect(salchow.getLeftFootKeyframes()[0]!.data.position!.z).toBeCloseTo(0, 10);
	expect(salchow.getLeftFootKeyframes()[0]!.data.contactPoint).toBeCloseTo(0.5, 10);
	// Salchow lands on the right foot: the landing foot picks the toe at 95%.
	expect(right[3]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.x).toBeCloseTo(0, 10);
	expect(right[3]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[3]!.data.contactPoint).toBe(1);
	expect(right[3]!.data.toePick).toBe(true);
	// ... and is on ice at 100%, shifted outside from the centerline.
	expect(right[4]!.data.position!.z).toBeCloseTo(0, 10);
	expect(right[4]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	// The left (take-off) foot stays off-ice at 95% and 100%.
	expect(salchow.getLeftFootKeyframes()[3]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
	expect(salchow.getLeftFootKeyframes()[4]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("Euler lands on the left foot on ice", () => {
	const euler = jump("Euler1");
	const keys = euler.getLeftFootKeyframes().map((keyframe) => keyframe.coordinate);
	expect(keys).toEqual([expect.closeTo(start, 10), expect.closeTo(0.2, 10), expect.closeTo(1, 10), expect.closeTo(1.9, 10), expect.closeTo(end, 10)]);
	// The landing foot (left) picks the toe at 95% before rolling to the full blade.
	expect(euler.getLeftFootKeyframes()[3]!.data.position!.z).toBeCloseTo(0, 10);
	expect(euler.getLeftFootKeyframes()[3]!.data.position!.x).toBeCloseTo(0, 10);
	expect(euler.getLeftFootKeyframes()[3]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(euler.getLeftFootKeyframes()[3]!.data.contactPoint).toBe(1);
	expect(euler.getLeftFootKeyframes()[3]!.data.toePick).toBe(true);
	expect(euler.getLeftFootKeyframes()[4]!.data.position!.z).toBeCloseTo(0, 10);
	expect(euler.getLeftFootKeyframes()[4]!.data.position!.x).toBeCloseTo(0, 10);
	expect(euler.getLeftFootKeyframes()[4]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(euler.getLeftFootKeyframes()[4]!.data.contactPoint).toBeCloseTo(0.5, 10);
	expect(euler.getRightFootKeyframes()[4]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("Axel entry flips the lateral side: forward take-off puts the take-off foot at -spacing", () => {
	const axel = jump("Axel1");
	// Axel takes off forward from the left foot: the take-off foot sits on the opposite side
	// of the backward take-offs.
	const left = axel.getLeftFootKeyframes();
	expect(left[0]!.data.position!.y).toBeCloseTo(-halfFeetSpacing, 10);
	expect(left[0]!.data.position!.z).toBeCloseTo(0, 10);
	// The free foot (right) sits on the opposite lateral side of the take-off foot.
	const right = axel.getRightFootKeyframes();
	expect(right[0]!.data.position!.y).toBeCloseTo(halfFeetSpacing, 10);
	expect(right[0]!.data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("a left-handed jump mirrors the feet, the lateral shifts and the orientations", () => {
	const left = new (jumpConstructorsByType["ToeLoop1"] as unknown as new (start: number, end: number, leftHanded?: boolean) => Jump)(
		start,
		end,
		true,
	);
	expect(left.leftHanded).toBe(true);
	// The mirrored take-off foot (left) takes off and ToeLoop still lands on its take-off foot.
	expect(left.takeOffFoot).toBe("footL");
	expect(left.landFoot).toBe("footL");
	// Every coordinate, contact point and toe pick stays; x and z stay; y and the orientation mirror.
	for (const [footKey, mirrorKey] of [["footL", "footR"], ["footR", "footL"]] as const) {
		const mirroredKeyframes = left.getFootKeyframes(footKey);
		const groundKeyframes = jump("ToeLoop1").getFootKeyframes(mirrorKey);
		expect(mirroredKeyframes).toHaveLength(groundKeyframes.length);
		for (let index = 0; index < mirroredKeyframes.length; index++) {
			const mirrored = mirroredKeyframes[index]!;
			const ground = groundKeyframes[index]!;
			expect(mirrored.coordinate).toBeCloseTo(ground.coordinate, 10);
			expect(mirrored.data.position!.x).toBeCloseTo(ground.data.position!.x, 10);
			expect(mirrored.data.position!.y).toBeCloseTo(-ground.data.position!.y, 10);
			expect(mirrored.data.position!.z).toBeCloseTo(ground.data.position!.z, 10);
			expect(mirrored.data.contactPoint).toBe(ground.data.contactPoint);
			expect(mirrored.data.toePick).toBe(ground.data.toePick);
			const mirroredOrientation = mirrored.data.orientation!;
			const groundOrientation = ground.data.orientation!;
			expect(mirroredOrientation.real).toBeCloseTo(groundOrientation.real, 10);
			expect(mirroredOrientation.vector.x).toBeCloseTo(-groundOrientation.vector.x, 10);
			expect(mirroredOrientation.vector.y).toBeCloseTo(-groundOrientation.vector.y, 10);
			expect(mirroredOrientation.vector.z).toBeCloseTo(-groundOrientation.vector.z, 10);
		}
	}
	// The same-foot landing shifts outside with the mirrored lateral sign.
	const takeOff = left.getLeftFootKeyframes();
	expect(takeOff[3]!.data.position!.y).toBeCloseTo(-halfFeetSpacing, 10);
	expect(takeOff[3]!.data.toePick).toBe(true);
	expect(takeOff[4]!.data.position!.y).toBeCloseTo(-halfFeetSpacing, 10);
	expect(takeOff[4]!.data.contactPoint).toBeCloseTo(0.5, 10);
});

test("left-handed jumps round-trip through JSON and jumps default to right-handed", () => {
	const json = { type: "ToeLoop1", start, end, leftHanded: true };
	const restored = Jump.fromJSON(json);
	expect(restored.leftHanded).toBe(true);
	expect(restored.toJSON().leftHanded).toBe(true);
	// The mirrored take-off foot survives the round trip.
	expect(restored.takeOffFoot).toBe("footL");
	expect(Jump.fromJSON({ type: "ToeLoop1", start, end }).leftHanded).toBe(false);
});

test("changeElementType builds jumps with revolution short names and keeps an override", () => {
	expect(changeElementType("ToeLoop1", { type: "ToeLoop1", start, end }).shortName).toBe("1T");
	expect(changeElementType("ToeLoop3", { type: "ToeLoop3", start, end }).shortName).toBe("3T");
	expect(changeElementType("Euler2", { type: "Euler2", start, end }).shortName).toBe("2Eu");
	const element = changeElementType("ToeLoop1", { type: "ToeLoop1", start, end });
	expect(element).toBeInstanceOf(Jump);
	element.shortName = "custom";
	expect(element.shortName).toBe("custom");
});
