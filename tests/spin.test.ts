// @vitest-environment node
import { expect, test } from "vitest";
import { bladeLength } from "../src/engine/constants.js";
import {
  Spin,
  spinConstructorsByType,
  spinKindChoices,
  type SpinConstructor,
  halfBladeLength,
} from "../src/engine/element/spin.js";
import { changeElementType } from "../src/engine/element/turnTypes.js";
import { offIceFootHeight } from "../src/engine/element/glide.js";
import { Sequence, traceWidth } from "../src/engine/sequence.js";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import type { CanvasRenderingContext2DSized } from "../src/engine/rinkCanvas.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Vector } from "../src/engine/vector.js";
import type { Quaternion } from "../src/engine/quaternion.js";

const start = 0;
const end = 2;
const middle = (start + end) / 2;
const HALF = bladeLength / 2;

function spinTraceSequence(typeName = "LeftInsideSpin", leftHanded = false, revolutions?: number): Sequence {
	const path = new Path();
	path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(5 / 3, 0), new Vector(10 / 3, 0), new Vector(5, 0)));
	const sequence = new Sequence(path);
	sequence.addElement(spin(typeName, leftHanded, revolutions));
	return sequence;
}

function makeCtx() {
	const circles: Array<{ x: number; y: number; r: number }> = [];
	const strokes: Array<Array<{ x: number; y: number }>> = [];
	const dashes: number[][] = [];
	const ctx: Record<string, unknown> = {
		width: 0,
		height: 0,
		globalAlpha: 1,
		strokeStyle: undefined,
		lineWidth: 0,
	};
	ctx.beginPath = () => strokes.push([]);
	ctx.moveTo = (x: number, y: number) => strokes[strokes.length - 1]?.push({ x, y });
	ctx.lineTo = (x: number, y: number) => strokes[strokes.length - 1]?.push({ x, y });
	ctx.arc = (x: number, y: number, r: number) => circles.push({ x, y, r });
	ctx.setLineDash = (dash: number[]) => dashes.push([...dash]);
	ctx.stroke = () => {};
	return { ctx: ctx as unknown as CanvasRenderingContext2DSized, strokes, circles, dashes };
}

function spin(typeName: string, leftHanded = false, revolutions?: number): Spin {
	return new (spinConstructorsByType[typeName] as SpinConstructor)(
		start as PathCoordinate,
		end as PathCoordinate,
		leftHanded,
		undefined,
		revolutions,
	);
}

function kfSpins(kf: Spin): number {
	return kf.data.spins ?? 0;
}

test("spin registry lists all four spin kinds", () => {
	expect(Object.keys(spinConstructorsByType)).toHaveLength(4);
	expect(spinKindChoices).toHaveLength(4);
	expect(Object.keys(spinConstructorsByType)).toContain("LeftInsideSpin");
	expect(Object.keys(spinConstructorsByType)).toContain("LeftOutsideSpin");
	expect(Object.keys(spinConstructorsByType)).toContain("RightInsideSpin");
	expect(Object.keys(spinConstructorsByType)).toContain("RightOutsideSpin");
});

