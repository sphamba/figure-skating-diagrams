import { expect, test } from "vitest";
import { bladeLength } from "../src/engine/constants.js";
import {
  spinConstructorsByType,
  spinKindChoices,
  type Spin,
  halfBladeLength,
} from "../src/engine/element/spin.js";
import { offIceFootHeight } from "../src/engine/element/glide.js";
import { Sequence, traceWidth } from "../src/engine/sequence.js";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import type { CanvasRenderingContext2DSized } from "../src/engine/rinkCanvas.js";
import { Curve } from "../src/engine/curve.js";
import { Path } from "../src/engine/path.js";
import { Vector } from "../src/engine/vector.js";

const start = 0;
const end = 2;
const middle = (start + end) / 2;
const HALF = bladeLength / 2;

function spinTraceSequence(typeName = "LeftInsideSpin", leftHanded = false): Sequence {
	const path = new Path();
	path.addCurveEnd(new Curve(new Vector(0, 0), new Vector(5 / 3, 0), new Vector(10 / 3, 0), new Vector(5, 0)));
	const sequence = new Sequence(path);
	sequence.addElement(spin(typeName, leftHanded));
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

function spin(typeName: string, leftHanded = false): Spin {
	return new (spinConstructorsByType[typeName] as new (start: number, end: number, leftHanded?: boolean) => Spin)(
		start,
		end,
		leftHanded,
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

test("a left-handed spin keeps the same shift side and sets spins to -1", () => {
	const instance = spin("LeftInsideSpin", true);
	expect(instance.onIceFoot).toBe("footL");

	const left = instance.getLeftFootKeyframes();
	expect(kfSpins(left[1])).toBe(-1);
	expect(left[1].data.position!.x).toBe(0);
	expect(left[1].data.position!.y).toBe(0);
	expect(left[1].data.spinShift!).toBeCloseTo(HALF, 10);
	expect(left[1].data.position!.z).toBe(0);

	const right = instance.getRightFootKeyframes();
	expect(right).toHaveLength(2);
	expect(kfSpins(right[0])).toBe(0);
	expect(right[0].data.position!.z).toBeCloseTo(offIceFootHeight, 10);
});

test("a left-handed right-foot outside spin keeps the same shift side and sets spins to -1", () => {
	const instance = spin("RightOutsideSpin", true);
	expect(instance.onIceFoot).toBe("footR");

	const right = instance.getRightFootKeyframes();
	expect(kfSpins(right[1])).toBe(-1);
	expect(right[1].data.spinShift!).toBeCloseTo(HALF, 10);

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

test("no circles are drawn for a resting foot or a non-spinning foot", () => {
	const sequence = spinTraceSequence();
	const right = makeCtx();
	sequence.drawFootTrace(right.ctx, "footR", 0 as PathCoordinate, sequence.path.length as PathCoordinate);
	expect(right.circles).toHaveLength(0);

	const leftHanded = spinTraceSequence("LeftInsideSpin", true);
	// Handedness only sets the spins attribute, not the shift, so the circle stays.
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
