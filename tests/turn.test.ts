import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import * as oneFootTurns from "../src/engine/sequences/turns/oneFootTurns.js";
import { Path } from "../src/engine/path.js";
import { Sequence } from "../src/engine/sequence.js";
import {
  LeftBackwardOutsideThreeTurn,
  LeftForwardInsideThreeTurn,
  LeftForwardOutsideThreeTurn,
} from "../src/engine/element/threeTurn.js";
import { LeftForwardInsideBracket } from "../src/engine/element/bracket.js";
import { LeftForwardInsideGlide } from "../src/engine/element/glide.js";
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

  expect(sequence.keyframes.footR).toHaveLength(3);

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

  const coordsBefore = sequence.keyframes.footR
    .map((keyframe) => keyframe.coordinate)
    .slice()
    .sort((a, b) => a - b);
  expect(coordsBefore[0]).toBeGreaterThanOrEqual(length / 4);
  expect(coordsBefore[coordsBefore.length - 1]).toBeLessThanOrEqual((3 * length) / 4);

  element.start = (length / 8) as PathCoordinate;
  element.end = ((5 * length) / 8) as PathCoordinate;
  sequence.updateElementKeyframes(element);

  const footR = sequence.keyframes.footR.map((keyframe) => keyframe.coordinate).sort((a, b) => a - b);
  expect(footR).toHaveLength(3);
  expect(footR[0]).toBeGreaterThanOrEqual(length / 8);
  expect(footR[footR.length - 1]).toBeLessThanOrEqual((5 * length) / 8);
});

test("changeFootTurnType converts an element's kind and derives the foot from the type", () => {
  const start = 0.2 as PathCoordinate;
  const end = 0.8 as PathCoordinate;
  const turn = new LeftForwardInsideThreeTurn("footR", start, end);
  const loop = changeFootTurnType("LeftBackwardInsideLoop", turn.toJSON());

  expect(loop).toBeInstanceOf(LeftBackwardInsideLoop);
  expect(loop.footKey).toBe("footL");
  expect(loop.start).toBe(start);
  expect(loop.end).toBe(end);
});

test("footTurnKindChoices lists all turn kinds and all glide kinds", () => {
  expect(footTurnKindChoices).toHaveLength(166);
  const types = footTurnKindChoices.map((choice) => choice.type);
  expect(types).toContain("LeftForwardInsideThreeTurn");
  expect(types).toContain("LeftBackwardOutsideLoop");
  expect(types).toContain("LeftForwardInsideBracket");
  expect(types).toContain("RightBackwardOutsideBracket");
  expect(types).toContain("LeftForwardInsideTwizzle1.5");
  expect(types).toContain("LeftForwardInsideGlide");
  expect(types).toContain("BothForwardGlide");
});

