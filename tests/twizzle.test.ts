import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates.js";
import { Twizzle, twizzleConstructorsByType, twizzleKindChoices, twizzleTurns } from "../src/engine/element/twizzle.js";
import { LeftBackwardOutsideThreeTurn, LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { changeElementType } from "../src/engine/element/turnTypes.js";
import { changeFootTurnType } from "../src/engine/element/turn.js";

function makeTwizzle(type: string, start = 0.25, end = 0.75) {
  const TwizzleVariant = twizzleConstructorsByType[type]!;
  return new TwizzleVariant("footL", start as PathCoordinate, end as PathCoordinate);
}

test.each([
  ["LeftForwardInsideTwizzle1.5", "LFI 1-1/2 TW"],
  ["LeftForwardInsideTwizzle2", "LFI 2TW"],
  ["LeftForwardInsideTwizzle0.5", "LFI 1/2 TW"],
  ["LeftForwardInsideTwizzle5", "LFI 5TW"],
  ["LeftForwardInsideTwizzle4.5", "LFI 4-1/2 TW"],
  ["LeftForwardInsideTwizzle1", "LFI 1TW"],
  ["LeftForwardInsideTwizzle5.5", "LFI 5-1/2 TW"],
  ["RightBackwardOutsideTwizzle2.5", "RBO 2-1/2 TW"],
  ["RightForwardInsideTwizzle0.5", "RFI 1/2 TW"],
])("A %s twizzle instantiates with the right type and short name", (type, shortName) => {
  const twizzle = makeTwizzle(type);

  expect(twizzle.type).toBe(type);
  expect(twizzle.shortName).toBe(shortName);
});

test.each([
  [0.5, 3],
  [1, 5],
  [1.5, 7],
  [2, 9],
  [2.5, 11],
  [3, 13],
  [3.5, 15],
  [4, 17],
  [4.5, 19],
  [5, 21],
  [5.5, 23],
])("A %s-turn twizzle has %i keyframes on the on-ice foot", (turns, keyframeCount) => {
  const twizzle = makeTwizzle(`LeftForwardInsideTwizzle${turns}`);

  expect(twizzle.getLeftFootKeyframes()).toHaveLength(keyframeCount);
  // hips and free foot come from the one-foot turn base behavior
  expect(twizzle.getRightFootKeyframes()).toHaveLength(2);
  expect(twizzle.getHipsKeyframes()).toHaveLength(2);
});

test("A 1/2-turn twizzle has the same on-ice foot keyframes as a three-turn", () => {
  const twizzle = makeTwizzle("LeftForwardInsideTwizzle0.5");
  const threeTurn = new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
  const twizzleKeyframes = twizzle.getLeftFootKeyframes();
  const threeTurnKeyframes = threeTurn.getLeftFootKeyframes();
  const start = 0.25 as PathCoordinate;
  const middle = 0.5 as PathCoordinate;
  const end = 0.75 as PathCoordinate;

  expect(twizzleKeyframes).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(twizzleKeyframes[i]!.coordinate).toBe([start, middle, end][i]);
    expect(twizzleKeyframes[i]!.data.position!.x).toBe(0);
    expect(twizzleKeyframes[i]!.data.position!.y).toBe(0);
    expect(twizzleKeyframes[i]!.data.position!.z).toBe(0);
    expect(twizzleKeyframes[i]!.data.orientation!.real).toBeCloseTo(threeTurnKeyframes[i]!.data.orientation!.real, 10);
    expect(twizzleKeyframes[i]!.data.orientation!.vector.z).toBeCloseTo(
      threeTurnKeyframes[i]!.data.orientation!.vector.z,
      10,
    );
    expect(twizzleKeyframes[i]!.data.contactPoint).toBe(threeTurnKeyframes[i]!.data.contactPoint);
    expect(twizzleKeyframes[i]!.transitionIn).toBe(threeTurnKeyframes[i]!.transitionIn);
    expect(twizzleKeyframes[i]!.transitionOut).toBe(threeTurnKeyframes[i]!.transitionOut);
  }
});

test("A twizzle has smooth entry and exit transitions and linear transitions within", () => {
  const twizzle = makeTwizzle("LeftForwardInsideTwizzle1.5");
  const keyframes = twizzle.getLeftFootKeyframes();

  expect(keyframes).toHaveLength(7);
  expect(keyframes[0]!.transitionIn).toBe("linear");
  expect(keyframes[0]!.transitionOut).toBe("smooth");
  expect(keyframes[6]!.transitionIn).toBe("smooth");
  expect(keyframes[6]!.transitionOut).toBe("linear");
  for (let i = 1; i < 6; i++) {
    expect(keyframes[i]!.transitionIn).toBe("linear");
    expect(keyframes[i]!.transitionOut).toBe("linear");
  }
});

test.each<[string, number[]]>([
  ["LeftForwardInsideTwizzle1.5", [0.5, 1, 0.5, 0, 0.5, 1, 0.5]],
  ["LeftBackwardInsideTwizzle1.5", [0.5, 0, 0.5, 1, 0.5, 0, 0.5]],
  ["LeftForwardInsideTwizzle2", [0.5, 1, 0.5, 0, 0.5, 1, 0.5, 0, 0.5]],
])("Twizzle contact points oscillate between opposite ends of the foot: %s", (type, contactPoints) => {
  const twizzle = makeTwizzle(type);
  const keyframes = twizzle.getLeftFootKeyframes();

  expect(keyframes).toHaveLength(contactPoints.length);
  for (let i = 0; i < contactPoints.length; i++) {
    expect(keyframes[i]!.data.contactPoint).toBe(contactPoints[i]);
  }
});

