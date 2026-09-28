// @vitest-environment node
import { expect, test } from "vitest";
import type { PathCoordinate } from "../src/engine/coordinates";
import type { FootKeyframe, HipsKeyframe } from "../src/engine/keyframe";
import { Quaternion } from "../src/engine/quaternion";
import { mirrorElement } from "../src/engine/element/turnTypes";
import { BothForwardGlide, LeftForwardInsideGlide, glideConstructorsByType } from "../src/engine/element/glide";
import { LeftNormalForwardInsideGlide } from "../src/engine/element/stroke";
import { LeftForwardInsideThreeTurn } from "../src/engine/element/threeTurn";
import { twizzleConstructorsByType } from "../src/engine/element/twizzle";
import { LeftForwardOpenMohawk } from "../src/engine/element/mohawk";
import { LeftBackwardClosedChoctaw } from "../src/engine/element/choctaw";
import { LeftForwardOutsideRocker } from "../src/engine/element/rocker";
import { LeftBackwardInsideCounter } from "../src/engine/element/counter";
import { LeftForwardInsideBracket } from "../src/engine/element/bracket";
import { jumpConstructorsByType, type Jump } from "../src/engine/element/jump";
import { halfBladeLength, spinConstructorsByType, type Spin } from "../src/engine/element/spin";
import { Vector } from "../src/engine/vector";

const start = 0 as PathCoordinate;
const end = 2 as PathCoordinate;
// A probe vector turns orientation comparisons into rotation comparisons: a
// yaw of PI has two quaternion representations that are the same rotation.
const PROBE = new Vector<3>(1, 2, 3);

function rotatedBy(quaternion: Quaternion, probe: Vector<3>): Vector<3> {
  return probe.copy().rotate(quaternion);
}

function positionCoordinates(position: NonNullable<FootKeyframe["data"]["position"]>): {
  x?: number;
  y?: number;
  z?: number;
} {
  return { x: position.x, y: position.y, z: position.z };
}

function expectCoordinate(actual: number | undefined, expected: number | undefined) {
  if (expected === undefined) expect(actual).toBeUndefined();
  else expect(actual).toBeCloseTo(expected, 10);
}

// The hips mirror property: the mirrored element's hips keyframes sit at the
// same coordinates with the same positions, and their orientations rotate the
// probe to the conjugate rotation of the ground keyframes.
function expectMirroredHips(mirrored: HipsKeyframe[], ground: HipsKeyframe[]) {
  expect(mirrored).toHaveLength(ground.length);
  for (let index = 0; index < mirrored.length; index++) {
    expect(mirrored[index]!.coordinate).toBeCloseTo(ground[index]!.coordinate, 10);
    const mirroredData = mirrored[index]!.data;
    const groundData = ground[index]!.data;
    if (groundData.position === undefined) {
      expect(mirroredData.position).toBeUndefined();
    } else {
      for (const axis of [0, 1, 2] as const) {
        expect(mirroredData.position!.data[axis]).toBeCloseTo(groundData.position.data[axis], 10);
      }
    }
    const mirroredRotation = rotatedBy(mirroredData.orientation!, PROBE);
    const conjugatedRotation = rotatedBy(groundData.orientation!.copy().conjugate(), PROBE);
    expect(mirroredRotation.x).toBeCloseTo(conjugatedRotation.x, 10);
    expect(mirroredRotation.y).toBeCloseTo(conjugatedRotation.y, 10);
    expect(mirroredRotation.z).toBeCloseTo(conjugatedRotation.z, 10);
  }
}

