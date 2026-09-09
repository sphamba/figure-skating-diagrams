import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import { LeftBackwardOutsideThreeTurn,
	LeftForwardInsideThreeTurn,
	LeftForwardOutsideThreeTurn,
} from "../src/engine/element/threeTurn.js";
import { LeftForwardInsideStroke } from "../src/engine/element/stroke.js";
import { LeftBackwardInsideLoop, LeftForwardInsideLoop } from "../src/engine/element/loop.js";
import { changeElementType } from "../src/engine/element/turnTypes.js";
import { changeFootTurnType } from "../src/engine/element/turn.js";
import { footTurnKindChoices } from "../src/engine/element/turnTypes.js";


test("Instanciate one foot turns", () => {
	expect(oneFootTurns).toBeTruthy();
});


test.each([
	["left backward outside three-turn", LeftBackwardOutsideThreeTurn],
	["left forward inside three-turn", LeftForwardInsideThreeTurn],
	["left forward inside loop", LeftForwardInsideLoop],
	["left forward outside three-turn", LeftForwardOutsideThreeTurn],
])("Add %s to sequence", (_turnName, turn) => {
	const path = new Path();
	const sequence = new Sequence(path);
	sequence.addElement(
		new turn("footR", (path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate, true, true),
	);
});

test("Elements are stored in a single sequence list", () => {
	const path = new Path();
	const sequence = new Sequence(path);
	const element = new LeftForwardInsideThreeTurn(
		"footL",
		(path.length / 4) as PathCoordinate,
		((3 * path.length) / 4) as PathCoordinate,
	);
	sequence.addElement(element);

	expect(sequence.elements).toEqual([element]);
});

test("Element keyframes are routed to the correct foot layer", () => {
	const path = new Path();
	const sequence = new Sequence(path);
	sequence.addElement(
		new LeftForwardInsideThreeTurn(
			"footR",
			(path.length / 4) as PathCoordinate,
			((3 * path.length) / 4) as PathCoordinate,
		),
	);

	// The turn is on the right foot: footR has the 3 turn keyframes.
	expect(sequence.keyframes.footR).toHaveLength(3);
	// The left foot is the free foot: it has the minimal 2 end keyframes.
	expect(sequence.keyframes.footL).toHaveLength(2);
});

test("Element keyframes are recomputed when its start/end change", () => {
	const path = new Path();
	const sequence = new Sequence(path);
	const length = path.length;
	const element = new LeftForwardInsideThreeTurn(
		"footR",
		(length / 4) as PathCoordinate,
		((3 * length) / 4) as PathCoordinate,
	);
	sequence.addElement(element);

	// The element spans [length/4, 3*length/4]; its 3 keyframes (entry, center,
	// exit) sit within that range.
	const coordsBefore = sequence.keyframes.footR
		.map((keyframe) => keyframe.coordinate)
		.slice()
		.sort((a, b) => a - b);
	expect(coordsBefore[0]).toBeGreaterThanOrEqual(length / 4);
	expect(coordsBefore[coordsBefore.length - 1]).toBeLessThanOrEqual((3 * length) / 4);

	// Move the element to [length/8, 5*length/8] and refresh its keyframes.
	element.start = (length / 8) as PathCoordinate;
	element.end = ((5 * length) / 8) as PathCoordinate;
	sequence.updateElementKeyframes(element);

	const footR = sequence.keyframes.footR.map((keyframe) => keyframe.coordinate).sort((a, b) => a - b);
	// Still exactly 3 keyframes (no duplicates from the old span).
	expect(footR).toHaveLength(3);
	// Now the keyframes fall inside the new span.
	expect(footR[0]).toBeGreaterThanOrEqual(length / 8);
	expect(footR[footR.length - 1]).toBeLessThanOrEqual((5 * length) / 8);
});

test("changeFootTurnType converts an element's kind while preserving its span and foot", () => {
	const start = 0.2 as PathCoordinate;
	const end = (0.8 as PathCoordinate);
	const turn = new LeftForwardInsideThreeTurn("footR", start, end, false, true);
	const loop = changeFootTurnType("LeftBackwardInsideLoop", turn.toJSON());

	expect(loop).toBeInstanceOf(LeftBackwardInsideLoop);
	expect(loop.footKey).toBe("footR");
	expect(loop.start).toBe(start);
	expect(loop.end).toBe(end);
	expect(loop.smoothEntry).toBe(false);
	expect(loop.smoothExit).toBe(true);
});

test("footTurnKindChoices lists all sixteen turn kinds and all stroke kinds", () => {
	expect(footTurnKindChoices).toHaveLength(30);
	const types = footTurnKindChoices.map((choice) => choice.type);
	expect(types).toContain("LeftForwardInsideThreeTurn");
	expect(types).toContain("LeftBackwardOutsideLoop");
	expect(types).toContain("LeftForwardInsideStroke");
	expect(types).toContain("BothForwardStroke");
});

test("A stroke round-trips and keeps its pose keyframes", () => {
	const start = 0.2 as PathCoordinate;
	const end = (0.8 as PathCoordinate);
	const stroke = changeElementType("LeftForwardInsideStroke", {
		type: "LeftForwardStroke",
		start,
		end,
	});

	expect(stroke).toBeInstanceOf(LeftForwardInsideStroke);
	// The pose keyframes keep the same shape as the renamed stroke kinds: two
	// keyframes per foot axis, the off-ice foot lifted and shifted to its side.
	expect(stroke.getLeftFootKeyframes()).toHaveLength(2);
	expect(stroke.getRightFootKeyframes()).toHaveLength(2);
	expect(stroke.getHipsKeyframes()).toHaveLength(2);
	const onIce = stroke.getLeftFootKeyframes()[0]!.data;
	expect(onIce.position!.y).toBeCloseTo(0, 5);
	expect(onIce.position!.z).toBeCloseTo(0, 5);
	const free = stroke.getRightFootKeyframes()[0]!.data;
	expect(free.position!.y).toBeCloseTo(-0.15, 5);
	expect(free.position!.z).toBeCloseTo(0.2, 5);
	// A two-foot stroke round-trips with no edge.
	const both = changeElementType("BothBackwardStroke", { type: "LeftForwardStroke", start, end });
	expect(both.toJSON().type).toBe("BothBackwardStroke");
});

test("A turn gives keyframes to the on-ice foot, the free foot and the hips", () => {
	const start = 0.25 as PathCoordinate;
	const end = 0.75 as PathCoordinate;
	const turn = new LeftForwardInsideThreeTurn("footL", start, end);

	// The on-ice foot gets the detailed turn keyframes.
	expect(turn.getLeftFootKeyframes()).toHaveLength(3);
	// The free foot gets just the minimal 2 keyframes at both ends.
	const free = turn.getRightFootKeyframes();
	expect(free).toHaveLength(2);
	expect(free[0]!.coordinate).toBe(start);
	expect(free[1]!.coordinate).toBe(end);
	// The free foot is shifted like the off-ice foot of the stroke elements:
	// half the foot spacing to its side, lifted off the ice, facing forward.
	expect(free[0]!.data.position!.x).toBe(0);
	expect(free[0]!.data.position!.y).toBeCloseTo(-0.15, 5);
	expect(free[0]!.data.position!.z).toBeCloseTo(0.2, 5);
	expect(free[0]!.data.contactPoint).toBe(0.5);
	// The hips get keyframes at both ends.
	expect(turn.getHipsKeyframes().length).toBeGreaterThanOrEqual(2);
});

test("The on-ice foot has no shift relative to the centerline at both ends", () => {
	const turn = new LeftForwardInsideThreeTurn("footL", (0.25 as PathCoordinate), (0.75 as PathCoordinate));
	const loop = new LeftForwardInsideLoop("footL", (0.25 as PathCoordinate), (0.75 as PathCoordinate));
	for (const element of [turn, loop]) {
		const keyframes = element.getLeftFootKeyframes();
		const first = keyframes[0]!.data.position!;
		const last = keyframes[2]!.data.position!;
		expect(first.y).toBe(0);
		expect(last.y).toBe(0);
	}
});

test("A right turn turns on the right foot of the element type", () => {
	const start = 0.2 as PathCoordinate;
	const end = (0.8 as PathCoordinate);
	const left = changeElementType("LeftForwardInsideThreeTurn", {
		type: "LeftForwardInsideThreeTurn",
		start,
		end,
		footKey: "footR",
	});
	const right = changeElementType("RightBackwardOutsideLoop", {
		type: "RightForwardInsideThreeTurn",
		start,
		end,
		footKey: "footL",
	});

	expect(left.footKey).toBe("footL");
	expect(right.footKey).toBe("footR");
});

test("Backward turns rotate the reverse way of forward turns on the same edge", () => {
	// Forward: a left turn on an inside edge rotates clockwise.
	expect(new LeftForwardInsideThreeTurn("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(true);
	// Backward: the same edge rotates the reverse way.
	expect(new LeftBackwardInsideLoop("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(false);
	// Backward: the other edge rotates the other way.
	expect(new LeftBackwardOutsideThreeTurn("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(true);
});

test("Loop hips make a full turn at the start, the center and the end", () => {
	const loop = new LeftForwardInsideLoop("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate);
	const hips = loop.getHipsKeyframes();

	expect(hips).toHaveLength(3);
	expect(hips[0]!.coordinate).toBe(0.2 as PathCoordinate);
	expect(hips[1]!.coordinate).toBe(0.5 as PathCoordinate);
	expect(hips[2]!.coordinate).toBe(0.8 as PathCoordinate);
	// A left loop is counterclockwise: the angles are 0, 180 and 360 degrees.
	const angles = hips.map((keyframe) => keyframe.data.orientation!.angle);
	expect(angles[0]).toBeCloseTo(0, 10);
	expect(angles[1]).toBeCloseTo(Math.PI, 10);
	expect(angles[2]).toBeCloseTo(2 * Math.PI, 10);
});
