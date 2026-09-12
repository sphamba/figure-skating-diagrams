import { describe, expect, test } from "vitest";
import { BothForwardGlide } from "../src/engine/element/glide.js";
import { LeftNormalForwardInsideGlide } from "../src/engine/element/stroke.js";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn.js";
import { twizzleConstructorsByType } from "../src/engine/element/twizzle.js";
import { LeftForwardOpenMohawk } from "../src/engine/element/mohawk.js";
import { changeElementType } from "../src/engine/element/turnTypes.js";
import { parseVariantFlags } from "../src/engine/element/variantFlags.js";
import type { Element } from "../src/engine/element/element.js";
import type { PathCoordinate } from "../src/engine/coordinates.js";

describe("parseVariantFlags", () => {
  test("parses a two-feet glide", () => {
    expect(parseVariantFlags("BothForwardGlide")).toEqual({ twoFoot: true, direction: "Forward" });
    expect(parseVariantFlags("BothBackwardGlide")).toEqual({ twoFoot: true, direction: "Backward" });
  });

  test("parses a glide with an edge", () => {
    expect(parseVariantFlags("LeftForwardInsideGlide")).toEqual({
      side: "Left",
      direction: "Forward",
      edge: "Inside",
    });
    expect(parseVariantFlags("LeftForwardGlide")).toEqual({
      side: "Left",
      direction: "Forward",
      edge: "Neither",
    });
  });

  test("parses a stroke", () => {
    expect(parseVariantFlags("LeftCrossedForwardInsideGlide")).toEqual({
      side: "Left",
      stroke: "Crossed",
      direction: "Forward",
      edge: "Inside",
    });
    expect(parseVariantFlags("LeftCrossedBackBackwardOutsideGlide")).toEqual({
      side: "Left",
      stroke: "CrossedBack",
      direction: "Backward",
      edge: "Outside",
    });
    expect(parseVariantFlags("RightNormalForwardNeitherGlide")).toEqual({
      side: "Right",
      stroke: "Normal",
      direction: "Forward",
      edge: "Neither",
    });
  });

  test("parses one-foot turns", () => {
    expect(parseVariantFlags("LeftForwardInsideThreeTurn")).toEqual({
      side: "Left",
      direction: "Forward",
      edge: "Inside",
      group: "ThreeTurn",
    });
    expect(parseVariantFlags("RightBackwardOutsideBracket")).toEqual({
      side: "Right",
      direction: "Backward",
      edge: "Outside",
      group: "Bracket",
    });
    expect(parseVariantFlags("LeftForwardInsideLoop")).toEqual({
      side: "Left",
      direction: "Forward",
      edge: "Inside",
      group: "Loop",
    });
  });

  test("parses a twizzle with its turn count", () => {
    expect(parseVariantFlags("LeftForwardInsideTwizzle2.5")).toEqual({
      side: "Left",
      direction: "Forward",
      edge: "Inside",
      group: "Twizzle",
      turns: "2.5",
    });
  });

  test("parses two-feet turns", () => {
    expect(parseVariantFlags("LeftBackwardClosedMohawk")).toEqual({
      side: "Left",
      direction: "Backward",
      group: "Mohawk",
      openness: "Closed",
    });
    expect(parseVariantFlags("RightForwardOpenChoctaw")).toEqual({
      side: "Right",
      direction: "Forward",
      group: "Choctaw",
      openness: "Open",
    });
  });
});

describe("element short names", () => {
  test("shortName defaults to defaultShortName", () => {
    const threeTurn = new LeftForwardInsideThreeTurn("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
    expect(threeTurn.defaultShortName).toBe("LFI3");
    expect(threeTurn.shortName).toBe("LFI3");
    expect(new BothForwardGlide(0 as PathCoordinate, 1 as PathCoordinate).shortName).toBe("");
  });

  test("changeElementType applies the short name from the template", () => {
    const element = changeElementType("LeftBackwardOutsideBracket", {
      type: "LeftBackwardOutsideBracket",
      start: 0,
      end: 1,
      shortName: "custom",
    });
    expect(element.shortName).toBe("custom");
  });

  test("shortName survives a JSON round trip", () => {
    const glide = new LeftNormalForwardInsideGlide(0 as PathCoordinate, 1 as PathCoordinate);
    glide.shortName = "myNumber";
    const restoration = changeElementType("LeftNormalForwardInsideGlide", {
      type: "LeftNormalForwardInsideGlide",
      start: 0,
      end: 1,
      shortName: glide.toJSON().shortName,
    });
    expect(restoration.shortName).toBe("myNumber");

    const TwizzleVariant = twizzleConstructorsByType["LeftForwardInsideTwizzle1"]!;
    const twizzle = new TwizzleVariant("footL", 0 as PathCoordinate, 1 as PathCoordinate) as Element;
    twizzle.shortName = "twist";
    const twizzleRound = changeElementType("LeftForwardInsideTwizzle1", {
      type: "LeftForwardInsideTwizzle1",
      start: 0,
      end: 1,
      shortName: twizzle.toJSON()["shortName"],
    });
    expect(twizzleRound.shortName).toBe("twist");
  });

  test("a mohawk keeps its default short name after construction", () => {
    const mohawk = new LeftForwardOpenMohawk("footL", 0.25 as PathCoordinate, 0.75 as PathCoordinate);
    expect(mohawk.shortName).toBe("opMo");
  });
});