test("A bracket instantiates with the right type and short name", () => {
  const bracket = new LeftForwardInsideBracket("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);

  expect(bracket.type).toBe("LeftForwardInsideBracket");
  expect(bracket.shortName).toBe("LFIB");
});

test("A bracket rotates opposite to a three-turn on the same entry edge", () => {
  const threeTurn = new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
  const bracket = new LeftForwardInsideBracket("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);

  const threeTurnKeyframes = threeTurn.getLeftFootKeyframes();
  const bracketKeyframes = bracket.getLeftFootKeyframes();

  expect(threeTurnKeyframes).toHaveLength(3);
  expect(bracketKeyframes).toHaveLength(3);
  expect(threeTurnKeyframes[1]!.data.orientation!.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(bracketKeyframes[1]!.data.orientation!.angle).toBeCloseTo(Math.PI / 2, 10);
  expect(threeTurnKeyframes[1]!.data.orientation!.vector.z).toBeLessThan(0);
  expect(bracketKeyframes[1]!.data.orientation!.vector.z).toBeGreaterThan(0);
});

test("A glide round-trips and keeps its pose keyframes", () => {
  const start = 0.2 as PathCoordinate;
  const end = 0.8 as PathCoordinate;
  const glide = changeElementType("LeftForwardInsideGlide", {
    type: "LeftForwardGlide",
    start,
    end,
  });

  expect(glide).toBeInstanceOf(LeftForwardInsideGlide);
  expect(glide.getLeftFootKeyframes()).toHaveLength(2);
  expect(glide.getRightFootKeyframes()).toHaveLength(2);
  expect(glide.getHipsKeyframes()).toHaveLength(2);
  const onIce = glide.getLeftFootKeyframes()[0]!.data;
  expect(onIce.position!.y).toBeCloseTo(0, 5);
  expect(onIce.position!.z).toBeCloseTo(0, 5);
  const free = glide.getRightFootKeyframes()[0]!.data;
  expect(free.position!.y).toBeCloseTo(-0.15, 5);
  expect(free.position!.z).toBeCloseTo(0.2, 5);
  const both = changeElementType("BothBackwardGlide", { type: "LeftForwardGlide", start, end });
  expect(both.toJSON().type).toBe("BothBackwardGlide");
});

test("A turn gives keyframes to the on-ice foot, the free foot and the hips", () => {
  const start = 0.25 as PathCoordinate;
  const end = 0.75 as PathCoordinate;
  const turn = new LeftForwardInsideThreeTurn("footL", start, end);

  expect(turn.getLeftFootKeyframes()).toHaveLength(3);
  const free = turn.getRightFootKeyframes();
  expect(free).toHaveLength(2);
  expect(free[0]!.coordinate).toBe(start);
  expect(free[1]!.coordinate).toBe(end);
  expect(free[0]!.data.position!.x).toBe(0);
  expect(free[0]!.data.position!.y).toBeCloseTo(-0.15, 5);
  expect(free[0]!.data.position!.z).toBeCloseTo(0.2, 5);
  expect(free[0]!.data.contactPoint).toBe(0.5);
  expect(turn.getHipsKeyframes().length).toBeGreaterThanOrEqual(2);
});

test("The on-ice foot has no shift relative to the centerline at both ends", () => {
  const turn = new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
  const loop = new LeftForwardInsideLoop("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
  for (const element of [turn, loop]) {
    const keyframes = element.getLeftFootKeyframes();
    const first = keyframes[0]!.data.position!;
    const last = keyframes[2]!.data.position!;
    expect(first.y).toBe(0);
    expect(last.y).toBe(0);
  }
});

test("changeElementType derives the foot from the Left/Right type prefix", () => {
  const start = 0.2 as PathCoordinate;
  const end = 0.8 as PathCoordinate;
  const left = changeElementType("LeftForwardInsideThreeTurn", {
    type: "LeftForwardInsideThreeTurn",
    start,
    end,
  });
  const right = changeElementType("RightForwardInsideThreeTurn", {
    type: "RightForwardInsideThreeTurn",
    start,
    end,
  });

  expect(left.footKey).toBe("footL");
  expect(right.footKey).toBe("footR");
});

test("Backward turns rotate the reverse way of forward turns on the same edge", () => {
  expect(new LeftForwardInsideThreeTurn("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(true);
  expect(new LeftBackwardInsideLoop("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(false);
  expect(new LeftBackwardOutsideThreeTurn("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate).clockwise).toBe(true);
});

test("Loop hips make a full turn at the start, the center and the end", () => {
  const loop = new LeftForwardInsideLoop("footL", 0.2 as PathCoordinate, 0.8 as PathCoordinate);
  const hips = loop.getHipsKeyframes();

  expect(hips).toHaveLength(3);
  expect(hips[0]!.coordinate).toBe(0.2 as PathCoordinate);
  expect(hips[1]!.coordinate).toBe(0.5 as PathCoordinate);
  expect(hips[2]!.coordinate).toBe(0.8 as PathCoordinate);
  const angles = hips.map((keyframe) => keyframe.data.orientation!.angle);
  expect(angles[0]).toBeCloseTo(0, 10);
  expect(angles[1]).toBeCloseTo(Math.PI, 10);
  expect(angles[2]).toBeCloseTo(2 * Math.PI, 10);
});