// The mirror property: the mirrored element's swapped-foot keyframes equal the
// pointwise mirror of the ground keyframes. x and z stay, y flips (partial
// positions keep unset coordinates), the orientation rotation equals the
// conjugate's rotation, and coordinate, contact point and toe pick stay.
function expectMirroredKeyframes(mirrored: FootKeyframe[], ground: FootKeyframe[]) {
  expect(mirrored).toHaveLength(ground.length);
  for (let index = 0; index < mirrored.length; index++) {
    const mirroredKeyframe = mirrored[index]!;
    const groundKeyframe = ground[index]!;
    expect(mirroredKeyframe.coordinate).toBeCloseTo(groundKeyframe.coordinate, 10);

    const mirroredData = mirroredKeyframe.data;
    const groundData = groundKeyframe.data;
    if (groundData.position === undefined) {
      expect(mirroredData.position).toBeUndefined();
    } else {
      const mirroredPosition = positionCoordinates(mirroredData.position!);
      const groundPosition = positionCoordinates(groundData.position);
      expectCoordinate(mirroredPosition.x, groundPosition.x);
      if (groundPosition.y === undefined) expect(mirroredPosition.y).toBeUndefined();
      else expect(mirroredPosition.y).toBeCloseTo(-groundPosition.y, 10);
      expectCoordinate(mirroredPosition.z, groundPosition.z);
    }

    if (groundData.contactPoint === undefined) expect(mirroredData.contactPoint).toBeUndefined();
    else expect(mirroredData.contactPoint).toBe(groundData.contactPoint);
    if (groundData.toePick === undefined) expect(mirroredData.toePick).toBeUndefined();
    else expect(mirroredData.toePick).toBe(groundData.toePick);

    if (groundData.orientation === undefined) {
      expect(mirroredData.orientation).toBeUndefined();
    } else {
      const mirroredRotation = rotatedBy(mirroredData.orientation!, PROBE);
      const conjugatedRotation = rotatedBy(groundData.orientation.copy().conjugate(), PROBE);
      expect(mirroredRotation.x).toBeCloseTo(conjugatedRotation.x, 10);
      expect(mirroredRotation.y).toBeCloseTo(conjugatedRotation.y, 10);
      expect(mirroredRotation.z).toBeCloseTo(conjugatedRotation.z, 10);
    }

    if (groundData.spins === undefined) expect(mirroredData.spins).toBeUndefined();
    else expect(mirroredData.spins).toBeCloseTo(-groundData.spins, 10);
    if (groundData.spinShift === undefined) expect(mirroredData.spinShift).toBeUndefined();
    else expect(mirroredData.spinShift).toBeCloseTo(-groundData.spinShift, 10);
  }
}

test("mirrorElement swaps the side of a glide and mirrors its keyframes", () => {
  const glide = new LeftForwardInsideGlide(start, end);
  const mirrored = mirrorElement(glide);

  expect(mirrored.type).toBe("RightForwardInsideGlide");
  expect(mirrored.shortName).toBe("RFI");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), glide.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), glide.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of a stroke glide", () => {
  const stroke = new LeftNormalForwardInsideGlide(start, end);
  const mirrored = mirrorElement(stroke);

  expect(mirrored.type).toBe("RightNormalForwardInsideGlide");
  expect(mirrored.shortName).toBe("RFI");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), stroke.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), stroke.getLeftFootKeyframes());
});

test("mirrorElement swaps the front foot of a two-feet pose glide", () => {
  const poseGlide = new glideConstructorsByType["SpreadEagleLeftFrontGlide"]!(start, end);
  const mirrored = mirrorElement(poseGlide);

  expect(mirrored.type).toBe("SpreadEagleRightFrontGlide");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), poseGlide.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), poseGlide.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of a three turn and regenerates the default short name", () => {
  const turn = new LeftForwardInsideThreeTurn("footL", start, end);
  expect(turn.shortName).toBe("LFI3");
  const mirrored = mirrorElement(turn);

  expect(mirrored.type).toBe("RightForwardInsideThreeTurn");
  expect(mirrored.shortName).toBe("RFI3");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), turn.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), turn.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of a twizzle and keeps the turn count", () => {
  const twizzle = new twizzleConstructorsByType["LeftForwardOutsideTwizzle1"]!("footL", start, end);
  const mirrored = mirrorElement(twizzle);

  expect(mirrored.type).toBe("RightForwardOutsideTwizzle1");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), twizzle.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), twizzle.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of a mohawk", () => {
  const mohawk = new LeftForwardOpenMohawk("footL", start, end);
  const mirrored = mirrorElement(mohawk);

  expect(mirrored.type).toBe("RightForwardOpenMohawk");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), mohawk.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), mohawk.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of a choctaw", () => {
  const choctaw = new LeftBackwardClosedChoctaw("footL", start, end);
  const mirrored = mirrorElement(choctaw);

  expect(mirrored.type).toBe("RightBackwardClosedChoctaw");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), choctaw.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), choctaw.getLeftFootKeyframes());
});