test("a right-handed left-foot inside spin shifts the on-ice foot to +y and sets spins to 1", () => {
	const instance = spin("LeftInsideSpin");
	expect(instance.onIceFoot).toBe("footL");

	const left = instance.getLeftFootKeyframes();
	expect(left).toHaveLength(3);
	expect(left[0].coordinate).toBe(start);
	expect(left[1].coordinate).toBe(middle);
	expect(left[2].coordinate).toBe(end);
	for (const index of [0, 1, 2]) {
		const kf = left[index];
		expect(kf.data.position!.x).toBe(0);
		expect(kf.data.position!.y).toBe(0);
		expect(kf.data.position!.z).toBe(0);
	}
	expect(kfSpins(left[1])).toBe(1);
	expect(left[0].data.spinShift).toBeUndefined();
	expect(left[1].data.spinShift!).toBeCloseTo(HALF, 10);
	expect(left[2].data.spinShift).toBeUndefined();

	const right = instance.getRightFootKeyframes();
	expect(right).toHaveLength(2);
	expect(kfSpins(right[0])).toBe(0);
	expect(right[0].data.position!.x).toBe(0);
	expect(right[0].data.position!.y).toBe(0);
	expect(right[0].data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("a left-handed spin shifts to -y and sets spins to -1", () => {
	const instance = spin("LeftInsideSpin", true);
	expect(instance.onIceFoot).toBe("footL");

	const left = instance.getLeftFootKeyframes();
	expect(kfSpins(left[1])).toBe(-1);
	expect(left[1].data.position!.x).toBe(0);
	expect(left[1].data.position!.y).toBe(0);
	expect(left[1].data.spinShift!).toBeCloseTo(-HALF, 10);
	expect(left[1].data.position!.z).toBe(0);

	const right = instance.getRightFootKeyframes();
	expect(right).toHaveLength(2);
	expect(kfSpins(right[0])).toBe(0);
	expect(right[0].data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("a left-handed right-foot outside spin shifts to -y and sets spins to -1", () => {
	const instance = spin("RightOutsideSpin", true);
	expect(instance.onIceFoot).toBe("footR");

	const right = instance.getRightFootKeyframes();
	expect(kfSpins(right[1])).toBe(-1);
	expect(right[1].data.spinShift!).toBeCloseTo(-HALF, 10);

	const left = instance.getLeftFootKeyframes();
	expect(left).toHaveLength(2);
	expect(left[0].data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("a right-handed right-foot outside spin shifts to +y", () => {
	const instance = spin("RightOutsideSpin");
	expect(instance.onIceFoot).toBe("footR");
	expect(kfSpins(instance.getRightFootKeyframes()[1])).toBe(1);
	expect(instance.getRightFootKeyframes()[1].data.spinShift!).toBeCloseTo(HALF, 10);
	expect(instance.getRightFootKeyframes()[1].data.position!.y).toBe(0);
});

test("the shift side depends on the handedness only", () => {
	for (const typeName of ["LeftInsideSpin", "LeftOutsideSpin", "RightInsideSpin", "RightOutsideSpin"]) {
		const shiftsOf = (leftHanded: boolean) =>
			[...spin(typeName, leftHanded).getLeftFootKeyframes(), ...spin(typeName, leftHanded).getRightFootKeyframes()].find(
				(keyframe) => (keyframe.data.spins ?? 0) !== 0,
			)!.data.spinShift!;
		expect(shiftsOf(false)).toBeCloseTo(HALF, 10);
		expect(shiftsOf(true)).toBeCloseTo(-HALF, 10);
	}
});

test("the revolution count sets the spins attribute and is kept on the element", () => {
	const rightHanded = spin("LeftInsideSpin", false, 3);
	expect(rightHanded.revolutions).toBe(3);
	expect(kfSpins(rightHanded.getLeftFootKeyframes()[1])).toBe(3);

	const leftHanded = spin("LeftInsideSpin", true, 3);
	expect(leftHanded.revolutions).toBe(3);
	expect(kfSpins(leftHanded.getLeftFootKeyframes()[1])).toBe(-3);
});

test("the revolution count must be an integer of at least 1", () => {
	for (const revolutions of [0, -2, 1.5]) {
		expect(() => spin("LeftInsideSpin", false, revolutions)).toThrow();
	}
});

test("the revolution count is saved to and loaded from JSON", () => {
	const instance = spin("LeftInsideSpin", false, 3);
	const json = instance.toJSON();
	expect(json.revolutions).toBe(3);

	const restored = Spin.fromJSON(json);
	expect(restored.revolutions).toBe(3);
	expect(kfSpins(restored.getLeftFootKeyframes()[1])).toBe(3);
});

test("changeElementType builds a spin with the given revolution count", () => {
	const element = changeElementType("LeftInsideSpin", {
		type: "LeftInsideSpin",
		start,
		end,
		spinType: "sit",
		revolutions: 2,
	});
	expect(element).toBeInstanceOf(Spin);
	expect((element as Spin).revolutions).toBe(2);
	expect((element as Spin).spinType).toBe("sit");
});

test("the on-ice foot orientation depends on foot, edge and handedness", () => {
	const cases: [string, boolean, "forward" | "backward"][] = [
		["LeftInsideSpin", false, "backward"],
		["LeftOutsideSpin", false, "forward"],
		["RightInsideSpin", false, "forward"],
		["RightOutsideSpin", false, "backward"],
		["LeftInsideSpin", true, "forward"],
		["LeftOutsideSpin", true, "backward"],
		["RightInsideSpin", true, "backward"],
		["RightOutsideSpin", true, "forward"],
	];
	for (const [typeName, leftHanded, expected] of cases) {
		const instance = spin(typeName, leftHanded);
		const keyframes =
			instance.onIceFoot === "footL" ? instance.getLeftFootKeyframes() : instance.getRightFootKeyframes();
		const direction = new Vector<3>(1, 0, 0).rotate(keyframes[0].data.orientation!);
		expect(direction.x).toBeCloseTo(expected === "forward" ? 1 : -1, 10);
	}
});

test("spin hips match the on-ice foot at entry and exit and sweep the revolutions", () => {
	// A right-handed spin rotates counterclockwise from the on-ice foot orientation.
	const right = spin("RightInsideSpin", false, 1); // forward on-ice foot orientation
	const hips = right.getHipsKeyframes();
	expect(hips).toHaveLength(5); // entry + one keyframe per quarter turn
	for (let i = 0; i < 5; i++) {
		expect(hips[i]!.coordinate).toBeCloseTo(start + ((end - start) * i) / 4, 10);
		const expectedAngle = (i * Math.PI) / 2; // forward entry angle, ccw rotation
		expect(hips[i]!.data.orientation!.real).toBeCloseTo(Math.cos(expectedAngle / 2), 10);
		expect(hips[i]!.data.orientation!.vector.z).toBeCloseTo(Math.sin(expectedAngle / 2), 10);
	}
	// The entry and the exit keep the on-ice foot orientation.
	const footDirection = new Vector<3>(1, 0, 0).rotate(right.getRightFootKeyframes()[0].data.orientation!);
	const hipsDirection = new Vector<3>(1, 0, 0).rotate(hips[0].data.orientation!);
	expect(hipsDirection.x).toBeCloseTo(footDirection.x, 10);
	const exitHipsDirection = new Vector<3>(1, 0, 0).rotate(hips[4].data.orientation!);
	expect(exitHipsDirection.x).toBeCloseTo(footDirection.x, 10);

	// A left-handed spin mirrors the hips rotation like the feet: the entry
	// direction flips and the sweep rotates the mirrored way.
	const left = spin("RightInsideSpin", true, 1);
	const leftHips = left.getHipsKeyframes();
	const directionX = (keyframe: { data: { orientation?: Quaternion } }) =>
		new Vector(1, 0, 0).rotate(keyframe.data.orientation!).x;
	for (let i = 0; i < leftHips.length; i++) {
		expect(directionX(leftHips[i])).toBeCloseTo(-directionX(hips[i]), 10);
	}
});

test("spinning keyframes are saved to draw one circle each at the end", () => {
	const sequence = spinTraceSequence();
	const spinKeyframes = sequence.keyframes.footL.filter((keyframe) => (keyframe.data.spins ?? 0) !== 0);
	expect(spinKeyframes).toHaveLength(1);

	const { ctx, circles } = makeCtx();
	sequence.drawFootTrace(ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(circles).toHaveLength(1);

	const keyframe = spinKeyframes[0]!;
	const radius = Math.abs(keyframe.data.spinShift!);
	expect(radius).toBeCloseTo(halfBladeLength, 10);
	const circle = circles[0]!;
	expect(circle.r).toBeCloseTo(radius, 10);
	// Right-handed left-inside: the circle sits at +y of the centerline, touching it.
	expect(circle.x).toBeCloseTo(sequence.path.getPosition(keyframe.coordinate as PathCoordinate).x, 10);
	expect(circle.y).toBeCloseTo(-radius, 10);
	expect(ctx.strokeStyle).toBe(sequence.traceColorL);
	expect(ctx.lineWidth).toBeCloseTo(traceWidth, 10);
});

test("several spins draw one circle per revolution, spanning the element from start to end", () => {
	const sequence = spinTraceSequence();
	const spinKeyframe = sequence.keyframes.footL.find((keyframe) => (keyframe.data.spins ?? 0) !== 0)!;
	spinKeyframe.data.spins = 3;

	const { ctx, circles } = makeCtx();
	sequence.drawFootTrace(ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(circles).toHaveLength(3);

	const radius = Math.abs(spinKeyframe.data.spinShift!);
	expect(radius).toBeCloseTo(halfBladeLength, 10);
	// The path is a straight line from (0, 0) to (5, 0) and the element spans path
	// coordinates 0 to 2, so the circle centers sit at x = 1/3, 1 and 5/3.
	const expectedX = [1 / 3, 1, 5 / 3];
	for (let i = 0; i < 3; i++) {
		const circle = circles[i]!;
		expect(circle.r).toBeCloseTo(radius, 10);
		expect(circle.x).toBeCloseTo(expectedX[i]!, 10);
		expect(circle.y).toBeCloseTo(-radius, 10);
	}
});

test("a negative spins count draws abs(spins) circles", () => {
	const sequence = spinTraceSequence();
	const spinKeyframe = sequence.keyframes.footL.find((keyframe) => (keyframe.data.spins ?? 0) !== 0)!;
	spinKeyframe.data.spins = -2;

	const { ctx, circles } = makeCtx();
	sequence.drawFootTrace(ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(circles).toHaveLength(2);

	const radius = Math.abs(spinKeyframe.data.spinShift!);
	const expectedX = [0.5, 1.5];
	for (let i = 0; i < 2; i++) {
		const circle = circles[i]!;
		expect(circle.r).toBeCloseTo(radius, 10);
		expect(circle.x).toBeCloseTo(expectedX[i]!, 10);
		expect(circle.y).toBeCloseTo(-radius, 10);
	}
});

test("a spin element with three revolutions draws three circles spanning the element", () => {
	const sequence = spinTraceSequence("LeftInsideSpin", false, 3);
	const spinKeyframe = sequence.keyframes.footL.find((keyframe) => (keyframe.data.spins ?? 0) !== 0)!;
	expect(spinKeyframe.data.spins).toBe(3);

	const { ctx, circles } = makeCtx();
	sequence.drawFootTrace(ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(circles).toHaveLength(3);

	const radius = Math.abs(spinKeyframe.data.spinShift!);
	// The path is a straight line from (0, 0) to (5, 0) and the element spans path
	// coordinates 0 to 2, so the circle centers sit at x = 1/3, 1 and 5/3.
	const expectedX = [1 / 3, 1, 5 / 3];
	for (let i = 0; i < 3; i++) {
		const circle = circles[i]!;
		expect(circle.r).toBeCloseTo(radius, 10);
		expect(circle.x).toBeCloseTo(expectedX[i]!, 10);
		expect(circle.y).toBeCloseTo(-radius, 10);
	}
});

test("no circles are drawn for a resting foot or a non-spinning foot", () => {
	const sequence = spinTraceSequence();
	const right = makeCtx();
	sequence.drawFootTrace(right.ctx, "footR", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(right.circles).toHaveLength(0);

	const leftHanded = spinTraceSequence("LeftInsideSpin", true);
	// Handedness flips the shift side, but the circle stays, on the other side.
	expect(leftHanded.keyframes.footL.filter((keyframe) => (keyframe.data.spins ?? 0) !== 0)).toHaveLength(1);
	const left = makeCtx();
	leftHanded.drawFootTrace(left.ctx, "footL", 0 as PathCoordinate, leftHanded.path.length as PathCoordinate);
	expect(left.circles).toHaveLength(1);
	expect(left.circles[0]!.r).toBeCloseTo(halfBladeLength, 10);
});

test("spin circle thickness follows the minimum clamp", () => {
	const sequence = spinTraceSequence();
	const clamped = makeCtx();
	sequence.drawFootTrace(clamped.ctx, "footL", 0 as PathCoordinate, sequence.path.length as PathCoordinate, 0.01);
	expect(clamped.ctx.lineWidth).toBeCloseTo(Math.max(traceWidth, 0.01), 10);
});

test("backwards feet draw dashed circles at the real-length draw increment", () => {
	// LeftInsideSpin traces backwards (LI->B), so the circle is dashed with
	// dash length "step", space "step", step = max(drawIncrement, minDrawIncrement).
	const sequence = spinTraceSequence();
	const { ctx, dashes } = makeCtx();
	sequence.drawFootTrace(
		ctx,
		"footL",
		0 as PathCoordinate,
		sequence.path.length as PathCoordinate,
		undefined,
		undefined,
		undefined,
		0.05,
	);
	expect(dashes).toContainEqual([0.05, 0.05]);
	// The dash reset leaves the next strokes solid.
	expect(dashes[dashes.length - 1]).toEqual([]);

	// LeftOutsideSpin traces forwards (LO->F), so the circle stays solid.
	const forward = spinTraceSequence("LeftOutsideSpin");
	const forwardMock = makeCtx();
	forward.drawFootTrace(
		forwardMock.ctx,
		"footL",
		0 as PathCoordinate,
		forward.path.length as PathCoordinate,
		undefined,
		undefined,
		undefined,
		0.05,
	);
	expect(forwardMock.dashes).not.toContainEqual([0.05, 0.05]);
});
