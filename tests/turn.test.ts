import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import {
	BackwardClockwiseFootTurn,
	BackwardCounterClockwiseFootTurn,
	ForwardClockwiseFootLoop,
	ForwardClockwiseFootTurn,
	ForwardCounterClockwiseFootTurn,
} from "../src/engine/turn.js";


test("Instanciate one foot turns", () => {
	expect(oneFootTurns).toBeTruthy();
});


test.each([
	["backward clockwise foot turn", BackwardClockwiseFootTurn],
	["backward counter clockwise foot turn", BackwardCounterClockwiseFootTurn],
	["forward clockwise foot loop", ForwardClockwiseFootLoop],
	["forward clockwise foot turn", ForwardClockwiseFootTurn],
	["forward counter clockwise foot turn", ForwardCounterClockwiseFootTurn],
])("Add %s to sequence", (turnName, turn) => {
	const path = new Path();
	const sequence = new Sequence(path);
	sequence.addElement(
		new turn("footR", (path.length / 4) as PathCoordinate, ((3 * path.length) / 4) as PathCoordinate, true, true),
	);
});

test("Elements are stored in a single sequence list", () => {
	const path = new Path();
	const sequence = new Sequence(path);
	const element = new ForwardClockwiseFootTurn(
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
		new ForwardClockwiseFootTurn(
			"footR",
			(path.length / 4) as PathCoordinate,
			((3 * path.length) / 4) as PathCoordinate,
		),
	);

	// The turn is on the right foot: footR has the 3 turn keyframes.
	expect(sequence.keyframes.footR).toHaveLength(3);
	// The left foot has none.
	expect(sequence.keyframes.footL).toHaveLength(0);
});