test("mirrorElement swaps the side and the handedness of a spin", () => {
  const spin = new spinConstructorsByType["LeftInsideSpin"]!(start, end, false, "camel", 3);
  const mirrored = mirrorElement(spin) as Spin;

  expect(mirrored.type).toBe("RightInsideSpin");
  expect(mirrored.leftHanded).toBe(true);
  expect(mirrored.spinType).toBe("camel");
  expect(mirrored.revolutions).toBe(3);
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  // The on-ice foot swaps with the type side.
  expect(spin.onIceFoot).toBe("footL");
  expect(mirrored.onIceFoot).toBe("footR");

  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), spin.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), spin.getLeftFootKeyframes());
  expectMirroredHips(mirrored.getHipsKeyframes(), spin.getHipsKeyframes());

  // The spin circle lands on the other side with the reversed spin count.
  const mirroredSpinKeyframe = mirrored
    .getRightFootKeyframes()
    .find((keyframe) => keyframe.data.spinShift !== undefined)!;
  expect(mirroredSpinKeyframe.data.spinShift).toBeCloseTo(-halfBladeLength, 10);
  expect(mirroredSpinKeyframe.data.spins).toBeCloseTo(-3, 10);
});

test("mirrorElement flips the handedness of a jump and mirrors its keyframes", () => {
  const jump = new jumpConstructorsByType["ToeLoop1"]!(start, end) as Jump;
  const mirrored = mirrorElement(jump) as Jump;

  expect(mirrored.type).toBe("ToeLoop1");
  expect(mirrored.leftHanded).toBe(true);
  // The type carries no side, so the take-off and landing feet swap.
  expect(jump.takeOffFoot).toBe("footR");
  expect(mirrored.takeOffFoot).toBe("footL");
  expect(mirrored.landFoot).toBe("footL");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);

  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), jump.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), jump.getLeftFootKeyframes());
  expectMirroredHips(mirrored.getHipsKeyframes(), jump.getHipsKeyframes());
});

test("mirrorElement swaps the side of a fractional twizzle and keeps the turn count", () => {
  const twizzle = new twizzleConstructorsByType["LeftForwardInsideTwizzle1.5"]!("footL", start, end);
  const mirrored = mirrorElement(twizzle);

  expect(mirrored.type).toBe("RightForwardInsideTwizzle1.5");
  expect((mirrored as unknown as { turns: number }).turns).toBe(1.5);
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), twizzle.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), twizzle.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of crossed and crossed-back strokes", () => {
  const crossed = new glideConstructorsByType["LeftCrossedForwardInsideGlide"]!(start, end);
  const mirroredCrossed = mirrorElement(crossed);
  expect(mirroredCrossed.type).toBe("RightCrossedForwardInsideGlide");
  expect(mirroredCrossed.start).toBe(start);
  expect(mirroredCrossed.end).toBe(end);
  expectMirroredKeyframes(mirroredCrossed.getLeftFootKeyframes(), crossed.getRightFootKeyframes());
  expectMirroredKeyframes(mirroredCrossed.getRightFootKeyframes(), crossed.getLeftFootKeyframes());

  const crossedBack = new glideConstructorsByType["LeftCrossedBackBackwardOutsideGlide"]!(start, end);
  const mirroredCrossedBack = mirrorElement(crossedBack);
  expect(mirroredCrossedBack.type).toBe("RightCrossedBackBackwardOutsideGlide");
  expectMirroredKeyframes(mirroredCrossedBack.getLeftFootKeyframes(), crossedBack.getRightFootKeyframes());
  expectMirroredKeyframes(mirroredCrossedBack.getRightFootKeyframes(), crossedBack.getLeftFootKeyframes());
});