test("The on-ice foot keyframes stay evenly spaced over the span", () => {
  const twizzle = makeTwizzle("LeftForwardInsideTwizzle2");
  const keyframes = twizzle.getLeftFootKeyframes();
  const step = (0.75 - 0.25) / 8;

  for (let i = 0; i < 9; i++) {
    expect(keyframes[i]!.coordinate).toBeCloseTo(0.25 + step * i, 10);
  }
});

test("A two-turn twizzle completes full revolutions the same way as three-turns", () => {
  const twizzle = makeTwizzle("LeftForwardInsideTwizzle2");
  const keyframes = twizzle.getLeftFootKeyframes();

  expect(keyframes).toHaveLength(9);
  // after one full revolution (4 quarter-turn steps) the skate is back on its first edge
  const afterOneRevolution = keyframes[4]!.data.orientation!;
  expect(Math.abs(afterOneRevolution.real)).toBeCloseTo(1, 10);
  expect(Math.abs(afterOneRevolution.vector.z)).toBeCloseTo(0, 10);
  const afterTwoRevolutions = keyframes[8]!.data.orientation!;
  expect(Math.abs(afterTwoRevolutions.real)).toBeCloseTo(1, 10);
  // quarter-turn steps, same direction as a three-turn on the same entry edge
  expect(keyframes[1]!.data.orientation!.real).toBeCloseTo(Math.SQRT1_2, 10);
  expect(keyframes[2]!.data.orientation!.real).toBeCloseTo(0, 10);
  expect(new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate).clockwise).toBe(
    twizzle.clockwise,
  );
});

test("Twizzles rotate the same way as three-turns on the same foot, direction, and edge", () => {
  expect(makeTwizzle("LeftForwardInsideTwizzle1.5").clockwise).toBe(true);
  expect(makeTwizzle("LeftBackwardOutsideTwizzle1.5").clockwise).toBe(
    new LeftBackwardOutsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate).clockwise,
  );
  expect(makeTwizzle("RightForwardInsideTwizzle1.5").clockwise).toBe(false);
});

test("A twizzle round-trips through its type", () => {
  const start = 0.2 as PathCoordinate;
  const end = 0.8 as PathCoordinate;
  const replacement = changeElementType("LeftForwardInsideTwizzle1.5", {
    type: "LeftForwardInsideThreeTurn",
    start,
    end,
  });

  expect(replacement).toBeInstanceOf(Twizzle);
  expect((replacement.toJSON() as { type: string }).type).toBe("LeftForwardInsideTwizzle1.5");

  const again = changeFootTurnType("LeftForwardInsideTwizzle2", {
    type: "LeftForwardInsideTwizzle1.5",
    start,
    end,
  });
  expect(again).toBeInstanceOf(Twizzle);
  expect((again.toJSON() as { type: string }).type).toBe("LeftForwardInsideTwizzle2");
});

test("Twizzles reject turn counts outside 0.5 to 5.5 in 0.5 steps", () => {
  expect(() =>
    changeFootTurnType("LeftForwardInsideTwizzle1.7", { type: "LeftForwardInsideTwizzle1.5", start: 0, end: 1 }),
  ).toThrow(/Unknown foot turn type/);
  expect(() =>
    changeFootTurnType("LeftForwardInsideTwizzle0.25", { type: "LeftForwardInsideTwizzle1.5", start: 0, end: 1 }),
  ).toThrow(/Unknown foot turn type/);
  expect(() =>
    changeFootTurnType("LeftForwardInsideTwizzle6", { type: "LeftForwardInsideTwizzle1.5", start: 0, end: 1 }),
  ).toThrow(/Unknown foot turn type/);
});

test("A twizzle constructor rejects bad turn counts and takes good ones", () => {
  class TestTwizzle extends Twizzle {
    get type(): string {
      return "TestTwizzle";
    }

    get defaultShortName(): string {
      return "T";
    }
  }
  const flags = { left: true, forward: true, inside: true };

  for (const turns of [0, 0.25, 0.4, 0.75, 1.25, 5.75, 6, Number.NaN]) {
    expect(() => new TestTwizzle("footL", flags, 0.25 as PathCoordinate, 0.75 as PathCoordinate, turns)).toThrow(
      /turn count/,
    );
  }
  for (const turns of [0.5, 1, 1.5, 3, 5, 5.5]) {
    expect(() => new TestTwizzle("footL", flags, 0.25 as PathCoordinate, 0.75 as PathCoordinate, turns)).not.toThrow();
  }
});

test("The twizzle registry holds every variant", () => {
  const keys = Object.keys(twizzleConstructorsByType);
  const pattern = /^(Left|Right)(Forward|Backward)(Inside|Outside)Twizzle(0\.5|1|1\.5|2|2\.5|3|3\.5|4|4\.5|5|5\.5)$/;

  expect(keys).toHaveLength(88);
  for (const key of keys) {
    expect(key).toMatch(pattern);
  }
});

test("The twizzle turn counts go from 0.5 to 5.5 in 0.5 steps", () => {
  expect(twizzleTurns).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
});

test("The twizzle kind choices cover every variant", () => {
  expect(twizzleKindChoices).toHaveLength(88);
  const types = twizzleKindChoices.map((choice) => choice.type);
  expect(types).toContain("LeftForwardInsideTwizzle1.5");
  expect(types).toContain("RightBackwardOutsideTwizzle2.5");
  expect(types).toContain("LeftForwardInsideTwizzle0.5");
});
