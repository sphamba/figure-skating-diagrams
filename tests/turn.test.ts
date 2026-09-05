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
	sequence.addFootTurn("footR", new turn((path.length / 2) as PathCoordinate, true, true));
});