test("mirrorElement swaps the side of rockers, counters and brackets", () => {
  const rocker = new LeftForwardOutsideRocker("footL", start, end);
  const mirroredRocker = mirrorElement(rocker);
  expect(mirroredRocker.type).toBe("RightForwardOutsideRocker");
  expectMirroredKeyframes(mirroredRocker.getLeftFootKeyframes(), rocker.getRightFootKeyframes());
  expectMirroredKeyframes(mirroredRocker.getRightFootKeyframes(), rocker.getLeftFootKeyframes());

  const counter = new LeftBackwardInsideCounter("footL", start, end);
  const mirroredCounter = mirrorElement(counter);
  expect(mirroredCounter.type).toBe("RightBackwardInsideCounter");
  expectMirroredKeyframes(mirroredCounter.getLeftFootKeyframes(), counter.getRightFootKeyframes());
  expectMirroredKeyframes(mirroredCounter.getRightFootKeyframes(), counter.getLeftFootKeyframes());

  const bracket = new LeftForwardInsideBracket("footL", start, end);
  const mirroredBracket = mirrorElement(bracket);
  expect(mirroredBracket.type).toBe("RightForwardInsideBracket");
  expectMirroredKeyframes(mirroredBracket.getLeftFootKeyframes(), bracket.getRightFootKeyframes());
  expectMirroredKeyframes(mirroredBracket.getRightFootKeyframes(), bracket.getLeftFootKeyframes());
});

test("mirrorElement flips the handedness of an Euler and swaps its feet", () => {
  const euler = new jumpConstructorsByType["Euler1"]!(start, end) as Jump;
  const mirrored = mirrorElement(euler) as Jump;

  expect(mirrored.type).toBe("Euler1");
  expect(mirrored.leftHanded).toBe(true);
  // The Euler lands on its take-off foot's opposite: the mirror swaps both.
  expect(euler.takeOffFoot).toBe("footR");
  expect(euler.landFoot).toBe("footL");
  expect(mirrored.takeOffFoot).toBe("footL");
  expect(mirrored.landFoot).toBe("footR");
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), euler.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), euler.getLeftFootKeyframes());
  expectMirroredHips(mirrored.getHipsKeyframes(), euler.getHipsKeyframes());
});

test("mirrorElement keeps a two-feet glide on both feet with swapped sides", () => {
  const glide = new BothForwardGlide(start, end);
  const mirrored = mirrorElement(glide);

  expect(mirrored.type).toBe("BothForwardGlide");
  expect(mirrored).not.toBe(glide);
  expect(mirrored.start).toBe(start);
  expect(mirrored.end).toBe(end);
  // Both feet swap sides under the mirror.
  expectMirroredKeyframes(mirrored.getLeftFootKeyframes(), glide.getRightFootKeyframes());
  expectMirroredKeyframes(mirrored.getRightFootKeyframes(), glide.getLeftFootKeyframes());
});

test("a custom short name survives the mirror", () => {
  const turn = new LeftForwardInsideThreeTurn("footL", start, end);
  turn.shortName = "custom";
  const mirrored = mirrorElement(turn);

  expect(mirrored.type).toBe("RightForwardInsideThreeTurn");
  expect(mirrored.shortName).toBe("custom");
});
